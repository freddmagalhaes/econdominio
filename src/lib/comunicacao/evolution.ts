import type { ResultadoEnvio } from "./email";
import type { CanalWhatsapp } from "./whatsapp";

/**
 * Evolution API (v2): servidor próprio que mantém a sessão do WhatsApp (número dedicado, API NÃO oficial).
 * Envio: POST {url}/message/sendText/{instância}, cabeçalho `apikey`, corpo { number, text, delay }.
 * Variáveis: EVOLUTION_API_URL, EVOLUTION_API_KEY, EVOLUTION_INSTANCE.
 */
export type ConfigEvolution = { url: string; chave: string; instancia: string };

export function configEvolution(env: Record<string, string | undefined> = process.env): ConfigEvolution | null {
  const url = env.EVOLUTION_API_URL?.trim().replace(/\/+$/, "");
  const chave = env.EVOLUTION_API_KEY?.trim();
  const instancia = env.EVOLUTION_INSTANCE?.trim();
  if (!url || !chave || !instancia) return null;
  try {
    const { protocol } = new URL(url);
    if (protocol !== "https:" && protocol !== "http:") return null;
  } catch {
    return null;
  }
  return { url, chave, instancia };
}

/** Aceita "55" + DDD + número (12 ou 13 dígitos) e devolve só os dígitos; senão, null. */
export function numeroWhatsapp(destino: string): string | null {
  const digitos = destino.replace(/\D/g, "");
  return /^55\d{10,11}$/.test(digitos) ? digitos : null;
}

export class EvolutionWhatsapp implements CanalWhatsapp {
  constructor(private readonly cfg: ConfigEvolution) {}

  async enviar(destino: string, texto: string): Promise<ResultadoEnvio> {
    const numero = numeroWhatsapp(destino);
    if (!numero) return { ok: false, erro: "Número de WhatsApp inválido" };
    try {
      const r = await fetch(`${this.cfg.url}/message/sendText/${encodeURIComponent(this.cfg.instancia)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: this.cfg.chave },
        body: JSON.stringify({ number: numero, text: texto, delay: 1200 }),
        signal: AbortSignal.timeout(20_000),
      });
      if (r.ok) return { ok: true };
      const detalhe = (await r.text().catch(() => "")).slice(0, 200);
      return { ok: false, erro: `Evolution ${r.status}: ${detalhe}` };
    } catch (e) {
      return { ok: false, erro: e instanceof Error ? e.message : "Falha de rede ao falar com a Evolution API" };
    }
  }
}

export type EstadoWhatsapp = "nao_configurado" | "conectado" | "desconectado" | "indisponivel";

/**
 * Indicador para a tela (não bloqueia envios). Lê o estado da instância; o formato da resposta foi
 * tratado de forma tolerante: `{ instance: { state } }` ou `{ state }`, com "open" = conectado.
 */
export async function estadoEvolution(cfg: ConfigEvolution | null = configEvolution()): Promise<EstadoWhatsapp> {
  if (!cfg) return "nao_configurado";
  try {
    const r = await fetch(`${cfg.url}/instance/connectionState/${encodeURIComponent(cfg.instancia)}`, {
      headers: { apikey: cfg.chave },
      signal: AbortSignal.timeout(5_000),
      cache: "no-store",
    });
    if (!r.ok) return "indisponivel";
    const j = (await r.json().catch(() => null)) as { instance?: { state?: string }; state?: string } | null;
    const estado = j?.instance?.state ?? j?.state;
    if (!estado) return "indisponivel";
    return estado === "open" ? "conectado" : "desconectado";
  } catch {
    return "indisponivel";
  }
}
