import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { test } from "node:test";
import { criarContaAutorizada } from "./criar-conta";

type Chamada = { tipo: "rpc" | "createUser"; args: Record<string, unknown> };

function falso(opcoes: { erroRpc?: string; erroCriar?: string } = {}) {
  const chamadas: Chamada[] = [];
  const admin = {
    rpc: async (nome: string, args: Record<string, unknown>) => {
      chamadas.push({ tipo: "rpc", args: { nome, ...args } });
      return { error: opcoes.erroRpc ? { message: opcoes.erroRpc } : null };
    },
    auth: {
      admin: {
        createUser: async (args: Record<string, unknown>) => {
          chamadas.push({ tipo: "createUser", args });
          return opcoes.erroCriar
            ? { data: { user: null }, error: { message: opcoes.erroCriar } }
            : { data: { user: { id: "u-1", email: args.email } }, error: null };
        },
      },
    },
  } as unknown as SupabaseClient;
  return { admin, chamadas };
}

test("registra a autorização ANTES de criar o usuário, e o hash corresponde ao código enviado", async () => {
  const { admin, chamadas } = falso();
  const r = await criarContaAutorizada(admin, { email: "a@b.com", senha: "Senha-Forte-1", origem: "convite" });
  assert.ok("user" in r);
  assert.deepEqual(chamadas.map((c) => c.tipo), ["rpc", "createUser"]);

  const rpc = chamadas[0].args;
  assert.equal(rpc.nome, "autorizar_cadastro");
  assert.equal(rpc.p_email, "a@b.com");
  assert.equal(rpc.p_origem, "convite");

  const meta = chamadas[1].args.user_metadata as { autorizacao: string };
  assert.ok(meta.autorizacao.length >= 40, "código com entropia suficiente");
  assert.equal(createHash("sha256").update(meta.autorizacao).digest("hex"), rpc.p_nonce_hash);
  assert.equal(chamadas[1].args.email_confirm, true);
});

test("cada conta usa um código novo (nunca reaproveita)", async () => {
  const a = falso();
  const b = falso();
  await criarContaAutorizada(a.admin, { email: "a@b.com", senha: "x", origem: "gestora" });
  await criarContaAutorizada(b.admin, { email: "a@b.com", senha: "x", origem: "gestora" });
  assert.notEqual((a.chamadas[1].args.user_metadata as { autorizacao: string }).autorizacao, (b.chamadas[1].args.user_metadata as { autorizacao: string }).autorizacao);
});

test("se a autorização falhar, o usuário nem é criado", async () => {
  const { admin, chamadas } = falso({ erroRpc: "origem_invalida" });
  const r = await criarContaAutorizada(admin, { email: "a@b.com", senha: "x", origem: "convite" });
  assert.deepEqual(r, { erro: "origem_invalida" });
  assert.deepEqual(chamadas.map((c) => c.tipo), ["rpc"]);
});

test("erro do Supabase ao criar é devolvido (ex.: e-mail já cadastrado)", async () => {
  const { admin } = falso({ erroCriar: "A user with this email address has already been registered" });
  const r = await criarContaAutorizada(admin, { email: "a@b.com", senha: "x", origem: "convite" });
  assert.ok("erro" in r && /already been registered/.test(r.erro));
});
