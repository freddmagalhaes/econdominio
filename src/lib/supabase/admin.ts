import { createClient } from "@supabase/supabase-js";

/**
 * Cliente com a chave secreta (ignora o RLS). Use SOMENTE no servidor, em rotas autenticadas por
 * segredo próprio (ex.: cron). Nunca importe em componentes de cliente.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chave = process.env.SUPABASE_SECRET_KEY;
  if (!url || !chave) throw new Error("SUPABASE_SECRET_KEY não configurada");
  return createClient(url, chave, { auth: { persistSession: false, autoRefreshToken: false } });
}
