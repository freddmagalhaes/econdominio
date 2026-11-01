"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { percentualParaBps } from "@/lib/dinheiro";
import { createClient } from "@/lib/supabase/server";

export type EstadoGarantidora = { erro?: string; aviso?: string };

const data = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida");
const competencia = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Competência inválida");

const atualizar = (condominioId: string) => revalidatePath(`/condominios/${condominioId}/garantidora`);

function lerCampos(formData: FormData, chaves: string[]) {
  return Object.fromEntries(chaves.map((k) => [k, formData.get(k) ?? undefined]));
}

export async function criarGarantidora(
  _: EstadoGarantidora,
  formData: FormData,
): Promise<EstadoGarantidora> {
  const dados = z
    .object({
      condominioId: z.uuid(),
      nome: z.string().trim().min(2, "Informe o nome").max(120),
      documento: z.string().trim().max(30).optional(),
    })
    .safeParse(lerCampos(formData, ["condominioId", "nome", "documento"]));
  if (!dados.success) return { erro: dados.error.issues[0].message };

  const supabase = await createClient();
  const { data: cond } = await supabase
    .from("condominio")
    .select("organizacao_id")
    .eq("id", dados.data.condominioId)
    .maybeSingle();
  if (!cond) return { erro: "Condomínio não encontrado" };

  const { error } = await supabase.from("garantidora").insert({
    organizacao_id: cond.organizacao_id,
    nome: dados.data.nome,
    documento: dados.data.documento || null,
  });
  if (error) return { erro: "Não foi possível cadastrar (apenas administradores da organização)" };

  atualizar(dados.data.condominioId);
  return {};
}

export async function criarContrato(
  _: EstadoGarantidora,
  formData: FormData,
): Promise<EstadoGarantidora> {
  const dados = z
    .object({
      condominioId: z.uuid(),
      garantidoraId: z.uuid("Escolha a garantidora"),
      prazo: z.coerce.number().int().min(0).max(365),
      vigenciaInicio: data,
      vigenciaFim: z.union([z.literal(""), data]).optional(),
    })
    .safeParse(
      lerCampos(formData, ["condominioId", "garantidoraId", "prazo", "vigenciaInicio", "vigenciaFim"]),
    );
  if (!dados.success) return { erro: dados.error.issues[0].message };

  let bps: number;
  try {
    bps = percentualParaBps(String(formData.get("taxa") ?? ""));
  } catch {
    return { erro: "Taxa inválida (ex.: 2,5 para 2,5%)" };
  }
  const fim = dados.data.vigenciaFim || null;
  if (fim && fim < dados.data.vigenciaInicio) return { erro: "Fim da vigência anterior ao início" };

  const supabase = await createClient();
  const { error } = await supabase.from("contrato_garantidora").insert({
    condominio_id: dados.data.condominioId,
    garantidora_id: dados.data.garantidoraId,
    taxa_antecipacao_bps: bps,
    prazo_repasse_dias: dados.data.prazo,
    vigencia_inicio: dados.data.vigenciaInicio,
    vigencia_fim: fim,
  });
  if (error) return { erro: "Não foi possível criar o contrato" };

  atualizar(dados.data.condominioId);
  return {};
}

export async function anteciparCompetencia(
  _: EstadoGarantidora,
  formData: FormData,
): Promise<EstadoGarantidora> {
  const dados = z
    .object({ condominioId: z.uuid(), contratoId: z.uuid(), competencia, data })
    .safeParse(lerCampos(formData, ["condominioId", "contratoId", "competencia", "data"]));
  if (!dados.success) return { erro: dados.error.issues[0].message };

  const supabase = await createClient();
  const { data: n, error } = await supabase.rpc("antecipar_competencia", {
    p_contrato: dados.data.contratoId,
    p_competencia: `${dados.data.competencia}-01`,
    p_data: dados.data.data,
  });
  if (error) {
    return {
      erro: error.message.includes("vigência")
        ? "Contrato inativo ou fora da vigência na data informada"
        : "Não foi possível antecipar",
    };
  }

  atualizar(dados.data.condominioId);
  return {
    aviso:
      n === 0
        ? "Nenhuma cota elegível: já antecipadas, pagas ou inexistentes nesse mês."
        : `${n} cotas antecipadas.`,
  };
}

export async function registrarRepasse(
  _: EstadoGarantidora,
  formData: FormData,
): Promise<EstadoGarantidora> {
  const dados = z
    .object({ condominioId: z.uuid(), repasseId: z.uuid(), data })
    .safeParse(lerCampos(formData, ["condominioId", "repasseId", "data"]));
  if (!dados.success) return { erro: dados.error.issues[0].message };

  const supabase = await createClient();
  const { error } = await supabase.rpc("registrar_repasse", {
    p_repasse: dados.data.repasseId,
    p_data: dados.data.data,
  });
  if (error) return { erro: "Não foi possível registrar o repasse" };

  atualizar(dados.data.condominioId);
  return {};
}
