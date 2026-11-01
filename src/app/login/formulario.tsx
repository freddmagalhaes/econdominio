"use client";

import { useActionState } from "react";
import { cadastrar, entrar, type EstadoLogin } from "./actions";

const inicial: EstadoLogin = {};

export function FormularioLogin({ proximo }: { proximo: string }) {
  const [estadoEntrar, acaoEntrar, entrando] = useActionState(entrar, inicial);
  const [estadoCadastrar, acaoCadastrar, cadastrando] = useActionState(cadastrar, inicial);
  const estado = estadoCadastrar.erro || estadoCadastrar.aviso ? estadoCadastrar : estadoEntrar;

  return (
    <form className="flex flex-col gap-3">
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
        placeholder="Senha (mín. 8 caracteres)"
        autoComplete="current-password"
        required
        className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />

      {estado.erro && <p className="text-sm text-danger">{estado.erro}</p>}
      {estado.aviso && <p className="text-sm text-success">{estado.aviso}</p>}

      <button
        formAction={acaoEntrar}
        disabled={entrando || cadastrando}
        className="rounded-lg bg-primary px-3 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
      >
        Entrar
      </button>
      <button
        formAction={acaoCadastrar}
        disabled={entrando || cadastrando}
        className="rounded-lg border border-border bg-card px-3 py-2.5 text-sm font-medium hover:bg-muted disabled:opacity-50"
      >
        Criar conta
      </button>
    </form>
  );
}
