import type { SupabaseClient } from "@supabase/supabase-js";
import { emailConfigurado, enviarEmail } from "./email";
import { emailComunicado } from "./modelos";

export const MAX_TENTATIVAS = 5;
const CONCORRENCIA = 5;

type Envio = { id: string; comunicado_id: string; condominio_id: string; destino: string; tentativas: number };
type Comunicado = {
  id: string;
  tipo: "aviso" | "reuniao";
  titulo: string;
  corpo: string;
  data_reuniao: string | null;
  local: string | null;
};

/**
 * Envia e-mails pendentes (ou que falharam, até MAX_TENTATIVAS). Com o cliente do usuário vale o RLS;
 * com o cliente administrativo (cron) processa todos os condomínios.
 */
export async function enviarPendentes(
  supabase: SupabaseClient,
  opcoes: { comunicadoId?: string; limite?: number } = {},
): Promise<{ enviados: number; falhas: number; primeiroErro?: string; naoConfigurado?: boolean }> {
  // Sem Resend configurado não há o que tentar: as mensagens ficam como estão (sem gastar tentativas).
  if (!emailConfigurado()) return { enviados: 0, falhas: 0, naoConfigurado: true };

  let consulta = supabase
    .from("envio_comunicacao")
    .select("id, comunicado_id, condominio_id, destino, tentativas")
    .eq("canal", "email")
    .in("status", ["pendente", "falhou"])
    .lt("tentativas", MAX_TENTATIVAS)
    .order("criado_em")
    .limit(opcoes.limite ?? 200);
  if (opcoes.comunicadoId) consulta = consulta.eq("comunicado_id", opcoes.comunicadoId);

  const { data } = await consulta;
  const envios = (data ?? []) as Envio[];
  if (envios.length === 0) return { enviados: 0, falhas: 0 };

  const idsComunicado = [...new Set(envios.map((e) => e.comunicado_id))];
  const idsCondominio = [...new Set(envios.map((e) => e.condominio_id))];
  const [{ data: comunicados }, { data: condominios }] = await Promise.all([
    supabase.from("comunicado").select("id, tipo, titulo, corpo, data_reuniao, local").in("id", idsComunicado),
    supabase.from("condominio").select("id, nome").in("id", idsCondominio),
  ]);
  const porComunicado = new Map(((comunicados ?? []) as Comunicado[]).map((c) => [c.id, c]));
  const nomeCondominio = new Map(((condominios ?? []) as { id: string; nome: string }[]).map((c) => [c.id, c.nome]));

  let enviados = 0;
  let falhas = 0;
  let primeiroErro: string | undefined;

  const processar = async (envio: Envio) => {
    const c = porComunicado.get(envio.comunicado_id);
    const resultado = c
      ? await enviarEmail({
          para: envio.destino,
          ...emailComunicado({
            condominio: nomeCondominio.get(envio.condominio_id) ?? "Condomínio",
            tipo: c.tipo,
            titulo: c.titulo,
            corpo: c.corpo,
            dataReuniao: c.data_reuniao,
            local: c.local,
          }),
          idempotencia: `envio-${envio.id}`,
        })
      : ({ ok: false, erro: "Comunicado não encontrado" } as const);

    if (resultado.ok) {
      enviados++;
      await supabase
        .from("envio_comunicacao")
        .update({
          status: "enviado",
          enviado_em: new Date().toISOString(),
          tentativas: envio.tentativas + 1,
          erro: null,
        })
        .eq("id", envio.id);
    } else {
      falhas++;
      primeiroErro ??= resultado.erro;
      await supabase
        .from("envio_comunicacao")
        .update({ status: "falhou", tentativas: envio.tentativas + 1, erro: resultado.erro.slice(0, 500) })
        .eq("id", envio.id);
    }
  };

  for (let i = 0; i < envios.length; i += CONCORRENCIA) {
    await Promise.all(envios.slice(i, i + CONCORRENCIA).map(processar));
  }
  return { enviados, falhas, primeiroErro };
}
