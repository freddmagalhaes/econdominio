"use client";

import { Icone } from "./icones";

export function BotaoImprimir({ rotulo = "Imprimir / salvar PDF" }: { rotulo?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="nao-imprimir inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Icone nome="impressora" tamanho={16} />
      {rotulo}
    </button>
  );
}
