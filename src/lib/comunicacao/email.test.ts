import assert from "node:assert/strict";
import { test } from "node:test";
import { enviarEmail } from "./email";

test("sem RESEND_API_KEY/EMAIL_REMETENTE o envio falha com mensagem clara (sem chamar a rede)", async () => {
  const antes = { chave: process.env.RESEND_API_KEY, remetente: process.env.EMAIL_REMETENTE };
  delete process.env.RESEND_API_KEY;
  delete process.env.EMAIL_REMETENTE;
  try {
    const r = await enviarEmail({ para: "a@b.com", assunto: "x", html: "<p>x</p>", texto: "x" });
    assert.equal(r.ok, false);
    assert.match(r.ok ? "" : r.erro, /não configurado/);
  } finally {
    if (antes.chave !== undefined) process.env.RESEND_API_KEY = antes.chave;
    if (antes.remetente !== undefined) process.env.EMAIL_REMETENTE = antes.remetente;
  }
});

test("com configuração, envia para a API do Resend com idempotência e devolve o erro da API", async () => {
  const original = globalThis.fetch;
  const chamadas: { url: string; init: RequestInit }[] = [];
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    chamadas.push({ url, init });
    return new Response("domínio não verificado", { status: 403 });
  }) as typeof fetch;
  process.env.RESEND_API_KEY = "re_teste";
  process.env.EMAIL_REMETENTE = "eCondomínio <avisos@exemplo.com.br>";
  try {
    const r = await enviarEmail({ para: "a@b.com", assunto: "Oi", html: "<p>oi</p>", texto: "oi", idempotencia: "envio-1" });
    assert.equal(r.ok, false);
    assert.match(r.ok ? "" : r.erro, /Resend 403/);
    assert.equal(chamadas[0].url, "https://api.resend.com/emails");
    const cabecalhos = chamadas[0].init.headers as Record<string, string>;
    assert.equal(cabecalhos["Idempotency-Key"], "envio-1");
    assert.equal(cabecalhos.Authorization, "Bearer re_teste");
    assert.deepEqual(JSON.parse(String(chamadas[0].init.body)).to, ["a@b.com"]);
  } finally {
    globalThis.fetch = original;
    delete process.env.RESEND_API_KEY;
    delete process.env.EMAIL_REMETENTE;
  }
});
