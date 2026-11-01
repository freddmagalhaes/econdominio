import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Icone, type NomeIcone } from "@/app/_componentes/icones";
import { centavosParaTexto } from "@/lib/dinheiro";
import { createClient } from "@/lib/supabase/server";
import { ValorCotaUnidade, ValorParaTodas } from "./valor-cota";
import { FormularioImportacao } from "./formulario-importacao";

const ATALHOS: { sufixo: string; rotulo: string; descricao: string; icone: NomeIcone }[] = [
  { sufixo: "/cotas", rotulo: "Cotas", descricao: "Gerar, dar baixa e estornar", icone: "cotas" },
  { sufixo: "/garantidora", rotulo: "Garantidora", descricao: "Antecipação e repasses", icone: "escudo" },
  { sufixo: "/balancete", rotulo: "Balancete", descricao: "Receitas, despesas e lançamentos", icone: "balanca" },
  { sufixo: "/pessoas", rotulo: "Pessoas", descricao: "Dados e autorização de comunicados", icone: "pessoas" },
  { sufixo: "/moradores", rotulo: "Acesso ao portal", descricao: "Convites aos moradores", icone: "chave" },
  { sufixo: "/comunicados", rotulo: "Comunicados", descricao: "Avisos e reuniões", icone: "megafone" },
];

const LIMITE_LISTA = 500;

export default function CondominioPage({ params }: PageProps<"/condominios/[id]">) {
  return (
    <Suspense fallback={<p className="p-6 text-muted-foreground">Carregando…</p>}>
      <Conteudo params={params} />
    </Suspense>
  );
}

async function Conteudo({ params }: { params: PageProps<"/condominios/[id]">["params"] }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: condominio } = await supabase
    .from("condominio")
    .select("id, nome")
    .eq("id", id)
    .maybeSingle();
  if (!condominio) notFound();

  const { data: unidades, count } = await supabase
    .from("unidade")
    .select("id, identificador, valor_cota_centavos, bloco(nome), vinculo_unidade(principal, pessoa(nome))", {
      count: "exact",
    })
    .eq("condominio_id", id)
    .order("identificador")
    .limit(LIMITE_LISTA);

  const nomeBloco = (u: NonNullable<typeof unidades>[number]) => (Array.isArray(u.bloco) ? u.bloco[0] : u.bloco)?.nome ?? "";
  const ordenadas = [...(unidades ?? [])].sort(
    (a, b) =>
      nomeBloco(a).localeCompare(nomeBloco(b), "pt-BR", { numeric: true }) ||
      a.identificador.localeCompare(b.identificador, "pt-BR", { numeric: true }),
  );
  const semValor = ordenadas.filter((u) => !u.valor_cota_centavos).length;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-8">
      <header className="flex flex-col gap-1">
        <Link href="/dashboard" className="text-sm text-muted-foreground underline">
          ← Condomínios
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">{condominio.nome}</h1>
        <nav className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label="Seções do condomínio">
          {ATALHOS.map((a) => (
            <Link
              key={a.sufixo}
              href={`/condominios/${condominio.id}${a.sufixo}`}
              className="flex items-center gap-3 rounded-xl border border-border bg-card p-3.5 shadow-sm transition-colors hover:bg-muted"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Icone nome={a.icone} tamanho={18} />
              </span>
              <span>
                <span className="block text-sm font-medium">{a.rotulo}</span>
                <span className="block text-xs text-muted-foreground">{a.descricao}</span>
              </span>
            </Link>
          ))}
        </nav>
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Importar unidades e proprietários</h2>
        <p className="text-sm text-muted-foreground">
          Planilha Excel (.xlsx) ou CSV com as colunas bloco, unidade, nome, documento, email, telefone, tipo e
          valor_cota. Só &quot;unidade&quot; é obrigatória. Importar de novo não duplica registros e atualiza o valor da cota.
        </p>
        <FormularioImportacao condominioId={condominio.id} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Unidades ({count ?? 0})</h2>
        <p className="text-sm text-muted-foreground">
          Cada unidade tem o seu valor de cota mensal. Ele é usado ao gerar as cotas do mês e pode ser igual para
          todas ou diferente.
          {semValor > 0 && (
            <span className="text-warning"> {semValor} unidade(s) ainda sem valor cadastrado.</span>
          )}
        </p>
        {!unidades?.length ? (
          <p className="text-sm text-muted-foreground">Nenhuma unidade cadastrada.</p>
        ) : (
          <>
            <ValorParaTodas condominioId={condominio.id} />
            <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-border text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Bloco</th>
                    <th className="px-4 py-2.5 font-medium">Unidade</th>
                    <th className="px-4 py-2.5 font-medium">Responsável</th>
                    <th className="px-4 py-2.5 text-right font-medium">Cota mensal (R$)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {ordenadas.map((u) => {
                    const bloco = Array.isArray(u.bloco) ? u.bloco[0] : u.bloco;
                    const vinculos = u.vinculo_unidade ?? [];
                    const principal = vinculos.find((v) => v.principal) ?? vinculos[0];
                    const pessoa = Array.isArray(principal?.pessoa) ? principal.pessoa[0] : principal?.pessoa;
                    return (
                      <tr key={u.id}>
                        <td className="px-4 py-2">{bloco?.nome ?? "—"}</td>
                        <td className="px-4 py-2">{u.identificador}</td>
                        <td className="px-4 py-2">{pessoa?.nome ?? "—"}</td>
                        <td className="px-4 py-1.5">
                          <ValorCotaUnidade
                            condominioId={condominio.id}
                            unidadeId={u.id}
                            valorTexto={u.valor_cota_centavos ? centavosParaTexto(Number(u.valor_cota_centavos)) : ""}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
        {(count ?? 0) > LIMITE_LISTA && (
          <p className="text-xs text-muted-foreground">Mostrando as primeiras {LIMITE_LISTA} unidades.</p>
        )}
      </section>
    </div>
  );
}
