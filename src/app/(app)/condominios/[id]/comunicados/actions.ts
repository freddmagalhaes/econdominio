"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { enviarPendentes } from "@/lib/comunicacao/enviar-pendentes";
import { enviarWhatsappPendentes, type ResultadoWhatsapp } from "@/lib/comunicacao/enviar-whatsapp";
import { canalWhatsapp } from "@/lib/comunicacao/whatsapp";
import { createClient } from "@/lib/supabase/server";

export type EstadoComunicado = { erro?: string; aviso?: string };

const atualizar = (condominioId: string) => revalidatePath(`/condominios/${condominioId}/comunicados`);

type ResultadoEmail = { enviados: number; falhas: number; primeiroErro?: string; naoConfigurado?: boolean };

/** Resumo das duas filas. `temFalha` decide se a mensagem é exibida como aviso de erro. */
function resumo(
  email: ResultadoEmail,
  whatsapp: ResultadoWhatsapp | null,
  total?: { email: number; whatsapp: number },
): { texto: string; temFalha: boolean } {
  const partes = [
    email.naoConfigurado
      ? "E-mail ainda não configurado: as mensagens ficam pendentes até a configuração"
      : `E-mail: ${email.enviados}${total ? ` de ${total.email}` : ""} enviado(s)`,
  ];
  if (email.falhas > 0) partes[0] += `, ${email.falhas} com falha (${email.primeiroErro})`;

  if (whatsapp && !whatsapp.naoConfigurado) {
    let wa = `WhatsApp: ${whatsapp.enviados}${total ? ` de ${total.whatsapp}` : ""} enviado(s)`;
    if (whatsapp.falhas > 0) wa += `, ${whatsapp.falhas} com falha (${whatsapp.primeiroErro})`;
    if (whatsapp.restantes > 0) wa += `, ${whatsapp.restantes} aguardando a próxima rodada`;
    partes.push(wa);
  }
  const temFalha = email.falhas > 0 || (whatsapp?.falhas ?? 0) > 0;
  return { texto: `${partes.join(". ")}.`, temFalha };
}

export async function publicarComunicado(
  _: EstadoComunicado,
  formData: FormData,
): Promise<EstadoComunicado> {
  const dados = z
    .object({
      condominioId: z.uuid(),
      tipo: z.enum(["aviso", "reuniao"]),
      titulo: z.string().trim().min(2, "Informe o título").max(200),
      corpo: z.string().trim().min(2, "Escreva a mensagem").max(10000),
      dataReuniao: z.string().optional(),
      local: z.string().trim().max(200).optional(),
    })
    .safeParse({
      condominioId: formData.get("condominioId"),
      tipo: formData.get("tipo"),
      titulo: formData.get("titulo"),
      corpo: formData.get("corpo"),
      dataReuniao: formData.get("dataReuniao") || undefined,
      local: formData.get("local") || undefined,
    });
  if (!dados.success) return { erro: dados.error.issues[0].message };

  let dataReuniao: string | null = null;
  if (dados.data.tipo === "reuniao") {
    // O campo datetime-local vem sem fuso; o horário é sempre o de Brasília (UTC-3, sem horário de verão).
    const valor = dados.data.dataReuniao;
    const data = valor && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(valor) ? new Date(`${valor}:00-03:00`) : null;
    if (!data || Number.isNaN(data.getTime())) return { erro: "Informe a data e a hora da reunião" };
    dataReuniao = data.toISOString();
  }

  const whatsappAtivo = canalWhatsapp() !== null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("publicar_comunicado", {
    p_condominio: dados.data.condominioId,
    p_tipo: dados.data.tipo,
    p_titulo: dados.data.titulo,
    p_corpo: dados.data.corpo,
    p_data_reuniao: dataReuniao,
    p_local: dados.data.local ?? null,
    p_whatsapp: whatsappAtivo,
  });
  if (error) return { erro: "Não foi possível publicar o comunicado" };

  const { comunicado_id, destinatarios, destinatarios_whatsapp } = data as {
    comunicado_id: string;
    destinatarios: number;
    destinatarios_whatsapp: number;
  };
  const email = await enviarPendentes(supabase, { comunicadoId: comunicado_id });
  const whatsapp = whatsappAtivo ? await enviarWhatsappPendentes(supabase, { comunicadoId: comunicado_id }) : null;

  atualizar(dados.data.condominioId);
  if (destinatarios === 0 && destinatarios_whatsapp === 0) {
    return { aviso: "Comunicado publicado no portal. Ninguém tem canal autorizado e contato cadastrado para receber." };
  }
  const r = resumo(email, whatsapp, { email: destinatarios, whatsapp: destinatarios_whatsapp });
  return r.temFalha
    ? { erro: `Comunicado publicado no portal. ${r.texto} Dá para reenviar depois.` }
    : { aviso: `Comunicado publicado. ${r.texto}` };
}

export async function reenviarComunicado(
  _: EstadoComunicado,
  formData: FormData,
): Promise<EstadoComunicado> {
  const dados = z
    .object({ condominioId: z.uuid(), comunicadoId: z.uuid() })
    .safeParse({ condominioId: formData.get("condominioId"), comunicadoId: formData.get("comunicadoId") });
  if (!dados.success) return { erro: "Dados inválidos" };

  const supabase = await createClient();
  const email = await enviarPendentes(supabase, { comunicadoId: dados.data.comunicadoId });
  const whatsapp = canalWhatsapp()
    ? await enviarWhatsappPendentes(supabase, { comunicadoId: dados.data.comunicadoId })
    : null;
  atualizar(dados.data.condominioId);

  const nada =
    !email.naoConfigurado && email.enviados === 0 && email.falhas === 0 && (!whatsapp || (whatsapp.enviados === 0 && whatsapp.falhas === 0 && whatsapp.restantes === 0));
  if (nada) return { aviso: "Nada pendente para reenviar." };
  const r = resumo(email, whatsapp);
  return r.temFalha ? { erro: r.texto } : { aviso: r.texto };
}
