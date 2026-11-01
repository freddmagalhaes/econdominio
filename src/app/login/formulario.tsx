"use client";

import { useActionState } from "react";
import { entrar, type EstadoLogin } from "./actions";

const inicial: EstadoLogin = {};

export function FormularioLogin({ proximo }: { proximo: string }) {
  const [estado, acao, entrando] = useActionState(entrar, inicial);

  return (
    <form action={acao} className="flex flex-col gap-3">
      <input type="hidden" name="next" value={proximo} />
      <input
        name="email"
        type="email"
        placeholder="E-mail"
        autoComplete="email"
        required
        className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      <input
        name="senha"
        type="password"
        placeholder="Senha"
        autoComplete="current-password"
        required
        className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />

      {estado.erro && <p className="text-sm text-danger">{estado.erro}</p>}

      <button
        disabled={entrando}
        className="rounded-lg bg-primary px-3 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
      >
        {entrando ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}
