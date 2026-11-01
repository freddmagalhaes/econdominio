const LISTA_FRACA = new Set(["12345678", "123456789", "1234567890", "senha123", "password", "qwertyui", "11111111", "00000000"]);

/** Regras mínimas de senha para contas criadas por convite. Devolve a mensagem de erro ou null se estiver ok. */
export function validarSenha(senha: string, confirmar: string): string | null {
  if (senha.length < 8) return "A senha deve ter ao menos 8 caracteres.";
  if (senha.length > 72) return "A senha pode ter no máximo 72 caracteres.";
  if (LISTA_FRACA.has(senha.toLowerCase())) return "Escolha uma senha menos óbvia.";
  if (/^(.)\1+$/.test(senha)) return "Escolha uma senha menos óbvia.";
  if (senha !== confirmar) return "As senhas não conferem.";
  return null;
}

/** O Supabase devolve mensagens diferentes quando o e-mail já tem conta; este teste cobre as variações. */
export function erroContaJaExiste(mensagem: string): boolean {
  return /already|registered|exists|duplicate/i.test(mensagem);
}
