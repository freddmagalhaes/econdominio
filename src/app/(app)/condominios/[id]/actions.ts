"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { parseValorReais } from "@/lib/dinheiro";
import { createClient } from "@/lib/supabase/server";
import { interpretarMatriz, interpretarPlanilha, type ErroLinha, type ResultadoPlanilha } from "@/lib/importacao-unidades";
import { ErroXlsx, lerXlsx } from "@/lib/xlsx";

const MAX_BYTES = 1024 * 1024;

export type EstadoImportacao = {
  erro?: string;
  erros?: ErroLinha[];
  resumo?: {
    linhas: number;
    blocos_novos: number;
    unidades_novas: number;
    pessoas_novas: number;
    vinculos_novos: number;
  };
};

export async function importarUnidades(
  _: EstadoImportacao,
  formData: FormData,
): Promise<EstadoImportacao> {
  const condominioId = z.uuid().safeParse(formData.get("condominioId"));
  if (!condominioId.success) return { erro: "Condomínio inválido" };

  const arquivo = formData.get("arquivo");
  if (!(arquivo instanceof File) || arquivo.size === 0) return { erro: "Selecione um arquivo CSV ou XLSX" };
  if (arquivo.size > MAX_BYTES) return { erro: "Arquivo maior que 1 MB" };

  const nome = arquivo.name.toLowerCase();
  let resultado: ResultadoPlanilha;
  if (nome.endsWith(".xlsx")) {
    try {
      resultado = interpretarMatriz(await lerXlsx(Buffer.from(await arquivo.arrayBuffer())));
    } catch (e) {
      return { erro: e instanceof ErroXlsx ? e.message : "Não foi possível ler o arquivo" };
    }
  } else if (nome.endsWith(".csv")) {
    resultado = interpretarPlanilha(await arquivo.text());
  } else {
    return { erro: "Formato não suportado: envie um arquivo .xlsx ou .csv" };
  }
  const { linhas, erros } = resultado;
  // Tudo ou nada: se houver qualquer erro, nada é gravado.
  if (erros.length > 0) return { erros: erros.slice(0, 50) };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("importar_unidades", {
    p_condominio: condominioId.data,
    p_linhas: linhas,
  });
  if (error) return { erro: "Não foi possível importar. Verifique suas permissões e tente novamente." };

  revalidatePath(`/condominios/${condominioId.data}`);
  return { resumo: data };
}

export type EstadoValorCota = { erro?: string; aviso?: string };

/** Define (ou limpa, se vazio) o valor mensal da cota de uma unidade. */
export async function definirValorUnidade(_: EstadoValorCota, formData: FormData): Promise<EstadoValorCota> {
  const dados = z
    .object({ condominioId: z.uuid(), unidadeId: z.uuid(), valor: z.string().trim().max(30) })
    .safeParse({
      condominioId: formData.get("condominioId"),
      unidadeId: formData.get("unidadeId"),
      valor: formData.get("valor") ?? "",
    });
  if (!dados.success) return { erro: "Dados inválidos" };

  const centavos = dados.data.valor === "" ? null : parseValorReais(dados.data.valor);
  if (dados.data.valor !== "" && centavos === null) return { erro: "Valor inválido (ex.: 450,00)" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("unidade")
    .update({ valor_cota_centavos: centavos })
    .eq("id", dados.data.unidadeId)
    .eq("condominio_id", dados.data.condominioId);
  if (error) return { erro: "Não foi possível salvar" };

  revalidatePath(`/condominios/${dados.data.condominioId}`);
  return { aviso: "Salvo." };
}

/** Aplica o mesmo valor de cota a todas as unidades do condomínio (atalho; depois cada uma pode ser ajustada). */
export async function definirValorTodas(_: EstadoValorCota, formData: FormData): Promise<EstadoValorCota> {
  const dados = z
    .object({ condominioId: z.uuid(), valor: z.string().trim().max(30) })
    .safeParse({ condominioId: formData.get("condominioId"), valor: formData.get("valor") ?? "" });
  if (!dados.success) return { erro: "Dados inválidos" };

  const centavos = parseValorReais(dados.data.valor);
  if (centavos === null) return { erro: "Informe um valor maior que zero (ex.: 450,00)" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("unidade")
    .update({ valor_cota_centavos: centavos })
    .eq("condominio_id", dados.data.condominioId)
    .select("id");
  if (error) return { erro: "Não foi possível aplicar" };

  revalidatePath(`/condominios/${dados.data.condominioId}`);
  return { aviso: `Valor aplicado a ${data?.length ?? 0} unidades.` };
}
