"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { emailConvite } from "@/lib/comunicacao/modelos";
import { enviarEmail } from "@/lib/comunicacao/email";
import { gerarToken, urlBase } from "@/lib/convite";
import { createClient } from "@/lib/supabase/server";

export type EstadoMorador = { erro?: string; aviso?: string; link?: string };

const MENSAGENS: Record<string, string> = {
  pessoa_sem_email: "A pessoa não tem e-mail cadastrado",
  pessoa_nao_vinculada: "A pessoa não está vinculada a esta unidade",
  unidade_ja_vinculada: "Esta unidade já tem um morador com acesso",
  unidade_nao_encontrada: "Unidade não encontrada",
};

const ids = z.object({ condominioId: z.uuid(), unidadeId: z.uuid() });

export async function enviarConvite(_: EstadoMorador, formData: FormData): Promise<EstadoMorador> {
  const dados = ids
    .extend({ pessoaId: z.uuid() })
    .safeParse({
      condominioId: formData.get("condominioId"),
      unidadeId: formData.get("unidadeId"),
      pessoaId: formData.get("pessoaId"),
    });
  if (!dados.success) return { erro: "Dados inválidos" };

  const supabase = await createClient();
  const { token, hash } = gerarToken();
  const { data, error } = await supabase.rpc("criar_convite", {
    p_unidade: dados.data.unidadeId,
    p_pessoa: dados.data.pessoaId,
    p_token_hash: hash,
  });
  if (error) {
    const codigo = Object.keys(MENSAGENS).find((c) => error.message.includes(c));
    return { erro: codigo ? MENSAGENS[codigo] : "Não foi possível criar o convite" };
  }

  const [{ data: cond }, { data: un }] = await Promise.all([
    supabase.from("condominio").select("nome").eq("id", dados.data.condominioId).maybeSingle(),
    supabase.from("unidade").select("identificador, bloco(nome)").eq("id", dados.data.unidadeId).maybeSingle(),
  ]);
  const bloco = Array.isArray(un?.bloco) ? un?.bloco[0] : un?.bloco;
  const link = `${urlBase()}/convite/${token}`;

  const envio = await enviarEmail({
    para: (data as { email: string }).email,
    ...emailConvite({
      condominio: cond?.nome ?? "Condomínio",
      unidade: un?.identificador ?? "",
      bloco: bloco?.nome ?? null,
      link,
    }),
  });

  revalidatePath(`/condominios/${dados.data.condominioId}/moradores`);
  if (!envio.ok) {
    // O convite existe; o gestor pode repassar o link manualmente enquanto o e-mail não está configurado.
    return { erro: `Convite criado, mas o e-mail não foi enviado: ${envio.erro}`, link };
  }
  return { aviso: `Convite enviado para ${(data as { email: string }).email}.` };
}

export async function revogarAcesso(_: EstadoMorador, formData: FormData): Promise<EstadoMorador> {
  const dados = ids.safeParse({
    condominioId: formData.get("condominioId"),
    unidadeId: formData.get("unidadeId"),
  });
  if (!dados.success) return { erro: "Dados inválidos" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("revogar_acesso_unidade", { p_unidade: dados.data.unidadeId });
  if (error) return { erro: "Não foi possível revogar" };

  revalidatePath(`/condominios/${dados.data.condominioId}/moradores`);
  return { aviso: "Acesso e convites revogados." };
}
