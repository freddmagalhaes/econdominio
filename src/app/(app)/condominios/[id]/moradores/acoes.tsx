"use client";

import { useActionState } from "react";
import { enviarConvite, revogarAcesso, type EstadoMorador } from "./actions";

const botao = "rounded-lg border border-border bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring px-2 py-1 text-xs disabled:opacity-50";

export function AcoesMorador({
  condominioId,
  unidadeId,
  pessoaId,
  temAcesso,
  conviteAberto,
}: {
  condominioId: string;
  unidadeId: string;
  pessoaId: string | null;
  temAcesso: boolean;
  conviteAberto: boolean;
}) {
  const [convite, enviar, enviando] = useActionState<EstadoMorador, FormData>(enviarConvite, {});
  const [revogacao, revogar, revogando] = useActionState<EstadoMorador, FormData>(revogarAcesso, {});
  const estado = convite.erro || convite.aviso || convite.link ? convite : revogacao;

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-2">
        {!temAcesso && pessoaId && (
          <form action={enviar}>
            <input type="hidden" name="condominioId" value={condominioId} />
            <input type="hidden" name="unidadeId" value={unidadeId} />
            <input type="hidden" name="pessoaId" value={pessoaId} />
            <button disabled={enviando} className={botao}>
              {conviteAberto ? "Reenviar convite" : "Enviar convite"}
            </button>
          </form>
        )}
        {(temAcesso || conviteAberto) && (
          <form
            action={revogar}
            onSubmit={(e) => {
              if (!confirm("Revogar o acesso e os convites desta unidade?")) e.preventDefault();
            }}
          >
            <input type="hidden" name="condominioId" value={condominioId} />
            <input type="hidden" name="unidadeId" value={unidadeId} />
            <button disabled={revogando} className={botao}>
              Revogar
            </button>
          </form>
        )}
      </div>
      {estado.erro && <p className="max-w-xs text-right text-xs text-danger">{estado.erro}</p>}
      {estado.aviso && <p className="text-xs text-success">{estado.aviso}</p>}
      {estado.link && (
        <input
          readOnly
          value={estado.link}
          onFocus={(e) => e.currentTarget.select()}
          className="w-64 rounded-lg border border-border bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring px-2 py-1 text-xs"
          aria-label="Link do convite"
        />
      )}
    </div>
  );
}
