import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { test } from "node:test";
import { enviarPendentes } from "./enviar-pendentes";

test("sem Resend configurado não consulta nem altera a fila (não gasta tentativas)", async () => {
  const antes = { chave: process.env.RESEND_API_KEY, remetente: process.env.EMAIL_REMETENTE };
  delete process.env.RESEND_API_KEY;
  delete process.env.EMAIL_REMETENTE;
  // Qualquer uso do banco derruba o teste.
  const supabase = new Proxy({}, { get: () => { throw new Error("não deveria acessar o banco"); } }) as SupabaseClient;
  try {
    assert.deepEqual(await enviarPendentes(supabase), { enviados: 0, falhas: 0, naoConfigurado: true });
  } finally {
    if (antes.chave !== undefined) process.env.RESEND_API_KEY = antes.chave;
    if (antes.remetente !== undefined) process.env.EMAIL_REMETENTE = antes.remetente;
  }
});
