import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { CabecalhoImpressao } from "@/app/_componentes/cabecalho-impressao";
import { BotaoImprimir } from "@/app/_componentes/impressao";
import { RE_COMPETENCIA, deslocarMes, formatarData, hojeSaoPaulo } from "@/lib/datas";
import { formatarCentavos } from "@/lib/dinheiro";
import { createClient } from "@/lib/supabase/server";

type Props = PageProps<"/relatorios">;

export type LinhaRelatorio = {
  condominio_id: string;
  condominio: string;
  unidades: number;
  cotas: number;
  previsto_centavos: number;
  recebido_centavos: number;
  cotas_em_atraso: number;
  em_atraso_centavos: number;
  a_repassar_centavos: number;
  repasses_atrasados: number;
  repasses_atrasados_centavos: number;
  antecipado_em_aberto_centavos: number;
};

export default function RelatoriosPage({ searchParams }: Props) {
  return (
    <Suspense fallback={<p className="p-6 text-muted-foreground">Carregando…</p>}>
      <Conteudo searchParams={searchParams} />
    </Suspense>
  );
}

const pct = (parte: number, total: number) =>
  total > 0 ? `${((parte / total) * 100).toFixed(1).replace(".", ",")}%` : "—";

async function Conteudo({ searchParams }: { searchParams: Props["searchParams"] }) {
  await connection(); // a data de hoje só pode ser lida em tempo de requisição
  const { competencia: pedida } = await searchParams;
  const competencia =
    typeof pedida === "string" && RE_COMPETENCIA.test(pedida) ? pedida : hojeSaoPaulo().slice(0, 7);

  const supabase = await createClient();
  const { data: organizacoes } = await supabase.from("organizacao").select("id, nome").order("nome");

  const relatorios = await Promise.all(
    (organizacoes ?? []).map(async (org) => {
      const { data } = await supabase.rpc("relatorio_consolidado", {
        p_organizacao: org.id,
        p_competencia: `${competencia}-01`,
      });
      return { org, linhas: (data ?? []) as LinhaRelatorio[] };
    }),
  );

  const base = "/relatorios";
  const soma = (linhas: LinhaRelatorio[], campo: keyof LinhaRelatorio) =>
    linhas.reduce((s, l) => s + Number(l[campo]), 0);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8 p-6">
      <CabecalhoImpressao
        titulo="Relatório consolidado"
        subtitulo={`Competência ${competencia.slice(5, 7)}/${competencia.slice(0, 4)}`}
        emitidoEm={formatarData(hojeSaoPaulo())}
      />
      <header className="nao-imprimir flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Relatório consolidado</h1>
          <p className="text-sm text-muted-foreground">Todos os condomínios da administradora, por competência.</p>
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

      <p className="text-xs text-muted-foreground">
        Previsto e recebido referem-se às cotas da competência. &quot;Em atraso&quot; é cumulativo
        (todas as cotas abertas já vencidas).
      </p>

      {relatorios.map(({ org, linhas }) => {
        const previsto = soma(linhas, "previsto_centavos");
        const recebido = soma(linhas, "recebido_centavos");
        return (
          <section key={org.id} className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-medium">{org.nome}</h2>
              <a
                href={`/relatorios/exportar?organizacao=${org.id}&competencia=${competencia}`}
                className="nao-imprimir text-sm underline"
              >
                Exportar CSV
              </a>
            </div>

            {linhas.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum condomínio ativo.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-border text-muted-foreground">
                    <tr>
                      <th className="py-2">Condomínio</th>
                      <th>Unid.</th>
                      <th>Previsto</th>
                      <th>Recebido</th>
                      <th>%</th>
                      <th>Em atraso</th>
                      <th>A repassar</th>
                      <th>Repasses atrasados</th>
                      <th>Antecipado em aberto</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {linhas.map((l) => (
                      <tr key={l.condominio_id}>
                        <td className="py-2">
                          <Link href={`/condominios/${l.condominio_id}`} className="underline">
                            {l.condominio}
                          </Link>
                        </td>
                        <td>{l.unidades}</td>
                        <td>{formatarCentavos(l.previsto_centavos)}</td>
                        <td>{formatarCentavos(l.recebido_centavos)}</td>
                        <td>{pct(Number(l.recebido_centavos), Number(l.previsto_centavos))}</td>
                        <td className={Number(l.em_atraso_centavos) > 0 ? "text-danger" : undefined}>
                          {formatarCentavos(l.em_atraso_centavos)}
                          {l.cotas_em_atraso > 0 && ` (${l.cotas_em_atraso})`}
                        </td>
                        <td>{formatarCentavos(l.a_repassar_centavos)}</td>
                        <td className={l.repasses_atrasados > 0 ? "text-danger" : undefined}>
                          {formatarCentavos(l.repasses_atrasados_centavos)}
                          {l.repasses_atrasados > 0 && ` (${l.repasses_atrasados})`}
                        </td>
                        <td>{formatarCentavos(l.antecipado_em_aberto_centavos)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t border-border font-medium">
                    <tr>
                      <td className="py-2">Total</td>
                      <td>{soma(linhas, "unidades")}</td>
                      <td>{formatarCentavos(previsto)}</td>
                      <td>{formatarCentavos(recebido)}</td>
                      <td>{pct(recebido, previsto)}</td>
                      <td>
                        {formatarCentavos(soma(linhas, "em_atraso_centavos"))} (
                        {soma(linhas, "cotas_em_atraso")})
                      </td>
                      <td>{formatarCentavos(soma(linhas, "a_repassar_centavos"))}</td>
                      <td>
                        {formatarCentavos(soma(linhas, "repasses_atrasados_centavos"))} (
                        {soma(linhas, "repasses_atrasados")})
                      </td>
                      <td>{formatarCentavos(soma(linhas, "antecipado_em_aberto_centavos"))}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
