"use client";

import { useActionState } from "react";
import { convidarGestora, revogarConviteGestora, type EstadoPlataforma } from "./actions";

export function FormularioConvite() {
  const [estado, enviar, pendente] = useActionState<EstadoPlataforma, FormData>(convidarGestora, {});
  return (
    <form action={enviar} className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5 shadow-sm">
      <label className="flex flex-col gap-1 text-sm font-medium">
        E-mail da administradora
        <input
          name="email"
          type="email"
          required
          placeholder="contato@administradora.com.br"
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </label>
      <div className="flex items-center gap-3">
        <button
          disabled={pendente}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {pendente ? "Enviando…" : "Enviar convite"}
        </button>
        {estado.aviso && <p className="text-sm text-success">{estado.aviso}</p>}
      </div>
      {estado.erro && <p className="text-sm text-danger">{estado.erro}</p>}
      {estado.link && (
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Link do convite (repasse manualmente enquanto o e-mail não estiver configurado)
          <input
            readOnly
            value={estado.link}
            onFocus={(e) => e.currentTarget.select()}
            className="rounded-lg border border-border bg-background px-2 py-1.5 text-xs text-foreground"
          />
        </label>
      )}
    </form>
  );
}

export function BotaoRevogar({ id }: { id: string }) {
  const [estado, enviar, pendente] = useActionState<EstadoPlataforma, FormData>(revogarConviteGestora, {});
  return (
    <form
      action={enviar}
      onSubmit={(e) => {
        if (!confirm("Revogar este convite?")) e.preventDefault();
      }}
      className="flex items-center justify-end gap-2"
    >
      <input type="hidden" name="id" value={id} />
      <button disabled={pendente} className="rounded-lg border border-border px-2.5 py-1 text-xs hover:bg-muted disabled:opacity-50">
        Revogar
      </button>
      {estado.erro && <span className="text-xs text-danger">{estado.erro}</span>}
    </form>
  );
}
