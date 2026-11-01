"use server";

import { redirect } from "next/navigation";
import { RE_TOKEN, hashToken } from "@/lib/convite";
import { createClient } from "@/lib/supabase/server";

export type EstadoConvite = { erro?: string };

const MENSAGENS: Record<string, string> = {
  convite_invalido: "Convite inválido, expirado ou já utilizado. Peça um novo ao síndico.",
  convite_outro_email: "Este convite foi enviado para outro e-mail. Entre com o e-mail convidado.",
  unidade_ja_vinculada: "Esta unidade já tem um morador com acesso.",
};

export async function aceitarConvite(_: EstadoConvite, formData: FormData): Promise<EstadoConvite> {
  const token = String(formData.get("token") ?? "");
  if (!RE_TOKEN.test(token)) return { erro: MENSAGENS.convite_invalido };

  const supabase = await createClient();
  const { error } = await supabase.rpc("aceitar_convite", { p_token_hash: hashToken(token) });
  if (error) {
    const codigo = Object.keys(MENSAGENS).find((c) => error.message.includes(c));
    return { erro: codigo ? MENSAGENS[codigo] : "Não foi possível aceitar o convite" };
  }

  redirect("/portal");
}
