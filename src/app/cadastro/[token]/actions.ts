"use server";

import { redirect } from "next/navigation";
import { RE_TOKEN, hashToken } from "@/lib/convite";
import { erroContaJaExiste, validarSenha } from "@/lib/senha";
import { createAdminClient } from "@/lib/supabase/admin";
import { criarContaAutorizada } from "@/lib/supabase/criar-conta";
import { createClient } from "@/lib/supabase/server";

export type EstadoCadastro = { erro?: string; jaTemConta?: boolean };

const INVALIDO = "Convite inválido, expirado ou já utilizado. Peça um novo convite.";

/**
 * Convite de administradora: o link (só enviado ao e-mail convidado) cria a conta e confirma o e-mail.
 * O e-mail é lido do convite no servidor. O banco só aceita a conta se houver uma autorização de uso único
 * (origem "gestora") registrada pelo servidor.
 */
export async function criarContaGestora(_: EstadoCadastro, formData: FormData): Promise<EstadoCadastro> {
  const token = String(formData.get("token") ?? "");
  if (!RE_TOKEN.test(token)) return { erro: INVALIDO };

  const erroSenha = validarSenha(String(formData.get("senha") ?? ""), String(formData.get("confirmar") ?? ""));
  if (erroSenha) return { erro: erroSenha };
  const senha = String(formData.get("senha"));

  const hash = hashToken(token);
  const admin = createAdminClient();
  const { data: convite } = await admin.rpc("convite_gestora_para_cadastro", { p_token_hash: hash });
  const email = (convite as { email?: string } | null)?.email;
  if (!email) return { erro: INVALIDO };

  const criada = await criarContaAutorizada(admin, { email, senha, origem: "gestora" });
  if ("erro" in criada) {
    return erroContaJaExiste(criada.erro)
      ? { erro: "Já existe uma conta com o e-mail deste convite. Entre para aceitar.", jaTemConta: true }
      : { erro: "Não foi possível criar a conta. Tente novamente." };
  }

  const { error: erroConcluir } = await admin.rpc("concluir_cadastro_gestora", {
    p_token_hash: hash,
    p_usuario: criada.user.id,
  });
  if (erroConcluir) {
    await admin.auth.admin.deleteUser(criada.user.id); // não deixa conta órfã sem a permissão
    return { erro: INVALIDO };
  }

  const supabase = await createClient();
  const { error: erroEntrar } = await supabase.auth.signInWithPassword({ email, password: senha });
  if (erroEntrar) return { erro: "Conta criada, mas não foi possível entrar. Use a tela de entrada.", jaTemConta: true };

  redirect("/dashboard");
}

/** Quem já tem conta (com o e-mail do convite) apenas ganha a permissão de administradora. */
export async function aceitarConviteGestora(_: EstadoCadastro, formData: FormData): Promise<EstadoCadastro> {
  const token = String(formData.get("token") ?? "");
  if (!RE_TOKEN.test(token)) return { erro: INVALIDO };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { erro: "Entre na sua conta para aceitar o convite." };

  const { error } = await createAdminClient().rpc("concluir_cadastro_gestora", {
    p_token_hash: hashToken(token),
    p_usuario: user.id,
  });
  if (error) {
    return {
      erro: error.message.includes("convite_outro_email")
        ? "Este convite foi enviado para outro e-mail."
        : INVALIDO,
    };
  }
  redirect("/dashboard");
}
