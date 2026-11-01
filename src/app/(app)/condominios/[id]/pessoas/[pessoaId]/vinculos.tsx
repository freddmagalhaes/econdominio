"use client";

import { useActionState } from "react";
import { ROTULO_VINCULO, type TipoVinculo } from "@/lib/consentimento";
import { salvarVinculo, type EstadoPessoa } from "./actions";

export type VinculoEditavel = {
  id: string;
  bloco: string | null;
  unidade: string;
  tipo: TipoVinculo;
  principal: boolean;
};

function Linha({
  condominioId,
  pessoaId,
  vinculo,
}: {
  condominioId: string;
  pessoaId: string;
  vinculo: VinculoEditavel;
}) {
  const [estado, enviar, pendente] = useActionState<EstadoPessoa, FormData>(salvarVinculo, {});
  return (
    <form action={enviar} className="flex flex-wrap items-center gap-3 px-4 py-3">
      <input type="hidden" name="condominioId" value={condominioId} />
      <input type="hidden" name="pessoaId" value={pessoaId} />
      <input type="hidden" name="vinculoId" value={vinculo.id} />
      <span className="min-w-32 text-sm font-medium">
        {vinculo.bloco ? `Bloco ${vinculo.bloco} · ` : ""}Unidade {vinculo.unidade}
        {vinculo.principal && <span className="ml-2 text-xs font-normal text-muted-foreground">(responsável)</span>}
      </span>
      <select
        name="tipo"
        defaultValue={vinculo.tipo}
        aria-label={`Vínculo na unidade ${vinculo.unidade}`}
        className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {(Object.keys(ROTULO_VINCULO) as TipoVinculo[]).map((t) => (
          <option key={t} value={t}>
            {ROTULO_VINCULO[t]}
          </option>
        ))}
      </select>
      <button
        disabled={pendente}
        className="rounded-lg border border-border bg-card px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
      >
        Salvar vínculo
      </button>
      {estado.erro && <span className="text-xs text-danger">{estado.erro}</span>}
      {estado.aviso && <span className="text-xs text-success">{estado.aviso}</span>}
    </form>
  );
}

export function VinculosPessoa({
  condominioId,
  pessoaId,
  vinculos,
}: {
  condominioId: string;
  pessoaId: string;
  vinculos: VinculoEditavel[];
}) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-base font-semibold">Vínculo com as unidades</h2>
      <p className="text-sm text-muted-foreground">
        Informe se a pessoa é proprietária ou inquilina de cada unidade. Isso consta no termo de autorização.
      </p>
      {vinculos.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma unidade vinculada.</p>
      ) : (
        <div className="divide-y divide-border rounded-xl border border-border bg-card shadow-sm">
          {vinculos.map((v) => (
            <Linha key={v.id} condominioId={condominioId} pessoaId={pessoaId} vinculo={v} />
          ))}
        </div>
      )}
    </section>
  );
}
