import { z } from "zod";
import { RE_COMPETENCIA } from "@/lib/datas";
import { centavosParaTexto } from "@/lib/dinheiro";
import { createClient } from "@/lib/supabase/server";
import type { LinhaRelatorio } from "../page";

const parametros = z.object({
  organizacao: z.uuid(),
  competencia: z.string().regex(RE_COMPETENCIA),
});

const COLUNAS: [string, (l: LinhaRelatorio) => string | number][] = [
  ["Condomínio", (l) => l.condominio],
  ["Unidades", (l) => l.unidades],
  ["Cotas da competência", (l) => l.cotas],
  ["Previsto (R$)", (l) => centavosParaTexto(Number(l.previsto_centavos))],
  ["Recebido (R$)", (l) => centavosParaTexto(Number(l.recebido_centavos))],
  ["Cotas em atraso", (l) => l.cotas_em_atraso],
  ["Em atraso (R$)", (l) => centavosParaTexto(Number(l.em_atraso_centavos))],
  ["A repassar (R$)", (l) => centavosParaTexto(Number(l.a_repassar_centavos))],
  ["Repasses atrasados", (l) => l.repasses_atrasados],
  ["Repasses atrasados (R$)", (l) => centavosParaTexto(Number(l.repasses_atrasados_centavos))],
  ["Antecipado em aberto (R$)", (l) => centavosParaTexto(Number(l.antecipado_em_aberto_centavos))],
];

// Evita injeção de fórmulas ao abrir no Excel e escapa separador/aspas.
function celula(valor: string | number): string {
  let texto = String(valor);
  if (/^[=+\-@\t\r]/.test(texto)) texto = `'${texto}`;
  return /[;"\n\r]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const dados = parametros.safeParse({
    organizacao: searchParams.get("organizacao"),
    competencia: searchParams.get("competencia"),
  });
  if (!dados.success) return new Response("Parâmetros inválidos", { status: 400 });

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("relatorio_consolidado", {
    p_organizacao: dados.data.organizacao,
    p_competencia: `${dados.data.competencia}-01`,
  });
  if (error) return new Response("Não foi possível gerar o relatório", { status: 500 });

  const linhas = (data ?? []) as LinhaRelatorio[];
  const corpo = [
    COLUNAS.map(([titulo]) => celula(titulo)).join(";"),
    ...linhas.map((l) => COLUNAS.map(([, valor]) => celula(valor(l))).join(";")),
  ].join("\r\n");

  return new Response(`﻿${corpo}\r\n`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="consolidado-${dados.data.competencia}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
