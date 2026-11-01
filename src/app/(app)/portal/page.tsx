import Link from "next/link";
import { Suspense } from "react";
import { ResumoBalancete, TabelaBalancete, resumirBalancete, type LinhaBalancete } from "@/app/_componentes/balancete";
import { montarTermo, type TipoVinculo } from "@/lib/consentimento";
import { RE_COMPETENCIA, deslocarMes, formatarData, formatarDataHoraCurta, hojeSaoPaulo } from "@/lib/datas";
import { formatarCentavos } from "@/lib/dinheiro";
import { formatarDataHora } from "@/lib/comunicacao/modelos";
import { createClient } from "@/lib/supabase/server";
import { sair } from "@/app/login/actions";
import { MinhasAutorizacoes, TermoAceite, type GrupoTermo } from "./termo";

type Props = PageProps<"/portal">;

type Unidade = { unidade_id: string; condominio_id: string; condominio: string; bloco: string | null; unidade: string };
type Cota = {
  competencia: string;
  vencimento: string;
  valor_centavos: number;
  valor_pago_centavos: number;
  status: "aberta" | "paga" | "cancelada";
};
type Comunicado = {
  id: string;
  tipo: "aviso" | "reuniao";
  titulo: string;
  corpo: string;
  data_reuniao: string | null;
  local: string | null;
  criado_em: string;
};

export default function PortalPage({ searchParams }: Props) {
  return (
    <Suspense fallback={<p className="p-6 text-muted-foreground">Carregando…</p>}>
      <Conteudo searchParams={searchParams} />
    </Suspense>
  );
}

type LinhaTermo = {
  unidade_id: string;
  condominio_id: string;
  condominio: string;
  bloco: string | null;
  unidade: string;
  tipo: TipoVinculo | null;
  pessoa_id: string | null;
  pessoa_nome: string | null;
  documento: string | null;
  email: string | null;
  telefone: string | null;
  aceita_email: boolean | null;
  aceita_whatsapp: boolean | null;
  aceito_em: string | null;
};

/** Um termo por (condomínio, pessoa): cada um lista as unidades e o vínculo daquela pessoa. */
function montarGrupos(linhas: LinhaTermo[]): GrupoTermo[] {
  const grupos = new Map<string, LinhaTermo[]>();
  for (const l of linhas) {
    const chave = `${l.condominio_id}|${l.pessoa_id ?? l.unidade_id}`;
    grupos.set(chave, [...(grupos.get(chave) ?? []), l]);
  }
  return [...grupos.values()].map((ls) => ({
    condominio: ls[0].condominio,
    paragrafos: montarTermo({
      condominio: ls[0].condominio,
      nome: ls[0].pessoa_nome ?? "",
      documento: ls[0].documento,
      vinculos: ls.map((l) => ({ bloco: l.bloco, unidade: l.unidade, tipo: l.tipo ?? "proprietario" })),
    }),
  }));
}

const rotuloUnidade = (u: Unidade) => `${u.bloco ? `Bloco ${u.bloco} · ` : ""}Unidade ${u.unidade}`;

async function Conteudo({ searchParams }: { searchParams: Props["searchParams"] }) {
  const { unidade: pedidaUnidade, competencia: pedidaCompetencia } = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase.rpc("portal_minhas_unidades");
  const minhas = (data ?? []) as Unidade[];

  if (minhas.length === 0) {
    return (
      <div className="mx-auto flex max-w-xl flex-col gap-4 p-6">
        <h1 className="text-2xl font-semibold">Portal do morador</h1>
        <p className="text-muted-foreground">
          Você ainda não tem acesso a nenhuma unidade. Peça um convite ao síndico ou à administradora e abra o
          link recebido por e-mail.
        </p>
        <div className="flex gap-4 text-sm">
          <Link href="/dashboard" className="underline">
            Painel de gestão
          </Link>
          <form action={sair}>
            <button className="text-muted-foreground underline">Sair</button>
          </form>
        </div>
      </div>
    );
  }

  // Aceite obrigatório do termo: sem ele o portal não mostra nada (e o banco também não entrega os dados).
  const { data: termoData } = await supabase.rpc("portal_dados_termo");
  const linhasTermo = (termoData ?? []) as LinhaTermo[];
  const gruposTermo = montarGrupos(linhasTermo);
  const canais = {
    inicialEmail: linhasTermo.every((l) => !!l.aceita_email),
    inicialWhatsapp: linhasTermo.every((l) => !!l.aceita_whatsapp),
    temEmail: linhasTermo.every((l) => !!l.email),
    temTelefone: linhasTermo.every((l) => !!l.telefone),
  };
  if (linhasTermo.some((l) => !l.aceito_em)) {
    return (
      <TermoAceite
        grupos={gruposTermo}
        semDocumento={linhasTermo.some((l) => !l.documento || !l.pessoa_id)}
        {...canais}
      />
    );
  }
  const aceitoEmIso = linhasTermo.map((l) => l.aceito_em as string).sort().at(-1) ?? null;

  const atual = minhas.find((u) => u.unidade_id === pedidaUnidade) ?? minhas[0];
  const hoje = hojeSaoPaulo();
  const competencia =
    typeof pedidaCompetencia === "string" && RE_COMPETENCIA.test(pedidaCompetencia)
      ? pedidaCompetencia
      : hoje.slice(0, 7);
  const inicio = `${competencia}-01`;

  const [{ data: cotasData }, { data: balData }, { data: comData }] = await Promise.all([
    supabase.rpc("portal_cotas", { p_unidade: atual.unidade_id }),
    supabase.rpc("portal_balancete", { p_condominio: atual.condominio_id, p_ate: inicio }),
    supabase.rpc("portal_comunicados", { p_condominio: atual.condominio_id }),
  ]);
  const cotas = (cotasData ?? []) as Cota[];
  const comunicados = (comData ?? []) as Comunicado[];
  const bal = resumirBalancete((balData ?? []) as LinhaBalancete[], inicio);
  const base = `/portal?unidade=${atual.unidade_id}`;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8 p-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{atual.condominio}</h1>
          <p className="text-sm text-muted-foreground">{rotuloUnidade(atual)}</p>
        </div>
        <form action={sair}>
          <button className="text-sm text-muted-foreground underline">Sair</button>
        </form>
      </header>

      {minhas.length > 1 && (
        <nav className="flex flex-wrap gap-3 text-sm">
          {minhas.map((u) => (
            <Link
              key={u.unidade_id}
              href={`/portal?unidade=${u.unidade_id}`}
              className={u.unidade_id === atual.unidade_id ? "font-semibold underline" : "underline"}
            >
              {u.condominio} · {rotuloUnidade(u)}
            </Link>
          ))}
        </nav>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Minhas cotas</h2>
        {cotas.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma cota lançada para esta unidade.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border text-muted-foreground">
              <tr>
                <th className="py-2">Competência</th>
                <th>Vencimento</th>
                <th>Valor</th>
                <th>Pago</th>
                <th>Situação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {cotas.map((c) => {
                const atrasada = c.status === "aberta" && c.vencimento < hoje;
                return (
                  <tr key={c.competencia}>
                    <td className="py-2">{c.competencia.slice(5, 7)}/{c.competencia.slice(0, 4)}</td>
                    <td>{formatarData(c.vencimento)}</td>
                    <td>{formatarCentavos(c.valor_centavos)}</td>
                    <td>{formatarCentavos(c.valor_pago_centavos)}</td>
                    <td className={atrasada ? "text-danger" : undefined}>
                      {c.status === "paga" ? "Paga" : atrasada ? "Em atraso" : "Em aberto"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-medium">Balancete do condomínio</h2>
        <nav className="flex items-center gap-4 text-sm">
          <Link href={`${base}&competencia=${deslocarMes(competencia, -1)}`} className="underline">
            ← Anterior
          </Link>
          <span className="font-medium">{competencia}</span>
          <Link href={`${base}&competencia=${deslocarMes(competencia, 1)}`} className="underline">
            Próximo →
          </Link>
        </nav>
        <div className="grid gap-6 sm:grid-cols-2">
          <TabelaBalancete titulo="Receitas" linhas={bal.receitas} total={bal.totalReceitas} />
          <TabelaBalancete titulo="Despesas" linhas={bal.despesas} total={bal.totalDespesas} />
        </div>
        <ResumoBalancete saldoAnterior={bal.saldoAnterior} resultado={bal.resultado} saldoFinal={bal.saldoFinal} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Comunicados</h2>
        {comunicados.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum comunicado.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {comunicados.map((m) => (
              <li key={m.id} className="rounded-xl border border-border bg-card shadow-sm p-3">
                <p className="text-xs text-muted-foreground">
                  {m.tipo === "reuniao" ? "Reunião" : "Aviso"} · {formatarData(m.criado_em.slice(0, 10))}
                </p>
                <h3 className="font-medium">{m.titulo}</h3>
                {m.tipo === "reuniao" && m.data_reuniao && (
                  <p className="mt-1 text-sm">
                    <strong>Quando:</strong> {formatarDataHora(m.data_reuniao)}
                    {m.local && (
                      <>
                        <br />
                        <strong>Onde:</strong> {m.local}
                      </>
                    )}
                  </p>
                )}
                <p className="mt-2 whitespace-pre-wrap text-sm text-foreground/80">{m.corpo}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <MinhasAutorizacoes
        grupos={gruposTermo}
        aceitoEm={aceitoEmIso ? formatarDataHoraCurta(aceitoEmIso) : null}
        {...canais}
      />
    </div>
  );
}
