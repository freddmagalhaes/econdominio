import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Icone } from "@/app/_componentes/icones";
import { formatarTelefone } from "@/lib/consentimento";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Pessoas" };

type Props = PageProps<"/condominios/[id]/pessoas">;

export default function PessoasPage({ params }: Props) {
  return (
    <Suspense fallback={<p className="p-6 text-muted-foreground">Carregando…</p>}>
      <Conteudo params={params} />
    </Suspense>
  );
}

type Bloco = { nome: string } | { nome: string }[] | null;
type Unidade = { identificador: string; bloco: Bloco } | { identificador: string; bloco: Bloco }[] | null;

const um = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

function Selo({ ativo, rotulo }: { ativo: boolean; rotulo: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
        ativo ? "bg-success-soft text-success" : "bg-muted text-muted-foreground"
      }`}
    >
      {rotulo}
    </span>
  );
}

async function Conteudo({ params }: { params: Props["params"] }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: condominio } = await supabase.from("condominio").select("id, nome").eq("id", id).maybeSingle();
  if (!condominio) notFound();

  const { data: pessoas } = await supabase
    .from("pessoa")
    .select("id, nome, email, telefone, aceita_email, aceita_whatsapp, vinculo_unidade(tipo, unidade(identificador, bloco(nome)))")
    .eq("condominio_id", id)
    .order("nome")
    .limit(500);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <header className="flex flex-col gap-1">
        <Link href={`/condominios/${id}`} className="text-sm text-muted-foreground underline">
          ← {condominio.nome}
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Pessoas</h1>
        <p className="text-sm text-muted-foreground">
          Proprietários e moradores. Edite os dados e a autorização para receber comunicados por e-mail e WhatsApp.
        </p>
      </header>

      {!pessoas?.length ? (
        <p className="text-sm text-muted-foreground">Nenhuma pessoa cadastrada. Importe a planilha de unidades.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Nome</th>
                <th className="px-4 py-3 font-medium">Unidades</th>
                <th className="px-4 py-3 font-medium">E-mail</th>
                <th className="px-4 py-3 font-medium">Telefone</th>
                <th className="px-4 py-3 font-medium">Comunicados</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {pessoas.map((p) => {
                const unidades = ((p.vinculo_unidade ?? []) as unknown as { tipo: string; unidade: Unidade }[]).map((v) => {
                  const u = um(v.unidade);
                  const b = um(u?.bloco ?? null);
                  return `${b?.nome ? `${b.nome}-` : ""}${u?.identificador ?? "?"}${v.tipo === "inquilino" ? " (inquilino)" : ""}`;
                });
                return (
                  <tr key={p.id} className="hover:bg-muted/50">
                    <td className="px-4 py-3 font-medium">{p.nome}</td>
                    <td className="px-4 py-3 text-muted-foreground">{unidades.join(", ") || "—"}</td>
                    <td className="px-4 py-3">{p.email ?? <span className="text-muted-foreground/60">—</span>}</td>
                    <td className="px-4 py-3">
                      {p.telefone ? formatarTelefone(p.telefone) : <span className="text-muted-foreground/60">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className="flex flex-wrap gap-1.5">
                        <Selo ativo={p.aceita_email && !!p.email} rotulo="E-mail" />
                        <Selo ativo={p.aceita_whatsapp && !!p.telefone} rotulo="WhatsApp" />
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/condominios/${id}/pessoas/${p.id}`}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-muted"
                      >
                        <Icone nome="lapis" tamanho={14} />
                        Editar
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {(pessoas?.length ?? 0) >= 500 && <p className="text-xs text-muted-foreground">Mostrando as primeiras 500 pessoas.</p>}
    </div>
  );
}
