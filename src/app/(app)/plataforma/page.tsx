import { notFound } from "next/navigation";
import { Suspense } from "react";
import { formatarDataHoraCurta } from "@/lib/datas";
import { createClient } from "@/lib/supabase/server";
import { BotaoRevogar, FormularioConvite } from "./formularios";

export const metadata = { title: "Plataforma" };

export default function PlataformaPage() {
  return (
    <Suspense fallback={<p className="p-6 text-muted-foreground">Carregando…</p>}>
      <Conteudo />
    </Suspense>
  );
}

type Convite = { id: string; email: string; expira_em: string; aceito_em: string | null; revogado_em: string | null };

function situacao(c: Convite): { texto: string; classe: string } {
  if (c.aceito_em) return { texto: `Aceito em ${formatarDataHoraCurta(c.aceito_em)}`, classe: "text-success" };
  if (c.revogado_em) return { texto: "Revogado", classe: "text-muted-foreground" };
  if (new Date(c.expira_em) < new Date()) return { texto: "Expirado", classe: "text-warning" };
  return { texto: `Pendente (expira ${formatarDataHoraCurta(c.expira_em)})`, classe: "text-foreground" };
}

async function Conteudo() {
  const supabase = await createClient();
  const { data: admin } = await supabase.rpc("eh_admin_plataforma");
  if (admin !== true) notFound();

  const { data } = await supabase
    .from("convite_gestora")
    .select("id, email, expira_em, aceito_em, revogado_em")
    .order("criado_em", { ascending: false })
    .limit(50);
  const convites = (data ?? []) as Convite[];

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Plataforma</h1>
        <p className="text-sm text-muted-foreground">
          O cadastro é somente por convite. Convide aqui as administradoras: o link vai para o e-mail delas, cria a conta
          e confirma o e-mail. Moradores são convidados pelas próprias administradoras.
        </p>
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Convidar administradora</h2>
        <FormularioConvite />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Convites enviados</h2>
        {convites.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum convite enviado ainda.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 font-medium">E-mail</th>
                  <th className="px-4 py-2.5 font-medium">Situação</th>
                  <th />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {convites.map((c) => {
                  const s = situacao(c);
                  const aberto = !c.aceito_em && !c.revogado_em && new Date(c.expira_em) >= new Date();
                  return (
                    <tr key={c.id}>
                      <td className="px-4 py-2.5">{c.email}</td>
                      <td className={`px-4 py-2.5 ${s.classe}`}>{s.texto}</td>
                      <td className="px-4 py-2">{aberto && <BotaoRevogar id={c.id} />}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
