import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Logo } from "@/app/_componentes/logo";
import { RE_TOKEN, hashToken } from "@/lib/convite";
import { createClient } from "@/lib/supabase/server";
import { sair } from "../../login/actions";
import { BotaoAceitar } from "./botao-aceitar";

export const metadata = { title: "Convite" };

type Props = PageProps<"/convite/[token]">;

export default function ConvitePage({ params }: Props) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-primary/10 via-background to-teal-500/10 p-6">
      <div className="flex w-full max-w-md flex-col gap-4 rounded-2xl border border-border bg-card p-8 shadow-lg">
        <Logo tamanho={40} className="mb-2" />
        <Suspense fallback={<p className="text-muted-foreground">Carregando…</p>}>
          <Conteudo params={params} />
        </Suspense>
      </div>
    </main>
  );
}

async function Conteudo({ params }: { params: Props["params"] }) {
  const { token } = await params;
  if (!RE_TOKEN.test(token)) notFound();

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("ver_convite", { p_token_hash: hashToken(token) });

  if (error || !data) {
    return (
      <>
        <h1 className="text-2xl font-semibold">Convite indisponível</h1>
        <p className="text-muted-foreground">
          Este convite é inválido, expirou ou já foi utilizado. Peça um novo convite ao síndico ou à
          administradora.
        </p>
      </>
    );
  }

  const convite = data as { condominio: string; unidade: string; bloco: string | null; email_confere: boolean };

  return (
    <>
      <h1 className="text-2xl font-semibold">Convite para o portal</h1>
      <p className="text-muted-foreground">
        Você foi convidado para acompanhar o <strong>{convite.condominio}</strong> (
        {convite.bloco ? `bloco ${convite.bloco}, ` : ""}unidade {convite.unidade}).
      </p>
      {convite.email_confere ? (
        <BotaoAceitar token={token} />
      ) : (
        <>
          <p className="rounded-lg border border-warning/30 bg-warning-soft p-3 text-sm text-warning">
            Este convite foi enviado para outro e-mail. Saia e entre (ou crie a conta) com o e-mail que
            recebeu o convite.
          </p>
          <form action={sair}>
            <button className="text-sm underline">Sair e trocar de conta</button>
          </form>
        </>
      )}
    </>
  );
}
