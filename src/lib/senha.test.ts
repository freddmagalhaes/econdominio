import assert from "node:assert/strict";
import { test } from "node:test";
import { erroContaJaExiste, validarSenha } from "./senha";

test("senha válida passa", () => {
  assert.equal(validarSenha("Casa-Verde-42", "Casa-Verde-42"), null);
});

test("senha curta, longa, óbvia ou diferente da confirmação é recusada", () => {
  assert.match(validarSenha("curta", "curta") ?? "", /ao menos 8/);
  assert.match(validarSenha("a".repeat(73), "a".repeat(73)) ?? "", /no máximo 72/);
  assert.match(validarSenha("12345678", "12345678") ?? "", /menos óbvia/);
  assert.match(validarSenha("aaaaaaaaaa", "aaaaaaaaaa") ?? "", /menos óbvia/);
  assert.match(validarSenha("Casa-Verde-42", "Casa-Verde-43") ?? "", /não conferem/);
});

test("reconhece as mensagens de e-mail já cadastrado", () => {
  for (const m of ["User already registered", "A user with this email address has already been registered", "email_exists", "duplicate key"]) {
    assert.equal(erroContaJaExiste(m), true, m);
  }
  assert.equal(erroContaJaExiste("Database error saving new user"), false);
});
