import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { RE_COMPETENCIA, deslocarMes, formatarData, hojeSaoPaulo } from "@/lib/datas";
import { centavosParaTexto, formatarCentavos } from "@/lib/dinheiro";
import { createClient } from "@/lib/supabase/server";
import { AcoesCota, FormularioGerar } from "./formularios";

type Props = PageProps<"/condominios/[id]/cotas">;

const ROTULO_STATUS: Record<string, string> = {
  aberta: "Aberta",
  paga: "Paga",
  cancelada: "Cancelada",
};

export default function CotasPage({ params, searchParams }: Props) {
  return (
    <Suspense fallback={<p className="p-6 text-muted-foreground">Carregando…</p>}>
      <Conteudo params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Conteudo({ params, searchParams }: Props) {
  await connection(); // a data de hoje só pode ser lida em tempo de requisição
  const { id } = await params;
  const { competencia: pedida } = await searchParams;

  const hoje = hojeSaoPaulo();
  const competencia =
    typeof pedida === "string" && RE_COMPETENCIA.test(pedida) ? pedida : hoje.slice(0, 7);

  const supabase = await createClient();
  const { data: condominio } = await supabase
    .from("condominio")
    .select("id, nome")
    .eq("id", id)
    .maybeSingle();
  if (!condominio) notFound();

  const { data: cotas } = await supabase
    .from("vw_cotas_situacao")
    .select("id, bloco, unidade, vencimento, valor_centavos, valor_pago_centavos, status")
    .eq("condominio_id", id)
    .eq("competencia", `${competencia}-01`)
    .order("bloco", { nullsFirst: true })
    .order("unidade");

  const lista = cotas ?? [];

  // Quantas unidades têm valor de cota cadastrado (usado na geração) e quais cotas já foram antecipadas.
  const [{ count: totalUnidades }, { count: semValor }, { data: antecipadas }] = await Promise.all([
    supabase.from("unidade").select("id", { count: "exact", head: true }).eq("condominio_id", id),
    supabase
      .from("unidade")
      .select("id", { count: "exact", head: true })
      .eq("condominio_id", id)
      .is("valor_cota_centavos", null),
    lista.length
      ? supabase.from("antecipacao").select("cota_id").in("cota_id", lista.map((c) => c.id))
      : Promise.resolve({ data: [] as { cota_id: string }[] }),
  ]);
  const antecipadaSet = new Set((antecipadas ?? []).map((a) => a.cota_id as string));
  const total = lista.reduce((s, c) => s + Number(c.valor_centavos), 0);
  const recebido = lista.reduce((s, c) => s + Number(c.valor_pago_centavos), 0);
  const base = `/condominios/${id}/cotas`;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 p-6">
      <header className="flex flex-col gap-1">
        <Link href={`/condominios/${id}`} className="text-sm text-muted-foreground underline">
          ← {condominio.nome}
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Cotas</h1>
      </header>

      <nav className="flex items-center gap-4 text-sm">
        <Link href={`${base}?competencia=${deslocarMes(competencia, -1)}`} className="underline">
          ← Anterior
        </Link>
        <span className="font-medium">{competencia}</span>
        <Link href={`${base}?competencia=${deslocarMes(competencia, 1)}`} className="underline">
          Próximo →
        </Link>
      </nav>

      <section className="flex flex-col gap-2 rounded-xl border border-border bg-card shadow-sm p-3">
        <h2 className="text-sm font-medium">Gerar cotas de {competencia}</h2>
        <FormularioGerar
          condominioId={id}
          competencia={competencia}
          vencimentoPadrao={`${competencia}-10`}
          totalUnidades={totalUnidades ?? 0}
          semValor={semValor ?? 0}
        />
      </section>

      <section className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">
          {lista.length} cotas · previsto {formatarCentavos(total)} · recebido{" "}
          {formatarCentavos(recebido)}
        </p>

        {lista.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma cota neste mês.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Unidade</th>
                <th className="px-3 font-medium">Vencimento</th>
                <th className="px-3 font-medium">Valor</th>
                <th className="px-3 font-medium">Pago</th>
                <th className="px-3 font-medium">Situação</th>
                <th />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {lista.map((c) => {
                const valor = Number(c.valor_centavos);
                const pago = Number(c.valor_pago_centavos);
                const atrasada = c.status === "aberta" && c.vencimento < hoje;
                return (
                  <tr key={c.id} className="align-top">
                    <td className="px-3 py-2">
                      {c.bloco ? `${c.bloco} · ` : ""}
                      {c.unidade}
                    </td>
                    <td className="px-3 py-2">{formatarData(c.vencimento)}</td>
                    <td className="px-3 py-2">{formatarCentavos(valor)}</td>
                    <td className="px-3 py-2">{formatarCentavos(pago)}</td>
                    <td className={`px-3 py-2 ${atrasada ? "text-danger" : ""}`}>
                      {atrasada ? "Em atraso" : ROTULO_STATUS[c.status]}
                    </td>
                    <td className="py-1">
                      <AcoesCota
                        condominioId={id}
                        cotaId={c.id}
                        saldoTexto={centavosParaTexto(Math.max(valor - pago, 0))}
                        valorTexto={centavosParaTexto(valor)}
                        vencimento={c.vencimento}
                        hoje={hoje}
                        podeBaixar={c.status === "aberta" && valor > pago}
                        podeEstornar={pago > 0}
                        editavel={c.status === "aberta" && pago === 0 && !antecipadaSet.has(c.id)}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
