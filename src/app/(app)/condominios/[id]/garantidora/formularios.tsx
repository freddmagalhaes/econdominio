"use client";

import { useActionState } from "react";
import {
  anteciparCompetencia,
  criarContrato,
  criarGarantidora,
  registrarRepasse,
  type EstadoGarantidora,
} from "./actions";

const campo = "rounded-lg border border-border bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring px-2 py-1.5 text-sm";
const botao = "rounded-lg bg-primary hover:opacity-90 px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50";
const rotulo = "flex flex-col gap-1 text-xs text-muted-foreground";

type Acao = (estado: EstadoGarantidora, formData: FormData) => Promise<EstadoGarantidora>;

function Mensagens({ estado }: { estado: EstadoGarantidora }) {
  return (
    <>
      {estado.erro && <p className="w-full text-sm text-danger">{estado.erro}</p>}
      {estado.aviso && <p className="w-full text-sm text-success">{estado.aviso}</p>}
    </>
  );
}

export function FormularioGarantidora({ condominioId }: { condominioId: string }) {
  const [estado, enviar, pendente] = useActionState<EstadoGarantidora, FormData>(criarGarantidora as Acao, {});
  return (
    <form action={enviar} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="condominioId" value={condominioId} />
      <label className={rotulo}>
        Nome da garantidora
        <input name="nome" required className={campo} />
      </label>
      <label className={rotulo}>
        CNPJ (opcional)
        <input name="documento" className={campo} />
      </label>
      <button disabled={pendente} className={botao}>
        Cadastrar garantidora
      </button>
      <Mensagens estado={estado} />
    </form>
  );
}

export function FormularioContrato({
  condominioId,
  garantidoras,
  hoje,
}: {
  condominioId: string;
  garantidoras: { id: string; nome: string }[];
  hoje: string;
}) {
  const [estado, enviar, pendente] = useActionState<EstadoGarantidora, FormData>(criarContrato as Acao, {});
  return (
    <form action={enviar} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="condominioId" value={condominioId} />
      <label className={rotulo}>
        Garantidora
        <select name="garantidoraId" required className={campo} defaultValue="">
          <option value="" disabled>
            Selecione
          </option>
          {garantidoras.map((g) => (
            <option key={g.id} value={g.id}>
              {g.nome}
            </option>
          ))}
        </select>
      </label>
      <label className={rotulo}>
        Taxa de antecipação (%)
        <input name="taxa" placeholder="2,5" inputMode="decimal" required className={`${campo} w-24`} />
      </label>
      <label className={rotulo}>
        Prazo de repasse (dias)
        <input name="prazo" type="number" min={0} max={365} defaultValue={5} required className={`${campo} w-24`} />
      </label>
      <label className={rotulo}>
        Início da vigência
        <input name="vigenciaInicio" type="date" defaultValue={hoje} required className={campo} />
      </label>
      <label className={rotulo}>
        Fim (opcional)
        <input name="vigenciaFim" type="date" className={campo} />
      </label>
      <button disabled={pendente} className={botao}>
        Criar contrato
      </button>
      <Mensagens estado={estado} />
    </form>
  );
}

export function FormularioAntecipar({
  condominioId,
  contratoId,
  competencia,
  hoje,
}: {
  condominioId: string;
  contratoId: string;
  competencia: string;
  hoje: string;
}) {
  const [estado, enviar, pendente] = useActionState<EstadoGarantidora, FormData>(
    anteciparCompetencia as Acao,
    {},
  );
  return (
    <form
      action={enviar}
      className="flex flex-wrap items-end gap-3"
      onSubmit={(e) => {
        if (!confirm("Antecipar todas as cotas abertas desta competência?")) e.preventDefault();
      }}
    >
      <input type="hidden" name="condominioId" value={condominioId} />
      <input type="hidden" name="contratoId" value={contratoId} />
      <label className={rotulo}>
        Competência
        <input name="competencia" type="month" defaultValue={competencia} required className={campo} />
      </label>
      <label className={rotulo}>
        Data da antecipação
        <input name="data" type="date" defaultValue={hoje} required className={campo} />
      </label>
      <button disabled={pendente} className={botao}>
        Antecipar cotas do mês
      </button>
      <Mensagens estado={estado} />
    </form>
  );
}

export function BotaoRepasse({
  condominioId,
  repasseId,
  hoje,
}: {
  condominioId: string;
  repasseId: string;
  hoje: string;
}) {
  const [estado, enviar, pendente] = useActionState<EstadoGarantidora, FormData>(
    registrarRepasse as Acao,
    {},
  );
  return (
    <form action={enviar} className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-1">
        <input type="hidden" name="condominioId" value={condominioId} />
        <input type="hidden" name="repasseId" value={repasseId} />
        <input type="date" name="data" defaultValue={hoje} required className={campo} />
        <button disabled={pendente} className={botao}>
          Repassado
        </button>
      </div>
      {estado.erro && <p className="text-xs text-danger">{estado.erro}</p>}
    </form>
  );
}
