import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Logo } from "@/app/_componentes/logo";
import { NovaConta } from "@/app/_componentes/nova-conta";
import { RE_TOKEN, hashToken } from "@/lib/convite";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { sair } from "../../login/actions";
import { BotaoAceitar } from "./botao-aceitar";
import { criarContaPeloConvite } from "./actions";

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

function Indisponivel() {
  return (
    <>
      <h1 className="text-2xl font-semibold">Convite indisponível</h1>
      <p className="text-muted-foreground">
        Este convite é inválido, expirou ou já foi utilizado. Peça um novo convite ao síndico ou à administradora.
      </p>
    </>
  );
}

type Info = { email: string; condominio: string; unidade: string; bloco: string | null };

async function Conteudo({ params }: { params: Props["params"] }) {
  const { token } = await params;
  if (!RE_TOKEN.test(token)) notFound();
  const hash = hashToken(token);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Sem conta: o convite cria a conta (e confirma o e-mail, pois o link só chegou à caixa do convidado).
  if (!user) {
    const { data } = await createAdminClient().rpc("convite_para_cadastro", { p_token_hash: hash });
    const info = data as Info | null;
    if (!info) return <Indisponivel />;
    return (
      <>
        <h1 className="text-2xl font-semibold">Convite para o portal</h1>
        <p className="text-muted-foreground">
          Você foi convidado para acompanhar o <strong>{info.condominio}</strong> (
          {info.bloco ? `bloco ${info.bloco}, ` : ""}unidade {info.unidade}). Crie sua senha para ativar a conta.
        </p>
        <NovaConta
          token={token}
          email={info.email}
          acao={criarContaPeloConvite}
          rotuloBotao="Criar conta e aceitar convite"
          caminhoConvite="/convite"
        />
      </>
    );
  }

  const { data, error } = await supabase.rpc("ver_convite", { p_token_hash: hash });
  if (error || !data) return <Indisponivel />;
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
            Este convite foi enviado para outro e-mail. Saia e entre com o e-mail que recebeu o convite.
          </p>
          <form action={sair}>
            <button className="text-sm underline">Sair e trocar de conta</button>
          </form>
        </>
      )}
    </>
  );
}
