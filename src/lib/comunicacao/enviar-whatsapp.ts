import type { SupabaseClient } from "@supabase/supabase-js";
import { MAX_TENTATIVAS } from "./enviar-pendentes";
import { intervaloComVariacao, processarFila } from "./fila";
import { textoWhatsappComunicado } from "./modelos";
import { canalWhatsapp, type CanalWhatsapp } from "./whatsapp";

type Envio = { id: string; comunicado_id: string; condominio_id: string; destino: string; tentativas: number };
type Comunicado = {
  id: string;
  tipo: "aviso" | "reuniao";
  titulo: string;
  corpo: string;
  data_reuniao: string | null;
  local: string | null;
};

export type ResultadoWhatsapp = {
  enviados: number;
  falhas: number;
  restantes: number;
  primeiroErro?: string;
  naoConfigurado?: boolean;
};

/**
 * Envia as mensagens de WhatsApp pendentes (ou que falharam, até MAX_TENTATIVAS), uma a uma e com pausa
 * entre elas. Respeita um orçamento de tempo: o que não couber fica pendente (cron ou "Reenviar").
 */
export async function enviarWhatsappPendentes(
  supabase: SupabaseClient,
  opcoes: {
    comunicadoId?: string;
    limite?: number;
    orcamentoMs?: number;
    canal?: CanalWhatsapp | null;
    pausa?: (ms: number) => Promise<void>;
  } = {},
): Promise<ResultadoWhatsapp> {
  const canal = opcoes.canal === undefined ? canalWhatsapp() : opcoes.canal;
  if (!canal) return { enviados: 0, falhas: 0, restantes: 0, naoConfigurado: true };

  let consulta = supabase
    .from("envio_comunicacao")
    .select("id, comunicado_id, condominio_id, destino, tentativas")
    .eq("canal", "whatsapp")
    .in("status", ["pendente", "falhou"])
    .lt("tentativas", MAX_TENTATIVAS)
    .order("criado_em")
    .limit(opcoes.limite ?? 100);
  if (opcoes.comunicadoId) consulta = consulta.eq("comunicado_id", opcoes.comunicadoId);

  const envios = ((await consulta).data ?? []) as Envio[];
  if (envios.length === 0) return { enviados: 0, falhas: 0, restantes: 0 };

  const [{ data: comunicados }, { data: condominios }] = await Promise.all([
    supabase
      .from("comunicado")
      .select("id, tipo, titulo, corpo, data_reuniao, local")
      .in("id", [...new Set(envios.map((e) => e.comunicado_id))]),
    supabase.from("condominio").select("id, nome").in("id", [...new Set(envios.map((e) => e.condominio_id))]),
  ]);
  const porComunicado = new Map(((comunicados ?? []) as Comunicado[]).map((c) => [c.id, c]));
  const nomeCondominio = new Map(((condominios ?? []) as { id: string; nome: string }[]).map((c) => [c.id, c.nome]));

  let enviados = 0;
  let falhas = 0;
  let primeiroErro: string | undefined;

  const { restantes } = await processarFila(
    envios,
    async (envio) => {
      const c = porComunicado.get(envio.comunicado_id);
      if (!c) return { ok: false, erro: "Comunicado não encontrado" } as const;
      return canal.enviar(
        envio.destino,
        textoWhatsappComunicado({
          condominio: nomeCondominio.get(envio.condominio_id) ?? "Condomínio",
          tipo: c.tipo,
          titulo: c.titulo,
          corpo: c.corpo,
          dataReuniao: c.data_reuniao,
          local: c.local,
        }),
      );
    },
    {
      orcamentoMs: opcoes.orcamentoMs ?? 40_000,
      intervaloMs: () => intervaloComVariacao(),
      pausa: opcoes.pausa ?? ((ms) => new Promise((r) => setTimeout(r, ms))),
      agora: () => Date.now(),
      // Grava cada resultado na hora: se a rodada for cortada, nada já enviado volta para a fila.
      aoConcluir: async (item, resultado) => {
        const envio = item as Envio;
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
      },
    },
  );

  return { enviados, falhas, restantes, primeiroErro };
}
