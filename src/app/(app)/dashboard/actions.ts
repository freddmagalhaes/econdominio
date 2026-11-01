"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const nome = z.string().trim().min(2, "Informe um nome").max(120);

export type EstadoForm = { erro?: string };

export async function criarOrganizacao(_: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const dados = nome.safeParse(formData.get("nome"));
  if (!dados.success) return { erro: dados.error.issues[0].message };

  const supabase = await createClient();
  const { error } = await supabase.rpc("criar_organizacao", { p_nome: dados.data });
  if (error) return { erro: "Não foi possível criar a organização" };

  revalidatePath("/dashboard");
  return {};
}

export async function criarCondominio(_: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const dados = z
    .object({ organizacaoId: z.uuid(), nome })
    .safeParse({ organizacaoId: formData.get("organizacaoId"), nome: formData.get("nome") });
  if (!dados.success) return { erro: dados.error.issues[0].message };

  const supabase = await createClient();
  const { error } = await supabase
    .from("condominio")
    .insert({ organizacao_id: dados.data.organizacaoId, nome: dados.data.nome });
  if (error) return { erro: "Não foi possível criar o condomínio" };

  revalidatePath("/dashboard");
  return {};
}
