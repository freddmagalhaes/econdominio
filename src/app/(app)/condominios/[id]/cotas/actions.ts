"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { parseValorReais } from "@/lib/dinheiro";
import { createClient } from "@/lib/supabase/server";

export type EstadoCotas = { erro?: string; aviso?: string };

const competencia = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Competência inválida");
const data = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida");

const ERROS_COTA: Record<string, string> = {
  cota_nao_editavel: "Só cotas em aberto podem ser alteradas",
  cota_com_pagamento: "Esta cota já teve pagamento (mesmo estornado): não dá para alterar. Use o estorno.",
  cota_antecipada: "Esta cota foi antecipada pela garantidora e não pode ser alterada",
};

function mensagemCota(erro: string, padrao: string): string {
  const codigo = Object.keys(ERROS_COTA).find((c) => erro.includes(c));
  return codigo ? ERROS_COTA[codigo] : padrao;
}

export async function gerarCotas(_: EstadoCotas, formData: FormData): Promise<EstadoCotas> {
  const dados = z
    .object({
      condominioId: z.uuid(),
      competencia,
      vencimento: data,
      modo: z.enum(["cadastrado", "igual"]),
    })
    .safeParse({
      condominioId: formData.get("condominioId"),
      competencia: formData.get("competencia"),
      vencimento: formData.get("vencimento"),
      modo: formData.get("modo"),
    });
  if (!dados.success) return { erro: dados.error.issues[0].message };

  // "cadastrado": cada unidade usa o seu valor (valor nulo no banco). "igual": um valor para todas.
  let valor: number | null = null;
  if (dados.data.modo === "igual") {
    valor = parseValorReais(String(formData.get("valor") ?? ""));
    if (valor === null) return { erro: "Informe um valor maior que zero (ex.: 450,00)" };
  }

  const supabase = await createClient();
  const { count: semValor } =
    dados.data.modo === "cadastrado"
      ? await supabase
          .from("unidade")
          .select("id", { count: "exact", head: true })
          .eq("condominio_id", dados.data.condominioId)
          .is("valor_cota_centavos", null)
      : { count: 0 };

  const { data: criadas, error } = await supabase.rpc("gerar_cotas", {
    p_condominio: dados.data.condominioId,
    p_competencia: `${dados.data.competencia}-01`,
    p_vencimento: dados.data.vencimento,
    p_valor_centavos: valor,
  });
  if (error) return { erro: "Não foi possível gerar as cotas" };

  revalidatePath(`/condominios/${dados.data.condominioId}/cotas`);
  const ignoradas = semValor ? ` ${semValor} unidade(s) ficaram de fora por não terem valor de cota cadastrado.` : "";
  if (criadas === 0) {
    return { aviso: `Nenhuma cota nova: já existiam ou não há unidade com valor.${ignoradas}` };
  }
  return semValor
    ? { erro: `${criadas} cotas geradas.${ignoradas}` }
    : { aviso: `${criadas} cotas geradas.` };
}

export async function baixarCota(_: EstadoCotas, formData: FormData): Promise<EstadoCotas> {
  const dados = z
    .object({ condominioId: z.uuid(), cotaId: z.uuid(), pagoEm: data })
    .safeParse({
      condominioId: formData.get("condominioId"),
      cotaId: formData.get("cotaId"),
      pagoEm: formData.get("pagoEm"),
    });
  if (!dados.success) return { erro: dados.error.issues[0].message };

  const valor = parseValorReais(String(formData.get("valor") ?? ""));
  if (valor === null) return { erro: "Valor inválido" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("registrar_pagamento", {
    p_cota: dados.data.cotaId,
    p_valor_centavos: valor,
    p_pago_em: dados.data.pagoEm,
  });
  if (error) {
    return {
      erro: error.message.includes("excede")
        ? "Pagamento maior que o saldo da cota"
        : "Não foi possível registrar o pagamento",
    };
  }

  revalidatePath(`/condominios/${dados.data.condominioId}/cotas`);
  return {};
}

export async function estornarCota(_: EstadoCotas, formData: FormData): Promise<EstadoCotas> {
  const dados = z
    .object({ condominioId: z.uuid(), cotaId: z.uuid() })
    .safeParse({
      condominioId: formData.get("condominioId"),
      cotaId: formData.get("cotaId"),
    });
  if (!dados.success) return { erro: "Dados inválidos" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("estornar_ultimo_pagamento", { p_cota: dados.data.cotaId });
  if (error) return { erro: "Não foi possível estornar" };

  revalidatePath(`/condominios/${dados.data.condominioId}/cotas`);
  return {};
}

export async function editarCota(_: EstadoCotas, formData: FormData): Promise<EstadoCotas> {
  const dados = z
    .object({ condominioId: z.uuid(), cotaId: z.uuid(), vencimento: data })
    .safeParse({
      condominioId: formData.get("condominioId"),
      cotaId: formData.get("cotaId"),
      vencimento: formData.get("vencimento"),
    });
  if (!dados.success) return { erro: dados.error.issues[0].message };

  const valor = parseValorReais(String(formData.get("valor") ?? ""));
  if (valor === null) return { erro: "Valor inválido (ex.: 450,00)" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("editar_cota", {
    p_cota: dados.data.cotaId,
    p_valor_centavos: valor,
    p_vencimento: dados.data.vencimento,
  });
  if (error) return { erro: mensagemCota(error.message, "Não foi possível salvar a cota") };

  revalidatePath(`/condominios/${dados.data.condominioId}/cotas`);
  return { aviso: "Cota atualizada." };
}

export async function cancelarCota(_: EstadoCotas, formData: FormData): Promise<EstadoCotas> {
  const dados = z
    .object({ condominioId: z.uuid(), cotaId: z.uuid() })
    .safeParse({ condominioId: formData.get("condominioId"), cotaId: formData.get("cotaId") });
  if (!dados.success) return { erro: "Dados inválidos" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("cancelar_cota", { p_cota: dados.data.cotaId });
  if (error) return { erro: mensagemCota(error.message, "Não foi possível cancelar a cota") };

  revalidatePath(`/condominios/${dados.data.condominioId}/cotas`);
  return {};
}
