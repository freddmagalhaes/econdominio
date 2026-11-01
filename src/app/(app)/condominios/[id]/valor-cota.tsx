"use client";

import { useActionState } from "react";
import { definirValorTodas, definirValorUnidade, type EstadoValorCota } from "./actions";

const campo =
  "rounded-lg border border-border bg-background px-2 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function ValorCotaUnidade({
  condominioId,
  unidadeId,
  valorTexto,
}: {
  condominioId: string;
  unidadeId: string;
  valorTexto: string;
}) {
  const [estado, enviar, pendente] = useActionState<EstadoValorCota, FormData>(definirValorUnidade, {});
  return (
    <form action={enviar} className="flex items-center justify-end gap-2">
      <input type="hidden" name="condominioId" value={condominioId} />
      <input type="hidden" name="unidadeId" value={unidadeId} />
      <input
        name="valor"
        defaultValue={valorTexto}
        inputMode="decimal"
        placeholder="—"
        aria-label="Valor da cota mensal"
        className={`${campo} w-24 text-right`}
      />
      <button
        disabled={pendente}
        className="rounded-lg border border-border px-2 py-1 text-xs hover:bg-muted disabled:opacity-50"
      >
        Salvar
      </button>
      <span className="w-12 text-xs">
        {estado.erro && <span className="text-danger">{estado.erro}</span>}
        {estado.aviso && <span className="text-success">{estado.aviso}</span>}
      </span>
    </form>
  );
}

export function ValorParaTodas({ condominioId }: { condominioId: string }) {
  const [estado, enviar, pendente] = useActionState<EstadoValorCota, FormData>(definirValorTodas, {});
  return (
    <form
      action={enviar}
      onSubmit={(e) => {
        if (!confirm("Substituir o valor da cota de TODAS as unidades por este valor?")) e.preventDefault();
      }}
      className="flex flex-wrap items-end gap-3 rounded-xl border border-dashed border-border p-3"
    >
      <input type="hidden" name="condominioId" value={condominioId} />
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        Atalho: mesmo valor para todas (R$)
        <input name="valor" inputMode="decimal" placeholder="450,00" required className={`${campo} w-32`} />
      </label>
      <button
        disabled={pendente}
        className="rounded-lg border border-border bg-card px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
      >
        Aplicar a todas
      </button>
      {estado.erro && <p className="text-sm text-danger">{estado.erro}</p>}
      {estado.aviso && <p className="text-sm text-success">{estado.aviso}</p>}
    </form>
  );
}
