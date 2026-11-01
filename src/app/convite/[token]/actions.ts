"use server";

import { redirect } from "next/navigation";
import { RE_TOKEN, hashToken } from "@/lib/convite";
import { erroContaJaExiste, validarSenha } from "@/lib/senha";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type EstadoConvite = { erro?: string; jaTemConta?: boolean };

const MENSAGENS: Record<string, string> = {
  convite_invalido: "Convite inválido, expirado ou já utilizado. Peça um novo ao síndico.",
  convite_outro_email: "Este convite foi enviado para outro e-mail. Entre com o e-mail convidado.",
  unidade_ja_vinculada: "Esta unidade já tem um morador com acesso.",
};

/** Já logado com o e-mail convidado: apenas aceita o convite. */
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

/**
 * Sem conta: o link do convite (que só chegou ao e-mail convidado) cria a conta com o e-mail do convite
 * e já o aceita. O e-mail é lido do convite no servidor, nunca do formulário, e o banco só aceita
 * contas criadas pelo servidor (origem "convite").
 */
export async function criarContaPeloConvite(_: EstadoConvite, formData: FormData): Promise<EstadoConvite> {
  const token = String(formData.get("token") ?? "");
  if (!RE_TOKEN.test(token)) return { erro: MENSAGENS.convite_invalido };

  const erroSenha = validarSenha(String(formData.get("senha") ?? ""), String(formData.get("confirmar") ?? ""));
  if (erroSenha) return { erro: erroSenha };
  const senha = String(formData.get("senha"));

  const hash = hashToken(token);
  const admin = createAdminClient();
  const { data: convite } = await admin.rpc("convite_para_cadastro", { p_token_hash: hash });
  const email = (convite as { email?: string } | null)?.email;
  if (!email) return { erro: MENSAGENS.convite_invalido };

  // email_confirm: o link do convite só existe na caixa de entrada do convidado, então abri-lo comprova o e-mail.
  const { error: erroCriar } = await admin.auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
    app_metadata: { origem: "convite" },
  });
  if (erroCriar) {
    return erroContaJaExiste(erroCriar.message)
      ? { erro: "Já existe uma conta com o e-mail deste convite. Entre para aceitar.", jaTemConta: true }
      : { erro: "Não foi possível criar a conta. Tente novamente." };
  }

  const supabase = await createClient();
  const { error: erroEntrar } = await supabase.auth.signInWithPassword({ email, password: senha });
  if (erroEntrar) return { erro: "Conta criada, mas não foi possível entrar. Use a tela de entrada.", jaTemConta: true };

  const { error: erroAceite } = await supabase.rpc("aceitar_convite", { p_token_hash: hash });
  if (erroAceite) {
    const codigo = Object.keys(MENSAGENS).find((c) => erroAceite.message.includes(c));
    return { erro: codigo ? MENSAGENS[codigo] : "Conta criada, mas não foi possível aceitar o convite." };
  }

  redirect("/portal");
}
