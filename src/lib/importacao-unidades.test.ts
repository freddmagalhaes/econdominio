import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { lerCsv } from "./csv";
import { interpretarMatriz, interpretarPlanilha } from "./importacao-unidades";
import { ErroXlsx, lerXlsx } from "./xlsx";

const publico = (arquivo: string) => new URL(`../../public/${arquivo}`, import.meta.url);

test("lerCsv aceita BOM, CRLF, aspas e separador vírgula ou ponto e vírgula", () => {
  assert.deepEqual(lerCsv('\uFEFFa;b\r\n"x;y";"z ""q"""\r\n'), [
    ["a", "b"],
    ["x;y", 'z "q"'],
  ]);
  assert.deepEqual(lerCsv("a,b\n1,2"), [
    ["a", "b"],
    ["1", "2"],
  ]);
});

test("cabeçalhos alternativos e acentos são reconhecidos", () => {
  const r = interpretarPlanilha("Torre;Apartamento;Proprietário;CPF;E-mail;Celular\nA;101;Maria;111;m@x.com;119");
  assert.equal(r.erros.length, 0);
  assert.deepEqual(r.linhas[0], {
    bloco: "A",
    unidade: "101",
    nome: "Maria",
    documento: "111",
    email: "m@x.com",
    telefone: "119",
    tipo: "proprietario",
  });
});

test("erros por linha: unidade vazia, e-mail inválido e duplicidade", () => {
  const r = interpretarPlanilha("unidade;nome;email\n;Ana;\n102;Bia;x\n103;Cai;c@x.com\n103;Cai;c@x.com");
  assert.deepEqual(
    r.erros.map((e) => e.linha),
    [2, 3, 5],
  );
});

test("planilha vazia ou sem coluna 'unidade' é recusada", () => {
  assert.equal(interpretarPlanilha("unidade;nome").erros[0].mensagem, "Planilha vazia ou sem cabeçalho");
  assert.match(interpretarPlanilha("nome;email\nAna;a@x.com").erros[0].mensagem, /coluna 'unidade'/);
});

test("modelo CSV de exemplo é válido (36 unidades, 35 pessoas)", () => {
  const r = interpretarPlanilha(readFileSync(publico("modelo-importacao.csv"), "utf8"));
  assert.equal(r.erros.length, 0);
  assert.equal(new Set(r.linhas.map((l) => `${l.bloco}|${l.unidade}`)).size, 36);
  assert.equal(new Set(r.linhas.filter((l) => l.nome).map((l) => l.documento)).size, 35);
});

test("modelo XLSX de exemplo equivale ao CSV", async () => {
  const csv = interpretarPlanilha(readFileSync(publico("modelo-importacao.csv"), "utf8"));
  const xlsx = interpretarMatriz(await lerXlsx(readFileSync(publico("modelo-importacao.xlsx"))));
  assert.equal(xlsx.erros.length, 0);
  assert.equal(xlsx.linhas.length, csv.linhas.length);
  assert.equal(xlsx.linhas[0].nome, csv.linhas[0].nome);
  assert.equal(xlsx.linhas[0].documento, csv.linhas[0].documento);
});

test("modelo XLSX em branco só tem cabeçalho", async () => {
  const r = interpretarMatriz(await lerXlsx(readFileSync(publico("modelo-importacao-em-branco.xlsx"))));
  assert.equal(r.erros[0].mensagem, "Planilha vazia ou sem cabeçalho");
});

test("arquivo que não é xlsx gera erro amigável", async () => {
  await assert.rejects(lerXlsx(Buffer.from("isto não é um xlsx")), ErroXlsx);
});

test("coluna tipo: proprietário é o padrão e sinônimos de inquilino são reconhecidos", () => {
  const r = interpretarPlanilha(
    "unidade;nome;tipo\n1;Ana;\n2;Bia;Inquilino\n3;Caio;LOCATÁRIO\n4;Duda;Proprietária\n5;Edu;morador",
  );
  assert.equal(r.erros.length, 0);
  assert.deepEqual(
    r.linhas.map((l) => l.tipo),
    ["proprietario", "inquilino", "inquilino", "proprietario", "inquilino"],
  );
});

test("coluna tipo com valor desconhecido é rejeitada com o número da linha", () => {
  const r = interpretarPlanilha("unidade;nome;tipo\n1;Ana;sindico");
  assert.equal(r.linhas.length, 0);
  assert.deepEqual(r.erros, [{ linha: 2, mensagem: "tipo deve ser proprietário ou inquilino" }]);
});

test("modelo de exemplo traz 3 inquilinos e o xlsx confere com o csv", async () => {
  const csv = interpretarPlanilha(readFileSync(publico("modelo-importacao.csv"), "utf8"));
  assert.equal(csv.linhas.filter((l) => l.tipo === "inquilino").length, 3);
  const xlsx = interpretarMatriz(await lerXlsx(readFileSync(publico("modelo-importacao.xlsx"))));
  assert.deepEqual(
    xlsx.linhas.map((l) => l.tipo),
    csv.linhas.map((l) => l.tipo),
  );
});

test("coluna valor_cota vira centavos (vírgula, ponto decimal e milhar)", () => {
  const r = interpretarPlanilha("unidade;valor_cota\n1;450,00\n2;1.250,50\n3;380.5\n4;\n5;R$ 520");
  assert.equal(r.erros.length, 0);
  assert.deepEqual(
    r.linhas.map((l) => l.valor_cota_centavos),
    [45000, 125050, 38050, undefined, 52000],
  );
  assert.ok(r.linhas.every((l) => !("valor_cota" in l)), "o texto bruto não segue para o banco");
});

test("valor_cota inválido é rejeitado com a linha", () => {
  const r = interpretarPlanilha("unidade;valor_cota\n1;abc\n2;0\n3;450,00");
  assert.deepEqual(
    r.erros.map((e) => e.linha),
    [2, 3],
  );
});

test("modelos de exemplo trazem valor de cota por unidade (CSV = XLSX)", async () => {
  const csv = interpretarPlanilha(readFileSync(publico("modelo-importacao.csv"), "utf8"));
  assert.equal(csv.erros.length, 0);
  assert.ok(csv.linhas.every((l) => (l.valor_cota_centavos ?? 0) > 0));
  assert.equal(new Set(csv.linhas.map((l) => l.valor_cota_centavos)).size, 4, "valores diferentes entre unidades");
  const xlsx = interpretarMatriz(await lerXlsx(readFileSync(publico("modelo-importacao.xlsx"))));
  assert.deepEqual(
    xlsx.linhas.map((l) => l.valor_cota_centavos),
    csv.linhas.map((l) => l.valor_cota_centavos),
  );
});
