"use client";

import { useActionState } from "react";
import { importarUnidades, type EstadoImportacao } from "./actions";

export function FormularioImportacao({ condominioId }: { condominioId: string }) {
  const [estado, enviar, pendente] = useActionState<EstadoImportacao, FormData>(importarUnidades, {});

  return (
    <form action={enviar} className="flex flex-col gap-3">
      <input type="hidden" name="condominioId" value={condominioId} />
      <input
        type="file"
        name="arquivo"
        accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        required
        className="text-sm"
      />
      <div className="flex items-center gap-3">
        <button
          disabled={pendente}
          className="rounded-lg bg-primary hover:opacity-90 px-3 py-2 text-primary-foreground disabled:opacity-50"
        >
          {pendente ? "Importando…" : "Importar"}
        </button>
        <span className="text-sm text-muted-foreground">Modelos:</span>
        <a href="/modelo-importacao-em-branco.xlsx" download className="text-sm text-muted-foreground underline">
          Excel em branco
        </a>
        <a href="/modelo-importacao.xlsx" download className="text-sm text-muted-foreground underline">
          Excel de exemplo
        </a>
        <a href="/modelo-importacao-em-branco.csv" download className="text-sm text-muted-foreground underline">
          CSV em branco
        </a>
      </div>

      {estado.erro && <p className="text-sm text-danger">{estado.erro}</p>}

      {estado.erros && (
        <div className="rounded-lg border border-danger/30 bg-danger-soft p-3 text-sm text-danger">
          <p className="font-medium">Nada foi importado. Corrija estas linhas:</p>
          <ul className="mt-1 list-disc pl-5">
            {estado.erros.map((e) => (
              <li key={`${e.linha}-${e.mensagem}`}>
                Linha {e.linha}: {e.mensagem}
              </li>
            ))}
          </ul>
        </div>
      )}

      {estado.resumo && (
        <p className="rounded-lg border border-success/30 bg-success-soft p-3 text-sm text-success">
          {estado.resumo.linhas} linhas processadas: {estado.resumo.unidades_novas} unidades,{" "}
          {estado.resumo.blocos_novos} blocos e {estado.resumo.pessoas_novas} pessoas novos.
        </p>
      )}
    </form>
  );
}
