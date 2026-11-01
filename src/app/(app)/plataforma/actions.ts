"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { enviarEmail } from "@/lib/comunicacao/email";
import { emailConviteGestora } from "@/lib/comunicacao/modelos";
import { gerarToken, urlBase } from "@/lib/convite";
import { createClient } from "@/lib/supabase/server";

export type EstadoPlataforma = { erro?: string; aviso?: string; link?: string };

const MENSAGENS: Record<string, string> = {
  email_invalido: "E-mail inválido",
  ja_cadastrada: "Este e-mail já pertence a uma administradora cadastrada",
  "Sem permissão": "Apenas o administrador da plataforma pode convidar",
};

export async function convidarGestora(_: EstadoPlataforma, formData: FormData): Promise<EstadoPlataforma> {
  const dados = z.object({ email: z.email("E-mail inválido").max(200) }).safeParse({ email: String(formData.get("email") ?? "").trim() });
  if (!dados.success) return { erro: dados.error.issues[0].message };

  const supabase = await createClient();
  const { token, hash } = gerarToken();
  const { data, error } = await supabase.rpc("criar_convite_gestora", { p_email: dados.data.email, p_token_hash: hash });
  if (error) {
    const chave = Object.keys(MENSAGENS).find((c) => error.message.includes(c));
    return { erro: chave ? MENSAGENS[chave] : "Não foi possível criar o convite" };
  }

  const email = (data as { email: string }).email;
  const link = `${urlBase()}/cadastro/${token}`;
  const envio = await enviarEmail({ para: email, ...emailConviteGestora({ link }) });

  revalidatePath("/plataforma");
  // O convite existe de qualquer forma; sem e-mail configurado, o administrador repassa o link manualmente.
  if (!envio.ok) return { erro: `Convite criado, mas o e-mail não foi enviado: ${envio.erro}`, link };
  return { aviso: `Convite enviado para ${email}.` };
}

export async function revogarConviteGestora(_: EstadoPlataforma, formData: FormData): Promise<EstadoPlataforma> {
  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) return { erro: "Dados inválidos" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("revogar_convite_gestora", { p_id: id.data });
  if (error) return { erro: "Não foi possível revogar" };

  revalidatePath("/plataforma");
  return { aviso: "Convite revogado." };
}
