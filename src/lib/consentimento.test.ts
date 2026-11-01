import assert from "node:assert/strict";
import { test } from "node:test";
import { formatarTelefone, montarTermo, normalizarTelefone } from "./consentimento";

test("termo traz nome, CPF/CNPJ, bloco, unidade e vínculo de proprietário", () => {
  const t = montarTermo({
    condominio: "Residencial Modelo",
    nome: "Maria Souza",
    documento: "123.456.789-00",
    vinculos: [{ bloco: "A", unidade: "101", tipo: "proprietario" }],
  });
  assert.match(t[0], /Eu, Maria Souza, CPF\/CNPJ 123\.456\.789-00, proprietário\(a\) da unidade 101 do bloco A, no condomínio Residencial Modelo, autorizo/);
  assert.ok(!t.some((p) => p.includes("Como inquilino")), "proprietário não recebe a cláusula de inquilino");
});

test("inquilino: o termo diz que é inquilino e acrescenta a cláusula específica", () => {
  const t = montarTermo({
    condominio: "Cond",
    nome: "Rita",
    documento: "222",
    vinculos: [{ bloco: null, unidade: "7", tipo: "inquilino" }],
  });
  assert.match(t[0], /inquilino\(a\) da unidade 7, no condomínio Cond/);
  assert.ok(!t[0].includes("do bloco"), "sem bloco, não cita bloco");
  assert.ok(t.some((p) => p.startsWith("Como inquilino(a)")));
});

test("várias unidades combinam os vínculos e documento ausente é sinalizado", () => {
  const t = montarTermo({
    condominio: "Cond",
    nome: "Ana",
    documento: "",
    vinculos: [
      { bloco: "A", unidade: "101", tipo: "proprietario" },
      { bloco: "B", unidade: "202", tipo: "inquilino" },
    ],
  });
  assert.match(t[0], /CPF\/CNPJ \(não informado\)/);
  assert.match(t[0], /proprietário\(a\) da unidade 101 do bloco A e inquilino\(a\) da unidade 202 do bloco B/);
  assert.ok(t.some((p) => p.startsWith("Como inquilino(a)")));
});

test("sem vínculos o termo avisa em vez de inventar unidade", () => {
  const t = montarTermo({ condominio: "Cond", nome: "Zé", documento: "1", vinculos: [] });
  assert.match(t[0], /\(sem unidade vinculada\)/);
});

test("telefone: normaliza e formata", () => {
  assert.equal(normalizarTelefone("+55 (11) 98100-0000"), "11981000000");
  assert.equal(formatarTelefone("11981000000"), "(11) 98100-0000");
  assert.equal(formatarTelefone("1133334444"), "(11) 3333-4444");
});
