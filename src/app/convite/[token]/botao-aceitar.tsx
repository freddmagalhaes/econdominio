"use client";

import { useActionState } from "react";
import { aceitarConvite, type EstadoConvite } from "./actions";

export function BotaoAceitar({ token }: { token: string }) {
  const [estado, enviar, pendente] = useActionState<EstadoConvite, FormData>(aceitarConvite, {});
  return (
    <form action={enviar} className="flex flex-col gap-2">
      <input type="hidden" name="token" value={token} />
      <button disabled={pendente} className="rounded-lg bg-primary hover:opacity-90 px-3 py-2 text-primary-foreground disabled:opacity-50">
        {pendente ? "Aceitando…" : "Aceitar convite"}
      </button>
      {estado.erro && <p className="text-sm text-danger">{estado.erro}</p>}
    </form>
  );
}
