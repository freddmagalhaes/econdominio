import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Icone } from "@/app/_componentes/icones";
import { createClient } from "@/lib/supabase/server";
import { criarCondominio, criarOrganizacao } from "./actions";
import { FormularioNome } from "./formulario-nome";

export const metadata = { title: "Início" };

export default function DashboardPage() {
  return (
    <Suspense fallback={<p className="p-6 text-muted-foreground">Carregando…</p>}>
      <Conteudo />
    </Suspense>
  );
}

async function Conteudo() {
  const supabase = await createClient();

  const [{ data: organizacoes }, { data: condominios }, { data: unidades }, { data: podeCriar }] = await Promise.all([
    supabase.from("organizacao").select("id, nome").order("nome"),
    supabase.from("condominio").select("id, nome, organizacao_id").order("nome"),
    supabase.rpc("portal_minhas_unidades"),
    supabase.rpc("pode_criar_organizacao"),
  ]);

  // Morador (sem organização): vai direto para o portal.
  const temPortal = Array.isArray(unidades) && unidades.length > 0;
  if (!organizacoes?.length && temPortal) redirect("/portal");

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Início</h1>
        <p className="text-sm text-muted-foreground">Seus condomínios e atalhos.</p>
      </header>

      {!organizacoes?.length && podeCriar !== true ? (
        <section className="flex max-w-xl flex-col gap-2 rounded-xl border border-border bg-card p-6 shadow-sm">
          <h2 className="text-lg font-medium">Sua conta ainda não está vinculada a uma administradora</h2>
          <p className="text-sm text-muted-foreground">
            O acesso ao ECONDOMINIO é por convite. Se você é morador, abra o link do convite enviado ao seu e-mail. Se é
            administradora, peça um convite à plataforma.
          </p>
        </section>
      ) : !organizacoes?.length ? (
        <section className="flex max-w-xl flex-col gap-3 rounded-xl border border-border bg-card p-6 shadow-sm">
          <h2 className="text-lg font-medium">Crie sua organização</h2>
          <p className="text-sm text-muted-foreground">
            A organização representa a administradora (ou o condomínio autogerido).
          </p>
          <FormularioNome acao={criarOrganizacao} placeholder="Nome da administradora" botao="Criar organização" />
        </section>
      ) : (
        <>
          <section className="grid gap-3 sm:grid-cols-2">
            <Link
              href="/relatorios"
              className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 shadow-sm transition-colors hover:bg-muted"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Icone nome="grafico" />
              </span>
              <span>
                <span className="block font-medium">Relatório consolidado</span>
                <span className="block text-sm text-muted-foreground">Previsto, recebido e inadimplência de todos os condomínios</span>
              </span>
            </Link>
            {temPortal && (
              <Link
                href="/portal"
                className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 shadow-sm transition-colors hover:bg-muted"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icone nome="usuario" />
                </span>
                <span>
                  <span className="block font-medium">Meu portal</span>
                  <span className="block text-sm text-muted-foreground">Cotas, balancete e comunicados da sua unidade</span>
                </span>
              </Link>
            )}
          </section>

          {organizacoes.map((org) => {
            const doOrg = (condominios ?? []).filter((c) => c.organizacao_id === org.id);
            return (
              <section key={org.id} className="flex flex-col gap-3">
                <h2 className="text-lg font-medium">{org.nome}</h2>
                {doOrg.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhum condomínio cadastrado ainda.</p>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {doOrg.map((c) => (
                      <Link
                        key={c.id}
                        href={`/condominios/${c.id}`}
                        className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 shadow-sm transition-colors hover:bg-muted"
                      >
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                          <Icone nome="predio" />
                        </span>
                        <span className="truncate font-medium">{c.nome}</span>
                      </Link>
                    ))}
                  </div>
                )}
                <div className="rounded-xl border border-dashed border-border p-4">
                  <FormularioNome
                    acao={criarCondominio}
                    organizacaoId={org.id}
                    placeholder="Nome do novo condomínio"
                    botao="Adicionar condomínio"
                  />
                </div>
              </section>
            );
          })}
        </>
      )}
    </div>
  );
}
