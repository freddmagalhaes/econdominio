import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { estadoEvolution, type EstadoWhatsapp } from "@/lib/comunicacao/evolution";
import { formatarDataHora } from "@/lib/comunicacao/modelos";
import { formatarData } from "@/lib/datas";
import { createClient } from "@/lib/supabase/server";
import { BotaoReenviar, FormularioComunicado } from "./formularios";

export const metadata = { title: "Comunicados" };

// Publicar envia o WhatsApp com pausa entre as mensagens (as que não couberem seguem pendentes).
export const maxDuration = 60;

type Props = PageProps<"/condominios/[id]/comunicados">;

export default function ComunicadosPage({ params }: Props) {
  return (
    <Suspense fallback={<p className="p-6 text-muted-foreground">Carregando…</p>}>
      <Conteudo params={params} />
    </Suspense>
  );
}

type Contagem = { enviado: number; pendente: number; falhou: number };
const vazio = (): Contagem => ({ enviado: 0, pendente: 0, falhou: 0 });

const ROTULO_ESTADO: Record<EstadoWhatsapp, { texto: string; classe: string }> = {
  conectado: { texto: "WhatsApp conectado", classe: "bg-success-soft text-success" },
  desconectado: { texto: "WhatsApp desconectado: reconecte o número na Evolution API", classe: "bg-danger-soft text-danger" },
  indisponivel: { texto: "WhatsApp: Evolution API indisponível", classe: "bg-warning-soft text-warning" },
  nao_configurado: { texto: "WhatsApp não configurado (só e-mail e portal)", classe: "bg-muted text-muted-foreground" },
};

function SeloWhatsapp({ estado }: { estado: EstadoWhatsapp }) {
  const { texto, classe } = ROTULO_ESTADO[estado];
  return (
    <span className={`mt-1 inline-flex w-fit items-center rounded-full px-2.5 py-1 text-xs font-medium ${classe}`}>
      {texto}
    </span>
  );
}

async function Conteudo({ params }: { params: Props["params"] }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: condominio } = await supabase.from("condominio").select("id, nome").eq("id", id).maybeSingle();
  if (!condominio) notFound();

  const { data: comunicados } = await supabase
    .from("comunicado")
    .select("id, tipo, titulo, data_reuniao, local, criado_em")
    .eq("condominio_id", id)
    .order("criado_em", { ascending: false })
    .limit(30);

  const ids = (comunicados ?? []).map((c) => c.id);
  const { data: envios } = ids.length
    ? await supabase.from("envio_comunicacao").select("comunicado_id, canal, status").in("comunicado_id", ids)
    : { data: [] as { comunicado_id: string; canal: string; status: string }[] };

  const contagem = new Map<string, { email: Contagem; whatsapp: Contagem }>();
  for (const e of envios ?? []) {
    const c = contagem.get(e.comunicado_id) ?? { email: vazio(), whatsapp: vazio() };
    c[e.canal as "email" | "whatsapp"][e.status as keyof Contagem]++;
    contagem.set(e.comunicado_id, c);
  }
  const estadoWhatsapp = await estadoEvolution();

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8">
      <header className="flex flex-col gap-1">
        <Link href={`/condominios/${id}`} className="text-sm text-muted-foreground underline">
          ← {condominio.nome}
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Comunicados e reuniões</h1>
        <SeloWhatsapp estado={estadoWhatsapp} />
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Novo comunicado</h2>
        <FormularioComunicado condominioId={id} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Histórico</h2>
        {!comunicados?.length ? (
          <p className="text-sm text-muted-foreground">Nenhum comunicado publicado.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {comunicados.map((c) => {
              const n = contagem.get(c.id) ?? { email: vazio(), whatsapp: vazio() };
              const totalEmail = n.email.enviado + n.email.pendente + n.email.falhou;
              const totalWa = n.whatsapp.enviado + n.whatsapp.pendente + n.whatsapp.falhou;
              const pendencia = n.email.pendente + n.email.falhou + n.whatsapp.pendente + n.whatsapp.falhou > 0;
              return (
                <li
                  key={c.id}
                  className="flex items-start justify-between gap-4 rounded-xl border border-border bg-card p-3 shadow-sm"
                >
                  <div>
                    <p className="text-xs text-muted-foreground">
                      {c.tipo === "reuniao" ? "Reunião" : "Aviso"} · {formatarData(c.criado_em.slice(0, 10))}
                    </p>
                    <p className="font-medium">{c.titulo}</p>
                    {c.tipo === "reuniao" && c.data_reuniao && (
                      <p className="text-sm text-muted-foreground">
                        {formatarDataHora(c.data_reuniao)}
                        {c.local ? ` · ${c.local}` : ""}
                      </p>
                    )}
                    <p className="mt-1 text-xs text-muted-foreground">
                      E-mail: {n.email.enviado}/{totalEmail} enviados
                      {n.email.pendente > 0 && ` · ${n.email.pendente} pendentes`}
                      {n.email.falhou > 0 && <span className="text-danger"> · {n.email.falhou} com falha</span>}
                      {totalWa > 0 && (
                        <>
                          {" · "}WhatsApp: {n.whatsapp.enviado}/{totalWa} enviados
                          {n.whatsapp.pendente > 0 && ` · ${n.whatsapp.pendente} pendentes`}
                          {n.whatsapp.falhou > 0 && (
                            <span className="text-danger"> · {n.whatsapp.falhou} com falha</span>
                          )}
                        </>
                      )}
                    </p>
                  </div>
                  {pendencia && <BotaoReenviar condominioId={id} comunicadoId={c.id} />}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
