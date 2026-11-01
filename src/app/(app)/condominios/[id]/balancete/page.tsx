import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { CabecalhoImpressao } from "@/app/_componentes/cabecalho-impressao";
import { BotaoImprimir } from "@/app/_componentes/impressao";
import { RE_COMPETENCIA, deslocarMes, formatarData, hojeSaoPaulo } from "@/lib/datas";
import { formatarCentavos } from "@/lib/dinheiro";
import { createClient } from "@/lib/supabase/server";
import { ResumoBalancete, TabelaBalancete, resumirBalancete, type LinhaBalancete } from "@/app/_componentes/balancete";
import { BotaoEstornarLancamento, FormularioConta, FormularioLancamento } from "./formularios";

type Props = PageProps<"/condominios/[id]/balancete">;

export default function BalancetePage({ params, searchParams }: Props) {
  return (
    <Suspense fallback={<p className="p-6 text-muted-foreground">Carregando…</p>}>
      <Conteudo params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Conteudo({ params, searchParams }: { params: Props["params"]; searchParams: Props["searchParams"] }) {
  await connection(); // a data de hoje só pode ser lida em tempo de requisição
  const { id } = await params;
  const { competencia: pedida } = await searchParams;
  const hoje = hojeSaoPaulo();
  const competencia = typeof pedida === "string" && RE_COMPETENCIA.test(pedida) ? pedida : hoje.slice(0, 7);
  const inicio = `${competencia}-01`;
  const fim = `${deslocarMes(competencia, 1)}-01`;

  const supabase = await createClient();
  const { data: condominio } = await supabase.from("condominio").select("id, nome").eq("id", id).maybeSingle();
  if (!condominio) notFound();

  const [{ data: balancete }, { data: contas }, { data: lancamentos }] = await Promise.all([
    supabase
      .from("vw_balancete_mensal")
      .select("competencia, codigo, nome, tipo, total_centavos")
      .eq("condominio_id", id)
      .lt("competencia", fim),
    supabase.from("conta_contabil").select("id, codigo, nome, tipo, sistema").eq("condominio_id", id).order("codigo"),
    supabase
      .from("lancamento")
      .select("id, data, valor_centavos, descricao, estorno_de, pagamento_id, antecipacao_id, conta_contabil(codigo, tipo)")
      .eq("condominio_id", id)
      .gte("data", inicio)
      .lt("data", fim)
      .order("data", { ascending: false })
      .order("criado_em", { ascending: false })
      .limit(300),
  ]);

  const { receitas, despesas, totalReceitas, totalDespesas, resultado, saldoAnterior, saldoFinal } = resumirBalancete(
    (balancete ?? []) as LinhaBalancete[],
    inicio,
  );

  // Quais lançamentos do mês já foram estornados (o estorno pode estar em outro mês).
  const ids = (lancamentos ?? []).map((l) => l.id);
  const { data: estornos } = ids.length
    ? await supabase.from("lancamento").select("estorno_de").in("estorno_de", ids)
    : { data: [] as { estorno_de: string }[] };
  const estornados = new Set((estornos ?? []).map((e) => e.estorno_de));

  const base = `/condominios/${id}/balancete`;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-8 p-6">
      <CabecalhoImpressao
        titulo={`Balancete - ${condominio.nome}`}
        subtitulo={`Competência ${competencia.slice(5, 7)}/${competencia.slice(0, 4)}`}
        emitidoEm={formatarData(hoje)}
      />
      <header className="nao-imprimir flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <Link href={`/condominios/${id}`} className="text-sm text-muted-foreground underline">
            ← {condominio.nome}
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">Balancete</h1>
        </div>
        <BotaoImprimir />
      </header>

      <nav className="nao-imprimir flex items-center gap-4 text-sm">
        <Link href={`${base}?competencia=${deslocarMes(competencia, -1)}`} className="underline">
          ← Anterior
        </Link>
        <span className="font-medium">{competencia}</span>
        <Link href={`${base}?competencia=${deslocarMes(competencia, 1)}`} className="underline">
          Próximo →
        </Link>
      </nav>

      <section className="grid gap-6 sm:grid-cols-2">
        <TabelaBalancete titulo="Receitas" linhas={receitas} total={totalReceitas} />
        <TabelaBalancete titulo="Despesas" linhas={despesas} total={totalDespesas} />
      </section>

      <ResumoBalancete saldoAnterior={saldoAnterior} resultado={resultado} saldoFinal={saldoFinal} />
      <p className="-mt-4 text-xs text-muted-foreground">
        Regime de caixa. Cotas antecipadas pela garantidora entram como receita na antecipação, com a taxa
        como despesa. O saldo acumula o resultado dos meses anteriores (sem saldo inicial de caixa).
      </p>

      <section className="nao-imprimir flex flex-col gap-3">
        <h2 className="text-lg font-medium">Lançar despesa ou receita avulsa</h2>
        <FormularioLancamento condominioId={id} contas={contas ?? []} hoje={hoje} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Lançamentos de {competencia}</h2>
        {!lancamentos?.length ? (
          <p className="text-sm text-muted-foreground">Nenhum lançamento neste mês.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border text-muted-foreground">
              <tr>
                <th className="py-2">Data</th>
                <th>Conta</th>
                <th>Descrição</th>
                <th className="text-right">Valor</th>
                <th />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {lancamentos.map((l) => {
                const conta = Array.isArray(l.conta_contabil) ? l.conta_contabil[0] : l.conta_contabil;
                const automatico = !!l.pagamento_id || !!l.antecipacao_id;
                const ehEstorno = !!l.estorno_de;
                const jaEstornado = estornados.has(l.id);
                const sinal = (conta?.tipo === "despesa") !== ehEstorno ? -1 : 1; // despesa e estorno de receita reduzem
                return (
                  <tr key={l.id} className={ehEstorno || jaEstornado ? "text-muted-foreground/60" : undefined}>
                    <td className="py-2">{formatarData(l.data)}</td>
                    <td>{conta?.codigo}</td>
                    <td>
                      {l.descricao}
                      {jaEstornado && " (estornado)"}
                    </td>
                    <td className="text-right">{formatarCentavos(sinal * Number(l.valor_centavos))}</td>
                    <td className="nao-imprimir py-1">
                      {!automatico && !ehEstorno && !jaEstornado && (
                        <BotaoEstornarLancamento condominioId={id} lancamentoId={l.id} />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      <section className="nao-imprimir flex flex-col gap-3">
        <h2 className="text-lg font-medium">Plano de contas</h2>
        <ul className="grid gap-x-6 text-sm sm:grid-cols-2">
          {(contas ?? []).map((c) => (
            <li key={c.id} className="flex gap-2 border-b border-border py-1">
              <span className="w-10 text-muted-foreground">{c.codigo}</span>
              <span>{c.nome}</span>
              <span className="ml-auto text-xs text-muted-foreground/60">{c.tipo}</span>
            </li>
          ))}
        </ul>
        <FormularioConta condominioId={id} />
      </section>
    </div>
  );
}
