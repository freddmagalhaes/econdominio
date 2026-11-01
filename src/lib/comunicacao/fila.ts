import type { ResultadoEnvio } from "./email";

export type OpcoesFila = {
  /** Tempo máximo desta rodada. Ao estourar, o que sobrar continua pendente para a próxima. */
  orcamentoMs: number;
  /** Pausa entre mensagens (o WhatsApp penaliza rajadas). */
  intervaloMs: () => number;
  pausa: (ms: number) => Promise<void>;
  agora: () => number;
  /** Chamado logo após cada envio (grave o status aqui, para não reenviar se a rodada for interrompida). */
  aoConcluir?: (item: unknown, resultado: ResultadoEnvio) => Promise<void>;
};

export type ResultadoFila<T> = {
  resultados: { item: T; resultado: ResultadoEnvio }[];
  restantes: number;
};

/** Envia um a um, com pausa entre mensagens e limite de tempo. Não mexe em banco: só orquestra. */
export async function processarFila<T>(
  itens: T[],
  enviarUm: (item: T) => Promise<ResultadoEnvio>,
  opcoes: OpcoesFila,
): Promise<ResultadoFila<T>> {
  const inicio = opcoes.agora();
  const resultados: ResultadoFila<T>["resultados"] = [];

  for (let i = 0; i < itens.length; i++) {
    if (opcoes.agora() - inicio >= opcoes.orcamentoMs) {
      return { resultados, restantes: itens.length - i };
    }
    const resultado = await enviarUm(itens[i]);
    resultados.push({ item: itens[i], resultado });
    await opcoes.aoConcluir?.(itens[i], resultado);
    if (i < itens.length - 1) await opcoes.pausa(opcoes.intervaloMs());
  }
  return { resultados, restantes: 0 };
}

/** Intervalo base (WHATSAPP_INTERVALO_MS, padrão 4 s, entre 1 e 60 s) com variação de até +50%. */
export function intervaloComVariacao(env: Record<string, string | undefined> = process.env, sorteio = Math.random): number {
  const base = Math.min(60_000, Math.max(1_000, Number(env.WHATSAPP_INTERVALO_MS) || 4_000));
  return Math.round(base + sorteio() * base * 0.5);
}
