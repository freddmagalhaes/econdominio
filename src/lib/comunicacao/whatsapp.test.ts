import assert from "node:assert/strict";
import { test } from "node:test";
import { configEvolution, estadoEvolution, EvolutionWhatsapp, numeroWhatsapp } from "./evolution";
import { intervaloComVariacao, processarFila } from "./fila";
import { textoWhatsappComunicado } from "./modelos";

const cfg = { url: "https://evo.exemplo.com.br", chave: "segredo-123", instancia: "econdominio" };

test("configEvolution: exige as 3 variáveis, remove a barra final e rejeita protocolo estranho", () => {
  assert.equal(configEvolution({}), null);
  assert.equal(configEvolution({ EVOLUTION_API_URL: "https://x.com", EVOLUTION_API_KEY: "k" }), null);
  assert.deepEqual(
    configEvolution({ EVOLUTION_API_URL: "https://x.com///", EVOLUTION_API_KEY: " k ", EVOLUTION_INSTANCE: "i" }),
    { url: "https://x.com", chave: "k", instancia: "i" },
  );
  assert.equal(configEvolution({ EVOLUTION_API_URL: "ftp://x.com", EVOLUTION_API_KEY: "k", EVOLUTION_INSTANCE: "i" }), null);
  assert.equal(configEvolution({ EVOLUTION_API_URL: "nao-e-url", EVOLUTION_API_KEY: "k", EVOLUTION_INSTANCE: "i" }), null);
});

test("numeroWhatsapp aceita só 55 + DDD + número", () => {
  assert.equal(numeroWhatsapp("5511981000000"), "5511981000000");
  assert.equal(numeroWhatsapp("+55 (11) 98100-0000"), "5511981000000");
  assert.equal(numeroWhatsapp("551133334444"), "551133334444");
  for (const ruim of ["11981000000", "", "5511", "abc", "5511981000000123"]) assert.equal(numeroWhatsapp(ruim), null);
});

test("envio: chama a Evolution com apikey, número e texto, sem vazar a chave em caso de erro", async () => {
  const original = globalThis.fetch;
  const chamadas: { url: string; init: RequestInit }[] = [];
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    chamadas.push({ url, init });
    return chamadas.length === 1 ? new Response("{}", { status: 201 }) : new Response("instância desconectada", { status: 400 });
  }) as typeof fetch;
  try {
    const canal = new EvolutionWhatsapp(cfg);
    assert.deepEqual(await canal.enviar("5511981000000", "Olá"), { ok: true });
    assert.equal(chamadas[0].url, "https://evo.exemplo.com.br/message/sendText/econdominio");
    const cab = chamadas[0].init.headers as Record<string, string>;
    assert.equal(cab.apikey, "segredo-123");
    const corpo = JSON.parse(String(chamadas[0].init.body));
    assert.equal(corpo.number, "5511981000000");
    assert.equal(corpo.text, "Olá");

    const falha = await canal.enviar("5511981000000", "Olá");
    assert.equal(falha.ok, false);
    assert.match(falha.ok ? "" : falha.erro, /Evolution 400/);
    assert.ok(!(falha.ok ? "" : falha.erro).includes("segredo-123"));

    assert.deepEqual(await canal.enviar("123", "x"), { ok: false, erro: "Número de WhatsApp inválido" });
    assert.equal(chamadas.length, 2, "número inválido nem chega à rede");
  } finally {
    globalThis.fetch = original;
  }
});

test("estadoEvolution: conectado, desconectado, indisponível e não configurado", async () => {
  const original = globalThis.fetch;
  const resposta = (corpo: unknown, status = 200) => (async () => new Response(JSON.stringify(corpo), { status })) as unknown as typeof fetch;
  try {
    assert.equal(await estadoEvolution(null), "nao_configurado");
    globalThis.fetch = resposta({ instance: { instanceName: "econdominio", state: "open" } });
    assert.equal(await estadoEvolution(cfg), "conectado");
    globalThis.fetch = resposta({ state: "close" });
    assert.equal(await estadoEvolution(cfg), "desconectado");
    globalThis.fetch = resposta({}, 404);
    assert.equal(await estadoEvolution(cfg), "indisponivel");
    globalThis.fetch = (async () => { throw new Error("rede"); }) as unknown as typeof fetch;
    assert.equal(await estadoEvolution(cfg), "indisponivel");
  } finally {
    globalThis.fetch = original;
  }
});

test("fila: pausa entre mensagens, grava cada resultado na hora e respeita o orçamento de tempo", async () => {
  let relogio = 0;
  const pausas: number[] = [];
  const gravados: string[] = [];
  const r = await processarFila(
    ["a", "b", "c", "d"],
    async (item) => {
      relogio += 1000; // cada envio "leva" 1 s
      return item === "b" ? { ok: false, erro: "falhou" } : { ok: true };
    },
    {
      orcamentoMs: 2500,
      intervaloMs: () => 1000,
      pausa: async (ms) => { pausas.push(ms); relogio += ms; },
      agora: () => relogio,
      aoConcluir: async (item, resultado) => { gravados.push(`${item}:${resultado.ok}`); },
    },
  );
  // a (1s) + pausa (1s) = 2s; b (1s) -> 3s; estourou 2,5s: c e d ficam para a próxima rodada
  assert.deepEqual(r.resultados.map((x) => x.item), ["a", "b"]);
  assert.equal(r.restantes, 2);
  assert.deepEqual(gravados, ["a:true", "b:false"]);
  assert.deepEqual(pausas, [1000, 1000]);
});

test("intervalo: padrão 4 s com variação de até +50% e limites de 1 a 60 s", () => {
  assert.equal(intervaloComVariacao({}, () => 0), 4000);
  assert.equal(intervaloComVariacao({}, () => 1), 6000);
  assert.equal(intervaloComVariacao({ WHATSAPP_INTERVALO_MS: "10" }, () => 0), 1000);
  assert.equal(intervaloComVariacao({ WHATSAPP_INTERVALO_MS: "999999" }, () => 0), 60000);
});

test("texto do WhatsApp: título em negrito sem quebrar a formatação, reunião e como sair", () => {
  const t = textoWhatsappComunicado({
    condominio: "Cond Aurora",
    tipo: "reuniao",
    titulo: "Assembleia *urgente* _hoje_",
    corpo: "Pauta:\n1. Contas",
    dataReuniao: "2026-12-05T22:00:00Z",
    local: "Salão",
  });
  assert.ok(t.startsWith("*Assembleia urgente hoje*\nCond Aurora"));
  assert.match(t, /Quando: .*19:00/);
  assert.match(t, /Onde: Salão/);
  assert.match(t, /deixar de receber/);
  assert.ok(textoWhatsappComunicado({ condominio: "c", tipo: "aviso", titulo: "t", corpo: "x".repeat(9000) }).length <= 3900);
});
