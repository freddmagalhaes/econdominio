import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { formatarTelefone, type TipoVinculo } from "@/lib/consentimento";
import { formatarData } from "@/lib/datas";
import { createClient } from "@/lib/supabase/server";
import { FormularioPessoa } from "./formulario";
import { VinculosPessoa, type VinculoEditavel } from "./vinculos";

export const metadata = { title: "Editar pessoa" };

type Props = PageProps<"/condominios/[id]/pessoas/[pessoaId]">;

export default function EditarPessoaPage({ params }: Props) {
  return (
    <Suspense fallback={<p className="p-6 text-muted-foreground">Carregando…</p>}>
      <Conteudo params={params} />
    </Suspense>
  );
}

type Bloco = { nome: string } | { nome: string }[] | null;
type Unidade = { identificador: string; bloco: Bloco } | { identificador: string; bloco: Bloco }[] | null;
type Vinculo = { id: string; tipo: TipoVinculo; principal: boolean; unidade: Unidade };

const um = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

async function Conteudo({ params }: { params: Props["params"] }) {
  const { id, pessoaId } = await params;
  const supabase = await createClient();

  const { data: pessoa } = await supabase
    .from("pessoa")
    .select("id, nome, documento, email, telefone, aceita_email, aceita_whatsapp")
    .eq("id", pessoaId)
    .eq("condominio_id", id)
    .maybeSingle();
  if (!pessoa) notFound();

  const [{ data: vinculos }, { data: historico }, { data: condominio }] = await Promise.all([
    supabase
      .from("vinculo_unidade")
      .select("id, tipo, principal, unidade(identificador, bloco(nome))")
      .eq("pessoa_id", pessoaId),
    supabase
      .from("consentimento_comunicacao")
      .select("canal, aceito, versao_termo, destino, registrado_em")
      .eq("pessoa_id", pessoaId)
      .order("registrado_em", { ascending: false })
      .limit(10),
    supabase.from("condominio").select("nome").eq("id", id).maybeSingle(),
  ]);

  const editaveis: VinculoEditavel[] = ((vinculos ?? []) as unknown as Vinculo[])
    .map((v) => {
      const u = um(v.unidade);
      const b = um(u?.bloco ?? null);
      return { id: v.id, bloco: b?.nome ?? null, unidade: u?.identificador ?? "?", tipo: v.tipo, principal: v.principal };
    })
    .sort((a, b) => (a.bloco ?? "").localeCompare(b.bloco ?? "") || a.unidade.localeCompare(b.unidade, "pt-BR", { numeric: true }));
  const unidades = editaveis.map(
    (v) => `${v.bloco ? `${v.bloco} · ` : ""}${v.unidade}${v.principal ? " (principal)" : ""}`,
  );

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <header className="flex flex-col gap-1">
        <Link href={`/condominios/${id}/pessoas`} className="text-sm text-muted-foreground underline">
          ← Pessoas
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">{pessoa.nome}</h1>
        {unidades.length > 0 && <p className="text-sm text-muted-foreground">Unidades: {unidades.join(", ")}</p>}
      </header>

      <VinculosPessoa condominioId={id} pessoaId={pessoa.id} vinculos={editaveis} />

      <FormularioPessoa
        condominioId={id}
        condominioNome={condominio?.nome ?? ""}
        pessoaId={pessoa.id}
        inicial={{
          nome: pessoa.nome,
          documento: pessoa.documento ?? "",
          email: pessoa.email ?? "",
          telefone: formatarTelefone(pessoa.telefone),
          aceitaEmail: pessoa.aceita_email,
          aceitaWhatsapp: pessoa.aceita_whatsapp,
        }}
        vinculos={editaveis.map(({ bloco, unidade, tipo }) => ({ bloco, unidade, tipo }))}
      />

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold">Histórico de autorizações</h2>
        {!historico?.length ? (
          <p className="text-sm text-muted-foreground">Nenhuma autorização registrada ainda.</p>
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border bg-card text-sm shadow-sm">
            {historico.map((h, i) => (
              <li key={i} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                <span>
                  <strong>{h.canal === "whatsapp" ? "WhatsApp" : "E-mail"}</strong>{" "}
                  <span className={h.aceito ? "text-success" : "text-danger"}>
                    {h.aceito ? "autorizado" : "revogado"}
                  </span>
                  {h.destino && (
                    <span className="text-muted-foreground">
                      {" "}
                      · {h.canal === "whatsapp" ? formatarTelefone(h.destino) : h.destino}
                    </span>
                  )}
                </span>
                <span className="text-xs text-muted-foreground">
                  {formatarData(String(h.registrado_em).slice(0, 10))} · termo {h.versao_termo}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
