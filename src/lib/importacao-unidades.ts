import { z } from "zod";
import { lerCsv } from "./csv";
import { parseValorReais } from "./dinheiro";

export const MAX_LINHAS = 2000;

const ALIASES: Record<string, string> = {
  bloco: "bloco",
  torre: "bloco",
  unidade: "unidade",
  apartamento: "unidade",
  apto: "unidade",
  nome: "nome",
  proprietario: "nome",
  morador: "nome",
  documento: "documento",
  cpf: "documento",
  email: "email",
  "e-mail": "email",
  telefone: "telefone",
  celular: "telefone",
  tipo: "tipo",
  vinculo: "tipo",
  situacao: "tipo",
  valor_cota: "valor_cota",
  "valor da cota": "valor_cota",
  cota: "valor_cota",
  valor: "valor_cota",
};

const linhaSchema = z.object({
  bloco: z.string().trim().max(60).optional(),
  unidade: z.string().trim().min(1, "unidade é obrigatória").max(30),
  nome: z.string().trim().max(120).optional(),
  documento: z.string().trim().max(30).optional(),
  email: z.union([z.literal(""), z.email("e-mail inválido")]).optional(),
  telefone: z.string().trim().max(30).optional(),
  tipo: z.string().trim().max(30).optional(),
  valor_cota: z.string().trim().max(30).optional(),
});

export type TipoVinculo = "proprietario" | "inquilino";
export type LinhaImportacao = Omit<z.infer<typeof linhaSchema>, "tipo" | "valor_cota"> & {
  tipo?: TipoVinculo;
  /** Valor mensal da cota da unidade, em centavos. */
  valor_cota_centavos?: number;
};
export type ErroLinha = { linha: number; mensagem: string };

const TIPOS: Record<string, TipoVinculo> = {
  proprietario: "proprietario",
  proprietaria: "proprietario",
  dono: "proprietario",
  dona: "proprietario",
  inquilino: "inquilino",
  inquilina: "inquilino",
  locatario: "inquilino",
  locataria: "inquilino",
  morador: "inquilino",
  moradora: "inquilino",
};

const normalizar = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .trim()
    .toLowerCase();

export type ResultadoPlanilha = { linhas: LinhaImportacao[]; erros: ErroLinha[] };

export function interpretarPlanilha(texto: string): ResultadoPlanilha {
  return interpretarMatriz(lerCsv(texto));
}

/** `linha` nos erros é o número da linha no arquivo (cabeçalho = 1). */
export function interpretarMatriz(matriz: string[][]): ResultadoPlanilha {
  if (matriz.length < 2) {
    return { linhas: [], erros: [{ linha: 1, mensagem: "Planilha vazia ou sem cabeçalho" }] };
  }
  if (matriz.length - 1 > MAX_LINHAS) {
    return {
      linhas: [],
      erros: [{ linha: 1, mensagem: `Máximo de ${MAX_LINHAS} linhas por importação` }],
    };
  }

  const colunas = matriz[0].map((h) => ALIASES[normalizar(h)]);
  if (!colunas.includes("unidade")) {
    return {
      linhas: [],
      erros: [{ linha: 1, mensagem: "Cabeçalho precisa ter a coluna 'unidade'" }],
    };
  }

  const linhas: LinhaImportacao[] = [];
  const erros: ErroLinha[] = [];
  const vistos = new Set<string>();

  matriz.slice(1).forEach((celulas, i) => {
    const numero = i + 2;
    const bruto: Record<string, string> = {};
    colunas.forEach((col, idx) => {
      if (col) bruto[col] = celulas[idx] ?? "";
    });

    const r = linhaSchema.safeParse(bruto);
    if (!r.success) {
      erros.push({ linha: numero, mensagem: r.error.issues.map((x) => x.message).join("; ") });
      return;
    }

    const tipoBruto = r.data.tipo ? normalizar(r.data.tipo) : "";
    const tipo = tipoBruto === "" ? "proprietario" : TIPOS[tipoBruto];
    if (!tipo) {
      erros.push({ linha: numero, mensagem: "tipo deve ser proprietário ou inquilino" });
      return;
    }

    let valorCota: number | undefined;
    if (r.data.valor_cota) {
      const v = parseValorReais(r.data.valor_cota);
      if (v === null) {
        erros.push({ linha: numero, mensagem: "valor da cota inválido (ex.: 450,00)" });
        return;
      }
      valorCota = v;
    }

    // Mesma unidade em várias linhas é permitido (vários proprietários), mas o par
    // unidade+nome não pode se repetir.
    const chave = `${r.data.bloco ?? ""}|${r.data.unidade}|${r.data.nome ?? ""}`.toLowerCase();
    if (vistos.has(chave)) {
      erros.push({ linha: numero, mensagem: "linha duplicada (mesma unidade e nome)" });
      return;
    }
    vistos.add(chave);
    const { valor_cota: _bruto, ...resto } = r.data;
    void _bruto;
    linhas.push({ ...resto, tipo, ...(valorCota !== undefined ? { valor_cota_centavos: valorCota } : {}) });
  });

  return { linhas, erros };
}
