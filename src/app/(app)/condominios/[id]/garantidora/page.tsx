import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { formatarData, hojeSaoPaulo } from "@/lib/datas";
import { bpsParaTexto, formatarCentavos } from "@/lib/dinheiro";
import { createClient } from "@/lib/supabase/server";
import {
  BotaoRepasse,
  FormularioAntecipar,
  FormularioContrato,
  FormularioGarantidora,
} from "./formularios";

type Props = PageProps<"/condominios/[id]/garantidora">;

export default function GarantidoraPage({ params }: Props) {
  return (
    <Suspense fallback={<p className="p-6 text-muted-foreground">Carregando…</p>}>
      <Conteudo params={params} />
    </Suspense>
  );
}

function Cartao({ titulo, valor, destaque }: { titulo: string; valor: number; destaque?: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-card shadow-sm p-3">
      <p className="text-xs text-muted-foreground">{titulo}</p>
      <p className={`text-lg font-semibold ${destaque ? "text-warning" : ""}`}>
        {formatarCentavos(valor)}
      </p>
    </div>
  );
}

async function Conteudo({ params }: { params: Props["params"] }) {
  await connection(); // a data de hoje só pode ser lida em tempo de requisição
  const { id } = await params;
  const hoje = hojeSaoPaulo();
  const supabase = await createClient();

  const { data: condominio } = await supabase
    .from("condominio")
    .select("id, nome, organizacao_id")
    .eq("id", id)
    .maybeSingle();
  if (!condominio) notFound();

  const [{ data: garantidoras }, { data: contratos }, { data: saldos }, { data: repasses }] =
    await Promise.all([
      supabase.from("garantidora").select("id, nome").eq("organizacao_id", condominio.organizacao_id).order("nome"),
      supabase
        .from("contrato_garantidora")
        .select("id, taxa_antecipacao_bps, prazo_repasse_dias, vigencia_inicio, vigencia_fim, ativo, garantidora(nome)")
        .eq("condominio_id", id)
        .order("vigencia_inicio", { ascending: false }),
      supabase.from("vw_garantidora_saldo").select("*").eq("condominio_id", id),
      supabase
        .from("repasse")
        .select("id, contrato_id, valor_centavos, previsto_para")
        .eq("condominio_id", id)
        .eq("status", "pendente")
        .order("previsto_para")
        .limit(200),
    ]);

  const soma = (campo: string) =>
    (saldos ?? []).reduce((s, x) => s + Number((x as Record<string, number>)[campo]), 0);
  const contratosAtivos = (contratos ?? []).filter((c) => c.ativo);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-8 p-6">
      <header className="flex flex-col gap-1">
        <Link href={`/condominios/${id}`} className="text-sm text-muted-foreground underline">
          ← {condominio.nome}
        </Link>
        <h1 className="text-2xl font-semibold">Garantidora</h1>
      </header>

      {saldos && saldos.length > 0 && (
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Cartao titulo="Cotas antecipadas (total)" valor={soma("total_cotas_centavos")} />
          <Cartao titulo="Taxas pagas" valor={soma("taxa_centavos")} />
          <Cartao titulo="Recebido dos condôminos" valor={soma("recebido_centavos")} />
          <Cartao titulo="A repassar à garantidora" valor={soma("a_repassar_centavos")} destaque />
          <Cartao titulo="Já repassado" valor={soma("repassado_centavos")} />
          <Cartao titulo="Antecipado e ainda não pago" valor={soma("em_aberto_centavos")} destaque />
        </section>
      )}

      {contratosAtivos.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-medium">Antecipar cotas</h2>
          {contratosAtivos.map((c) => {
            const g = Array.isArray(c.garantidora) ? c.garantidora[0] : c.garantidora;
            return (
              <div key={c.id} className="flex flex-col gap-2 rounded-xl border border-border bg-card shadow-sm p-3">
                <p className="text-sm text-muted-foreground">
                  {g?.nome} · taxa {bpsParaTexto(c.taxa_antecipacao_bps)}% · repasse em{" "}
                  {c.prazo_repasse_dias} dias
                </p>
                <FormularioAntecipar
                  condominioId={id}
                  contratoId={c.id}
                  competencia={hoje.slice(0, 7)}
                  hoje={hoje}
                />
              </div>
            );
          })}
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Repasses pendentes ({repasses?.length ?? 0})</h2>
        {!repasses?.length ? (
          <p className="text-sm text-muted-foreground">
            Nenhum repasse pendente. Eles surgem quando um condômino paga uma cota antecipada.
          </p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border text-muted-foreground">
              <tr>
                <th className="py-2">Previsto para</th>
                <th>Valor</th>
                <th />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {repasses.map((r) => (
                <tr key={r.id} className="align-top">
                  <td className={`py-2 ${r.previsto_para < hoje ? "text-danger" : ""}`}>
                    {formatarData(r.previsto_para)}
                    {r.previsto_para < hoje && " (atrasado)"}
                  </td>
                  <td>{formatarCentavos(Number(r.valor_centavos))}</td>
                  <td className="py-1">
                    <BotaoRepasse condominioId={id} repasseId={r.id} hoje={hoje} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Contratos</h2>
        {!contratos?.length ? (
          <p className="text-sm text-muted-foreground">Nenhum contrato cadastrado.</p>
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border bg-card shadow-sm text-sm">
            {contratos.map((c) => {
              const g = Array.isArray(c.garantidora) ? c.garantidora[0] : c.garantidora;
              return (
                <li key={c.id} className="px-3 py-2">
                  {g?.nome} · {bpsParaTexto(c.taxa_antecipacao_bps)}% · {c.prazo_repasse_dias} dias ·{" "}
                  {formatarData(c.vigencia_inicio)}
                  {c.vigencia_fim ? ` a ${formatarData(c.vigencia_fim)}` : " em diante"}
                  {!c.ativo && " (inativo)"}
                </li>
              );
            })}
          </ul>
        )}

        {garantidoras && garantidoras.length > 0 && (
          <FormularioContrato condominioId={id} garantidoras={garantidoras} hoje={hoje} />
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Garantidoras da organização</h2>
        {garantidoras && garantidoras.length > 0 && (
          <p className="text-sm text-muted-foreground">{garantidoras.map((g) => g.nome).join(", ")}</p>
        )}
        <FormularioGarantidora condominioId={id} />
      </section>
    </div>
  );
}
