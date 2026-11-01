import assert from "node:assert/strict";
import { test } from "node:test";
import { GET } from "./route";

// Só as portas de entrada da rota: nenhum destes casos chega a consultar o banco.
const chamar = (cabecalho?: string) =>
  GET(new Request("http://localhost/api/comunicacao/reprocessar", { headers: cabecalho ? { authorization: cabecalho } : {} }));

async function comSegredo<T>(valor: string | undefined, fn: () => Promise<T>): Promise<T> {
  const antes = process.env.CRON_SECRET;
  if (valor === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = valor;
  try {
    return await fn();
  } finally {
    if (antes === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = antes;
  }
}

test("sem CRON_SECRET configurado a rota se recusa a funcionar (503), mesmo com cabeçalho", async () => {
  await comSegredo(undefined, async () => {
    assert.equal((await chamar("Bearer qualquer")).status, 503);
    assert.equal((await chamar()).status, 503);
  });
});

test("sem cabeçalho, com segredo errado ou de tamanho diferente: 401", async () => {
  await comSegredo("segredo-correto-123", async () => {
    assert.equal((await chamar()).status, 401);
    assert.equal((await chamar("Bearer errado")).status, 401);
    assert.equal((await chamar("Bearer segredo-correto-124")).status, 401);
    assert.equal((await chamar("segredo-correto-123")).status, 401, "sem o prefixo Bearer");
    assert.equal((await chamar("Basic segredo-correto-123")).status, 401);
  });
});
