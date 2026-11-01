import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { VERSAO_TERMO } from "@/lib/consentimento";
import { formatarData, formatarDataHoraCurta, hojeSaoPaulo } from "@/lib/datas";
import { createClient } from "@/lib/supabase/server";
import { AcoesMorador } from "./acoes";

type Props = PageProps<"/condominios/[id]/moradores">;

export default function MoradoresPage({ params }: Props) {
  return (
    <Suspense fallback={<p className="p-6 text-muted-foreground">Carregando…</p>}>
      <Conteudo params={params} />
    </Suspense>
  );
}

type Vinculo = { principal: boolean; pessoa: { id: string; nome: string; email: string | null } | { id: string; nome: string; email: string | null }[] | null };

async function Conteudo({ params }: { params: Props["params"] }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: condominio } = await supabase.from("condominio").select("id, nome").eq("id", id).maybeSingle();
  if (!condominio) notFound();

  const [{ data: unidades }, { data: acessos }, { data: convites }, { data: aceites }] = await Promise.all([
    supabase
      .from("unidade")
      .select("id, identificador, bloco(nome), vinculo_unidade(principal, pessoa(id, nome, email))")
      .eq("condominio_id", id)
      .order("identificador")
      .limit(500),
    supabase.from("acesso_unidade").select("unidade_id").eq("condominio_id", id),
    supabase
      .from("convite")
      .select("unidade_id, expira_em, aceito_em, revogado_em")
      .eq("condominio_id", id)
      .is("aceito_em", null)
      .is("revogado_em", null)
      .gt("expira_em", new Date().toISOString()),
    supabase.from("aceite_termo").select("unidade_id, aceito_em").eq("condominio_id", id).eq("versao_termo", VERSAO_TERMO),
  ]);
  const aceitoEm = new Map((aceites ?? []).map((a) => [a.unidade_id as string, a.aceito_em as string]));

  const comAcesso = new Set((acessos ?? []).map((a) => a.unidade_id));
  const conviteAberto = new Map((convites ?? []).map((c) => [c.unidade_id, c.expira_em as string]));
  const hoje = hojeSaoPaulo();

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 p-6">
      <header className="flex flex-col gap-1">
        <Link href={`/condominios/${id}`} className="text-sm text-muted-foreground underline">
          ← {condominio.nome}
        </Link>
        <h1 className="text-2xl font-semibold">Moradores e acesso ao portal</h1>
        <p className="text-sm text-muted-foreground">
          Cada unidade tem um único acesso. O convite é enviado por e-mail ao responsável principal e vale por 7
          dias. Hoje: {formatarData(hoje)}.
        </p>
      </header>

      {!unidades?.length ? (
        <p className="text-sm text-muted-foreground">Nenhuma unidade cadastrada. Importe a planilha primeiro.</p>
      ) : (
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border text-muted-foreground">
            <tr>
              <th className="py-2">Unidade</th>
              <th>Responsável</th>
              <th>E-mail</th>
              <th>Portal</th>
              <th />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {unidades.map((u) => {
              const bloco = Array.isArray(u.bloco) ? u.bloco[0] : u.bloco;
              const vinculos = (u.vinculo_unidade ?? []) as unknown as Vinculo[];
              const principal = vinculos.find((v) => v.principal) ?? vinculos[0];
              const pessoa = Array.isArray(principal?.pessoa) ? principal.pessoa[0] : principal?.pessoa;
              const temAcesso = comAcesso.has(u.id);
              const expira = conviteAberto.get(u.id);
              return (
                <tr key={u.id} className="align-top">
                  <td className="py-2">
                    {bloco?.nome ? `${bloco.nome} · ` : ""}
                    {u.identificador}
                  </td>
                  <td>
                    {pessoa ? (
                      <Link href={`/condominios/${id}/pessoas/${pessoa.id}`} className="underline-offset-2 hover:underline">
                        {pessoa.nome}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>{pessoa?.email ?? <span className="text-muted-foreground/60">sem e-mail</span>}</td>
                  <td>
                    {temAcesso ? (
                      <span>
                        <span className="text-success">Ativo</span>
                        <span className="block text-xs text-muted-foreground">
                          {aceitoEm.has(u.id)
                            ? `Termo aceito em ${formatarDataHoraCurta(aceitoEm.get(u.id) as string)}`
                            : "Termo ainda não aceito"}
                        </span>
                      </span>
                    ) : expira ? (
                      <span className="text-warning">Convite enviado (expira {formatarData(expira.slice(0, 10))})</span>
                    ) : (
                      <span className="text-muted-foreground">Sem acesso</span>
                    )}
                  </td>
                  <td className="py-1">
                    <AcoesMorador
                      condominioId={id}
                      unidadeId={u.id}
                      pessoaId={pessoa?.email ? pessoa.id : null}
                      temAcesso={temAcesso}
                      conviteAberto={!!expira}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
