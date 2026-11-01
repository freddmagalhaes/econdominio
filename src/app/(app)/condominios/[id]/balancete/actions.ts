"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { reaisParaCentavos } from "@/lib/dinheiro";
import { createClient } from "@/lib/supabase/server";

export type EstadoBalancete = { erro?: string; aviso?: string };

const data = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida");
const atualizar = (condominioId: string) => revalidatePath(`/condominios/${condominioId}/balancete`);

function campos(formData: FormData, chaves: string[]) {
  return Object.fromEntries(chaves.map((k) => [k, formData.get(k) ?? undefined]));
}

export async function criarLancamento(_: EstadoBalancete, formData: FormData): Promise<EstadoBalancete> {
  const dados = z
    .object({
      condominioId: z.uuid(),
      contaId: z.uuid("Escolha a conta"),
      data,
      descricao: z.string().trim().min(2, "Informe a descrição").max(200),
    })
    .safeParse(campos(formData, ["condominioId", "contaId", "data", "descricao"]));
  if (!dados.success) return { erro: dados.error.issues[0].message };

  let valor: number;
  try {
    valor = reaisParaCentavos(String(formData.get("valor") ?? ""));
  } catch {
    return { erro: "Valor inválido (ex.: 1.250,00)" };
  }
  if (valor <= 0) return { erro: "O valor deve ser maior que zero" };

  const supabase = await createClient();
  const { error } = await supabase.from("lancamento").insert({
    condominio_id: dados.data.condominioId,
    conta_id: dados.data.contaId,
    data: dados.data.data,
    valor_centavos: valor,
    descricao: dados.data.descricao,
  });
  if (error) return { erro: "Não foi possível registrar o lançamento" };

  atualizar(dados.data.condominioId);
  return { aviso: "Lançamento registrado." };
}

export async function estornarLancamento(_: EstadoBalancete, formData: FormData): Promise<EstadoBalancete> {
  const dados = z
    .object({ condominioId: z.uuid(), lancamentoId: z.uuid() })
    .safeParse(campos(formData, ["condominioId", "lancamentoId"]));
  if (!dados.success) return { erro: "Dados inválidos" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("estornar_lancamento", { p_lancamento: dados.data.lancamentoId });
  if (error) {
    return {
      erro: error.message.includes("automático")
        ? "Lançamento automático: estorne pela cota ou pela antecipação"
        : "Não foi possível estornar",
    };
  }

  atualizar(dados.data.condominioId);
  return {};
}

export async function criarConta(_: EstadoBalancete, formData: FormData): Promise<EstadoBalancete> {
  const dados = z
    .object({
      condominioId: z.uuid(),
      codigo: z.string().trim().min(1, "Informe o código").max(20),
      nome: z.string().trim().min(2, "Informe o nome").max(120),
      tipo: z.enum(["receita", "despesa"]),
    })
    .safeParse(campos(formData, ["condominioId", "codigo", "nome", "tipo"]));
  if (!dados.success) return { erro: dados.error.issues[0].message };

  const supabase = await createClient();
  const { error } = await supabase.from("conta_contabil").insert({
    condominio_id: dados.data.condominioId,
    codigo: dados.data.codigo,
    nome: dados.data.nome,
    tipo: dados.data.tipo,
  });
  if (error) {
    return { erro: error.code === "23505" ? "Já existe uma conta com esse código" : "Não foi possível criar a conta" };
  }

  atualizar(dados.data.condominioId);
  return { aviso: "Conta criada." };
}
