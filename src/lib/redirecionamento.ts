/** Aceita apenas caminhos internos ("/algo"), evitando open redirect via parâmetro `next`. */
export function caminhoSeguro(valor: unknown, padrao = "/dashboard"): string {
  if (typeof valor !== "string" || valor.length > 500) return padrao;
  if (!valor.startsWith("/") || valor.startsWith("//") || valor.includes("\\") || /\p{Cc}/u.test(valor)) {
    return padrao;
  }
  return valor;
}
