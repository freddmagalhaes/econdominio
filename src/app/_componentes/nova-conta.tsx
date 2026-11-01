"use client";

import Link from "next/link";
import { useActionState } from "react";

export type EstadoNovaConta = { erro?: string; jaTemConta?: boolean };

const campo =
  "w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** Formulário de criação de conta a partir de um convite: o e-mail vem do convite e não pode ser alterado. */
export function NovaConta({
  token,
  email,
  acao,
  rotuloBotao,
  caminhoConvite,
}: {
  token: string;
  email: string;
  acao: (estado: EstadoNovaConta, formData: FormData) => Promise<EstadoNovaConta>;
  rotuloBotao: string;
  caminhoConvite: string;
}) {
  const [estado, enviar, pendente] = useActionState<EstadoNovaConta, FormData>(acao, {});
  return (
    <form action={enviar} className="flex flex-col gap-3">
      <input type="hidden" name="token" value={token} />
      <label className="flex flex-col gap-1 text-sm font-medium">
        E-mail do convite
        <input value={email} readOnly aria-readonly="true" className={`${campo} bg-muted text-muted-foreground`} />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Crie uma senha
        <input name="senha" type="password" autoComplete="new-password" minLength={8} required className={campo} />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Repita a senha
        <input name="confirmar" type="password" autoComplete="new-password" minLength={8} required className={campo} />
      </label>
      <button
        disabled={pendente}
        className="rounded-lg bg-primary px-3 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
      >
        {pendente ? "Criando…" : rotuloBotao}
      </button>
      {estado.erro && <p className="text-sm text-danger">{estado.erro}</p>}
      <p className="text-center text-xs text-muted-foreground">
        Já tem conta?{" "}
        <Link href={`/login?next=${encodeURIComponent(`${caminhoConvite}/${token}`)}`} className="underline">
          Entrar
        </Link>
      </p>
    </form>
  );
}
