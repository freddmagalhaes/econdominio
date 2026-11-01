"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { caminhoSeguro } from "@/lib/redirecionamento";
import { createClient } from "@/lib/supabase/server";

const credenciais = z.object({
  email: z.email("E-mail inválido"),
  senha: z.string().min(8, "A senha deve ter ao menos 8 caracteres"),
});

export type EstadoLogin = { erro?: string; aviso?: string };

// Não existe cadastro público: contas só nascem por convite (ver /convite e /cadastro).
export async function entrar(_: EstadoLogin, formData: FormData): Promise<EstadoLogin> {
  const dados = credenciais.safeParse({
    email: formData.get("email"),
    senha: formData.get("senha"),
  });
  if (!dados.success) return { erro: dados.error.issues[0].message };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: dados.data.email,
    password: dados.data.senha,
  });
  if (error) return { erro: "E-mail ou senha incorretos" };

  redirect(caminhoSeguro(formData.get("next")));
}

export async function sair() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
