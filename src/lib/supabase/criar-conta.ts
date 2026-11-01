import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createHash, randomBytes } from "node:crypto";

export type OrigemConta = "convite" | "gestora" | "plataforma";

/**
 * Cria uma conta de forma autorizada. O banco recusa qualquer conta nova sem uma autorização de uso único,
 * então a ordem é: (1) registrar a autorização para o e-mail com o hash de um código secreto, (2) criar o
 * usuário levando o código. Use SOMENTE no servidor, com o cliente administrativo (chave secreta).
 */
export async function criarContaAutorizada(
  admin: SupabaseClient,
  dados: { email: string; senha: string; origem: OrigemConta },
): Promise<{ user: User } | { erro: string }> {
  const nonce = randomBytes(32).toString("base64url");
  const hash = createHash("sha256").update(nonce).digest("hex");

  const { error: erroAutorizacao } = await admin.rpc("autorizar_cadastro", {
    p_email: dados.email,
    p_origem: dados.origem,
    p_nonce_hash: hash,
  });
  if (erroAutorizacao) return { erro: erroAutorizacao.message };

  const { data, error } = await admin.auth.admin.createUser({
    email: dados.email,
    password: dados.senha,
    email_confirm: true,
    user_metadata: { autorizacao: nonce },
  });
  if (error || !data.user) return { erro: error?.message ?? "Falha ao criar o usuário" };
  return { user: data.user };
}
