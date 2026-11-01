"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { VERSAO_TERMO } from "@/lib/consentimento";
import { createClient } from "@/lib/supabase/server";

export type EstadoPessoa = { erro?: string; aviso?: string };

const MENSAGENS: Record<string, string> = {
  nome_invalido: "Informe o nome (mínimo 2 caracteres)",
  email_invalido: "E-mail inválido",
  telefone_invalido: "Telefone inválido: informe DDD + número (ex.: (11) 98100-0000)",
  email_obrigatorio: "Para receber por e-mail, informe o e-mail",
  telefone_obrigatorio: "Para receber por WhatsApp, informe o telefone",
  documento_obrigatorio: "Informe o CPF/CNPJ: ele consta no termo de autorização",
  termo_obrigatorio: "Confirme que o morador leu e autorizou o termo para liberar o canal",
  pessoa_nao_encontrada: "Pessoa não encontrada",
};

export async function salvarPessoa(_: EstadoPessoa, formData: FormData): Promise<EstadoPessoa> {
  const dados = z
    .object({
      condominioId: z.uuid(),
      pessoaId: z.uuid(),
      nome: z.string().trim().min(2, MENSAGENS.nome_invalido).max(120),
      documento: z.string().trim().max(30),
      email: z.string().trim().max(200),
      telefone: z.string().trim().max(30),
    })
    .safeParse({
      condominioId: formData.get("condominioId"),
      pessoaId: formData.get("pessoaId"),
      nome: formData.get("nome") ?? "",
      documento: formData.get("documento") ?? "",
      email: formData.get("email") ?? "",
      telefone: formData.get("telefone") ?? "",
    });
  if (!dados.success) return { erro: dados.error.issues[0].message };

  const aceitaEmail = formData.get("aceitaEmail") === "on";
  const aceitaWhatsapp = formData.get("aceitaWhatsapp") === "on";
  const termoAceito = formData.get("termo") === "on";

  const supabase = await createClient();
  const { error } = await supabase.rpc("atualizar_pessoa", {
    p_pessoa: dados.data.pessoaId,
    p_nome: dados.data.nome,
    p_documento: dados.data.documento,
    p_email: dados.data.email,
    p_telefone: dados.data.telefone,
    p_aceita_email: aceitaEmail,
    p_aceita_whatsapp: aceitaWhatsapp,
    p_versao_termo: termoAceito ? VERSAO_TERMO : null,
  });
  if (error) {
    const codigo = Object.keys(MENSAGENS).find((c) => error.message.includes(c));
    return { erro: codigo ? MENSAGENS[codigo] : "Não foi possível salvar" };
  }

  revalidatePath(`/condominios/${dados.data.condominioId}/pessoas`);
  revalidatePath(`/condominios/${dados.data.condominioId}/pessoas/${dados.data.pessoaId}`);
  revalidatePath(`/condominios/${dados.data.condominioId}/moradores`);
  return { aviso: "Dados salvos." };
}

export async function salvarVinculo(_: EstadoPessoa, formData: FormData): Promise<EstadoPessoa> {
  const dados = z
    .object({
      condominioId: z.uuid(),
      pessoaId: z.uuid(),
      vinculoId: z.uuid(),
      tipo: z.enum(["proprietario", "inquilino"]),
    })
    .safeParse({
      condominioId: formData.get("condominioId"),
      pessoaId: formData.get("pessoaId"),
      vinculoId: formData.get("vinculoId"),
      tipo: formData.get("tipo"),
    });
  if (!dados.success) return { erro: "Dados inválidos" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("atualizar_vinculo", {
    p_vinculo: dados.data.vinculoId,
    p_tipo: dados.data.tipo,
  });
  if (error) return { erro: "Não foi possível salvar o vínculo" };

  revalidatePath(`/condominios/${dados.data.condominioId}/pessoas`);
  revalidatePath(`/condominios/${dados.data.condominioId}/pessoas/${dados.data.pessoaId}`);
  return { aviso: "Vínculo salvo." };
}
