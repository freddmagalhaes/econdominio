"use client";

import { useActionState, useState } from "react";
import {
  publicarComunicado,
  reenviarComunicado,
  type EstadoComunicado,
} from "./actions";

const campo = "rounded-lg border border-border bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring px-2 py-1.5 text-sm";
const rotulo = "flex flex-col gap-1 text-xs text-muted-foreground";

export function FormularioComunicado({ condominioId }: { condominioId: string }) {
  const [estado, enviar, pendente] = useActionState<EstadoComunicado, FormData>(publicarComunicado, {});
  const [tipo, setTipo] = useState<"aviso" | "reuniao">("aviso");

  return (
    <form action={enviar} className="flex flex-col gap-3">
      <input type="hidden" name="condominioId" value={condominioId} />
      <div className="flex flex-wrap items-end gap-3">
        <label className={rotulo}>
          Tipo
          <select
            name="tipo"
            value={tipo}
            onChange={(e) => setTipo(e.target.value as "aviso" | "reuniao")}
            className={campo}
          >
            <option value="aviso">Aviso</option>
            <option value="reuniao">Reunião</option>
          </select>
        </label>
        <label className={`${rotulo} flex-1`}>
          Título
          <input name="titulo" required maxLength={200} className={campo} />
        </label>
      </div>

      {tipo === "reuniao" && (
        <div className="flex flex-wrap items-end gap-3">
          <label className={rotulo}>
            Data e hora (Brasília)
            <input type="datetime-local" name="dataReuniao" required className={campo} />
          </label>
          <label className={`${rotulo} flex-1`}>
            Local
            <input name="local" maxLength={200} placeholder="Salão de festas" className={campo} />
          </label>
        </div>
      )}

      <label className={rotulo}>
        Mensagem
        <textarea name="corpo" required rows={5} maxLength={10000} className={campo} />
      </label>

      <div className="flex items-center gap-3">
        <button
          disabled={pendente}
          className="rounded-lg bg-primary hover:opacity-90 px-3 py-2 text-sm text-primary-foreground disabled:opacity-50"
        >
          {pendente ? "Publicando…" : "Publicar e enviar por e-mail"}
        </button>
        <span className="text-xs text-muted-foreground">
          Vai para o portal, para o e-mail e, se estiver configurado, para o WhatsApp de quem autorizou.
        </span>
      </div>
      {estado.erro && <p className="text-sm text-danger">{estado.erro}</p>}
      {estado.aviso && <p className="text-sm text-success">{estado.aviso}</p>}
    </form>
  );
}

export function BotaoReenviar({ condominioId, comunicadoId }: { condominioId: string; comunicadoId: string }) {
  const [estado, enviar, pendente] = useActionState<EstadoComunicado, FormData>(reenviarComunicado, {});
  return (
    <form action={enviar} className="flex flex-col items-end gap-1">
      <input type="hidden" name="condominioId" value={condominioId} />
      <input type="hidden" name="comunicadoId" value={comunicadoId} />
      <button disabled={pendente} className="rounded-lg border border-border bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring px-2 py-1 text-xs disabled:opacity-50">
        Reenviar pendentes
      </button>
      {estado.erro && <p className="max-w-xs text-right text-xs text-danger">{estado.erro}</p>}
      {estado.aviso && <p className="text-xs text-success">{estado.aviso}</p>}
    </form>
  );
}
