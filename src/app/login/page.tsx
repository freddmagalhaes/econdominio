import { Suspense } from "react";
import { Logo } from "@/app/_componentes/logo";
import { AlternarTema } from "@/app/_componentes/alternar-tema";
import { caminhoSeguro } from "@/lib/redirecionamento";
import { FormularioLogin } from "./formulario";

export const metadata = { title: "Entrar" };

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <main className="relative flex min-h-screen items-center justify-center bg-gradient-to-br from-primary/10 via-background to-teal-500/10 p-6">
      <div className="absolute right-4 top-4">
        <AlternarTema />
      </div>
      <div className="flex w-full max-w-sm flex-col gap-6 rounded-2xl border border-border bg-card p-8 shadow-lg">
        <div className="flex flex-col items-center gap-3 text-center">
          <Logo tamanho={44} />
          <p className="text-sm text-muted-foreground">
            Entre para gerenciar seus condomínios ou acessar o portal do morador.
          </p>
        </div>
        <Suspense fallback={null}>
          <Formulario searchParams={searchParams} />
        </Suspense>
        <p className="text-center text-xs text-muted-foreground">
          O acesso é somente por convite. Se você recebeu um convite, use o link enviado ao seu e-mail.
        </p>
      </div>
    </main>
  );
}

async function Formulario({ searchParams }: { searchParams: PageProps<"/login">["searchParams"] }) {
  const { next } = await searchParams;
  return <FormularioLogin proximo={caminhoSeguro(next)} />;
}
