"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { VERSAO_TERMO } from "@/lib/consentimento";
import { createClient } from "@/lib/supabase/server";

export type EstadoTermo = { erro?: string; aviso?: string };

const MENSAGENS: Record<string, string> = {
  versao_desatualizada: "O termo foi atualizado. Recarregue a página para ver a nova versão.",
  documento_ausente: "Seu CPF/CNPJ não consta no cadastro. Peça ao síndico ou à administradora para completar.",
  email_obrigatorio: "Não há e-mail no seu cadastro. Peça à administração para incluir, ou desmarque o e-mail.",
  telefone_obrigatorio: "Não há telefone no seu cadastro. Peça à administração para incluir, ou desmarque o WhatsApp.",
  cadastro_incompleto: "Seu cadastro está incompleto. Fale com a administração.",
  sem_acesso: "Você não tem acesso a nenhuma unidade.",
};

/**
 * Aceite do termo pelo próprio morador (obrigatório no primeiro acesso) e, depois, a gestão da
 * própria autorização (canais). A data e a hora são gravadas pelo banco no momento do aceite.
 */
export async function aceitarTermo(_: EstadoTermo, formData: FormData): Promise<EstadoTermo> {
  const aceitaEmail = formData.get("aceitaEmail") === "on";
  const aceitaWhatsapp = formData.get("aceitaWhatsapp") === "on";
  const li = formData.get("li") === "on";

  const supabase = await createClient();
  const { data: dados } = await supabase.rpc("portal_dados_termo");
  const linhas = (dados ?? []) as { aceito_em: string | null }[];
  if (linhas.length === 0) return { erro: MENSAGENS.sem_acesso };

  const pendente = linhas.some((l) => !l.aceito_em);
  if (pendente && !li) return { erro: "Marque que você leu e aceita o termo para continuar." };

  // IP e navegador ficam junto do aceite como evidência (na Vercel o cabeçalho vem do proxy deles).
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip");
  const { error } = await supabase.rpc("aceitar_termo", {
    p_versao: VERSAO_TERMO,
    p_aceita_email: aceitaEmail,
    p_aceita_whatsapp: aceitaWhatsapp,
    p_ip: ip,
    p_user_agent: h.get("user-agent"),
  });
  if (error) {
    const codigo = Object.keys(MENSAGENS).find((c) => error.message.includes(c));
    return { erro: codigo ? MENSAGENS[codigo] : "Não foi possível registrar. Tente novamente." };
  }

  revalidatePath("/portal");
  if (pendente) redirect("/portal");
  return { aviso: "Autorizações salvas." };
}
