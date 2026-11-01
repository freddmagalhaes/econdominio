import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Logo } from "@/app/_componentes/logo";
import { NovaConta } from "@/app/_componentes/nova-conta";
import { RE_TOKEN, hashToken } from "@/lib/convite";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { sair } from "../../login/actions";
import { criarContaGestora } from "./actions";
import { BotaoAceitarGestora } from "./botao-aceitar";

export const metadata = { title: "Criar conta" };

type Props = PageProps<"/cadastro/[token]">;

export default function CadastroPage({ params }: Props) {
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

  const { data } = await createAdminClient().rpc("convite_gestora_para_cadastro", { p_token_hash: hashToken(token) });
  const email = (data as { email?: string } | null)?.email;
  if (!email) {
    return (
      <>
        <h1 className="text-2xl font-semibold">Convite indisponível</h1>
        <p className="text-muted-foreground">Este convite é inválido, expirou ou já foi utilizado. Peça um novo convite.</p>
      </>
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <>
        <h1 className="text-2xl font-semibold">Bem-vindo ao ECONDOMINIO</h1>
        <p className="text-muted-foreground">
          Você foi convidado para gerenciar condomínios. Crie sua senha para ativar a conta.
        </p>
        <NovaConta
          token={token}
          email={email}
          acao={criarContaGestora}
          rotuloBotao="Criar conta"
          caminhoConvite="/cadastro"
        />
      </>
    );
  }

  const confere = user.email?.toLowerCase() === email.toLowerCase();
  return (
    <>
      <h1 className="text-2xl font-semibold">Convite para administradora</h1>
      {confere ? (
        <>
          <p className="text-muted-foreground">Aceite para liberar a criação de organizações na sua conta.</p>
          <BotaoAceitarGestora token={token} />
        </>
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
