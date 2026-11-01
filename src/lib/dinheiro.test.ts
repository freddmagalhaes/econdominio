import assert from "node:assert/strict";
import { test } from "node:test";
import { centavosParaTexto, parseValorReais, reaisParaCentavos } from "./dinheiro";

test("parseValorReais aceita formatos brasileiros e ponto decimal", () => {
  const casos: [string, number][] = [
    ["450", 45000],
    ["450,00", 45000],
    ["450,5", 45050],
    ["1.250,50", 125050],
    ["R$ 1.250,50", 125050],
    ["1.250", 125000],
    ["450.50", 45050],
    ["450.5", 45050],
    ["1.234.567,89", 123456789],
  ];
  for (const [texto, esperado] of casos) assert.equal(parseValorReais(texto), esperado, texto);
});

test("parseValorReais rejeita lixo, zero e negativos", () => {
  for (const ruim of ["", "abc", "0", "0,00", "-10", "12,345", "1,2,3", "450,00,00", "R$"]) {
    assert.equal(parseValorReais(ruim), null, ruim);
  }
});

test("centavos <-> texto sem passar por float", () => {
  assert.equal(centavosParaTexto(45050), "450,50");
  assert.equal(centavosParaTexto(5), "0,05");
  assert.equal(reaisParaCentavos(centavosParaTexto(123456789)), 123456789);
});
