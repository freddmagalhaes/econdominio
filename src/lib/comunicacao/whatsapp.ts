import type { ResultadoEnvio } from "./email";
import { configEvolution, EvolutionWhatsapp } from "./evolution";

/**
 * Canal de WhatsApp via Evolution API (decisão do produto: número exclusivo para comunicados, API NÃO
 * oficial). Atenção: isso viola os termos do WhatsApp e o número pode ser banido a qualquer momento.
 * Mitigações aplicadas: só envia a quem autorizou (`pessoa.aceita_whatsapp`), mensagem com aviso de
 * como deixar de receber, envios espaçados (WHATSAPP_INTERVALO_MS) e e-mail como canal principal.
 */
export interface CanalWhatsapp {
  enviar(destino: string, texto: string): Promise<ResultadoEnvio>;
}

/** O canal só existe se a Evolution API estiver configurada nas variáveis de ambiente. */
export function canalWhatsapp(): CanalWhatsapp | null {
  const cfg = configEvolution();
  return cfg ? new EvolutionWhatsapp(cfg) : null;
}
