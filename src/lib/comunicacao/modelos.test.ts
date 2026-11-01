import assert from "node:assert/strict";
import { test } from "node:test";
import { gerarToken, hashToken, RE_TOKEN } from "../convite";
import { caminhoSeguro } from "../redirecionamento";
import { emailComunicado, emailConvite, escaparHtml } from "./modelos";

test("escaparHtml neutraliza marcação e aspas", () => {
  assert.equal(
    escaparHtml(`<script>alert("x")</script> & 'y'`),
    "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;y&#39;",
  );
});

test("comunicado: conteúdo do usuário é escapado e quebras viram <br>", () => {
  const m = emailComunicado({
    condominio: "Cond <b>A</b>",
    tipo: "aviso",
    titulo: "Aviso <img src=x onerror=alert(1)>",
    corpo: "linha 1\nlinha <2>",
  });
  assert.ok(!m.html.includes("<img"));
  assert.ok(!m.html.includes("<b>A</b>"));
  assert.ok(m.html.includes("linha 1<br>linha &lt;2&gt;"));
});

test("assunto não aceita quebras de linha (injeção de cabeçalho)", () => {
  const m = emailComunicado({ condominio: "X", tipo: "aviso", titulo: "Oi\r\nBcc: alguem@x.com", corpo: "c" });
  assert.ok(!/[\r\n]/.test(m.assunto));
});

test("reunião mostra data no fuso de São Paulo e local", () => {
  const m = emailComunicado({
    condominio: "Cond",
    tipo: "reuniao",
    titulo: "Assembleia",
    corpo: "Pauta",
    dataReuniao: "2027-06-01T22:00:00Z",
    local: "Salão de festas",
  });
  assert.match(m.html, /19:00/);
  assert.match(m.html, /Salão de festas/);
  assert.match(m.assunto, /^Reunião: /);
  assert.match(m.texto, /Quando:/);
});

test("convite contém o link e o escapa no atributo", () => {
  const m = emailConvite({
    condominio: "Cond",
    unidade: "101",
    bloco: "A",
    link: 'https://x.test/convite/abc"onmouseover="y',
  });
  assert.ok(!m.html.includes('abc"onmouseover'));
  assert.match(m.texto, /bloco A, unidade 101/);
});

test("token do convite: 43 caracteres url-safe e hash determinístico", () => {
  const { token, hash } = gerarToken();
  assert.match(token, RE_TOKEN);
  assert.equal(hash, hashToken(token));
  assert.equal(hash.length, 64);
  assert.notEqual(gerarToken().token, token);
});

test("caminhoSeguro bloqueia redirecionamentos externos", () => {
  assert.equal(caminhoSeguro("/convite/abc"), "/convite/abc");
  assert.equal(caminhoSeguro("/portal?unidade=1&x=2"), "/portal?unidade=1&x=2");
  for (const ruim of ["//evil.com", "https://evil.com", "evil", "/\\evil.com", "/a\nb", undefined, 5]) {
    assert.equal(caminhoSeguro(ruim), "/dashboard");
  }
});
