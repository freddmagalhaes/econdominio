const FUSO = "America/Sao_Paulo";

/** Data de hoje no Brasil, "AAAA-MM-DD". */
export function hojeSaoPaulo(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: FUSO });
}

/** "2027-01-17" -> "17/01/2027" */
export function formatarData(iso: string): string {
  return iso.split("-").reverse().join("/");
}

export const RE_COMPETENCIA = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Soma meses a uma competência "AAAA-MM". */
export function deslocarMes(competencia: string, delta: number): string {
  const [a, m] = competencia.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1 + delta, 1)).toISOString().slice(0, 7);
}

/** "2026-11-01T17:32:00Z" -> "01/11/2026 14:32" (horário de Brasília). */
export function formatarDataHoraCurta(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { timeZone: FUSO, dateStyle: "short", timeStyle: "short" });
}
