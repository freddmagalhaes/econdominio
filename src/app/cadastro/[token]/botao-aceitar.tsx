"use client";

import { useActionState } from "react";
import { aceitarConviteGestora, type EstadoCadastro } from "./actions";

export function BotaoAceitarGestora({ token }: { token: string }) {
  const [estado, enviar, pendente] = useActionState<EstadoCadastro, FormData>(aceitarConviteGestora, {});
  return (
    <form action={enviar} className="flex flex-col gap-2">
      <input type="hidden" name="token" value={token} />
      <button disabled={pendente} className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50">
        {pendente ? "Aceitando…" : "Aceitar convite"}
      </button>
      {estado.erro && <p className="text-sm text-danger">{estado.erro}</p>}
    </form>
  );
}
