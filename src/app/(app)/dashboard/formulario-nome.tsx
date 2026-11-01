"use client";

import { useActionState } from "react";
import type { EstadoForm } from "./actions";

type Props = {
  acao: (estado: EstadoForm, formData: FormData) => Promise<EstadoForm>;
  placeholder: string;
  botao: string;
  organizacaoId?: string;
};

export function FormularioNome({ acao, placeholder, botao, organizacaoId }: Props) {
  const [estado, enviar, pendente] = useActionState(acao, {});

  return (
    <form action={enviar} className="flex flex-col gap-2 sm:flex-row">
      {organizacaoId && <input type="hidden" name="organizacaoId" value={organizacaoId} />}
      <input
        name="nome"
        placeholder={placeholder}
        required
        className="flex-1 rounded-lg border border-border bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring px-3 py-2"
      />
      <button
        disabled={pendente}
        className="rounded-lg bg-primary hover:opacity-90 px-3 py-2 text-primary-foreground disabled:opacity-50"
      >
        {botao}
      </button>
      {estado.erro && <p className="text-sm text-danger">{estado.erro}</p>}
    </form>
  );
}
