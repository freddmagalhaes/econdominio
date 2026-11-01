// Dinheiro é sempre armazenado em centavos (inteiros). Nunca use float para somar valores.

const formatadorBRL = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

/** Converte centavos em texto monetário (apenas para exibição). */
export function formatarCentavos(centavos: number | bigint): string {
  return formatadorBRL.format(Number(centavos) / 100);
}

/** Converte centavos (>= 0) em "1234,56", próprio para preencher campos de formulário. */
export function centavosParaTexto(centavos: number): string {
  return `${Math.floor(centavos / 100)},${String(centavos % 100).padStart(2, "0")}`;
}

/** Converte "1.234,56" (ou "1234,5") em centavos, sem passar por float. */
export function reaisParaCentavos(texto: string): number {
  const limpo = texto.trim().replace(/\./g, "").replace("R$", "").trim();
  const m = /^(-?)(\d+)(?:,(\d{1,2}))?$/.exec(limpo);
  if (!m) throw new Error(`Valor inválido: "${texto}"`);
  const [, sinal, inteiro, frac = ""] = m;
  const centavos = Number(inteiro) * 100 + Number(frac.padEnd(2, "0"));
  return sinal ? -centavos : centavos;
}

/** Percentual em pontos-base (100 bps = 1%): "2,5" -> 250. Aceita de 0 a 100%. */
export function percentualParaBps(texto: string): number {
  const bps = reaisParaCentavos(texto);
  if (bps < 0 || bps > 10000) throw new Error("Percentual deve estar entre 0 e 100");
  return bps;
}

/** 250 -> "2,50" */
export function bpsParaTexto(bps: number): string {
  return centavosParaTexto(bps);
}

/**
 * Lê um valor em reais digitado ou vindo de planilha e devolve centavos, ou null se inválido.
 * Aceita "450", "450,00", "1.250,50", "R$ 1.250,50" e também "450.5" / "450.50" (ponto decimal).
 * "1.250" é tratado como 1.250,00 (ponto de milhar).
 */
export function parseValorReais(texto: string): number | null {
  const limpo = texto.replace(/R\$/g, "").replace(/\s/g, "");
  if (limpo === "") return null;
  let brasileiro: string | null = null;
  if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(limpo) || /^\d+(,\d{1,2})?$/.test(limpo)) brasileiro = limpo;
  else if (/^\d+\.\d{1,2}$/.test(limpo)) brasileiro = limpo.replace(".", ",");
  if (brasileiro === null) return null;
  const centavos = reaisParaCentavos(brasileiro);
  return centavos > 0 ? centavos : null;
}
