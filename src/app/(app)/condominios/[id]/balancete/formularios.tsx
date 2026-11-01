"use client";

import { useActionState } from "react";
import {
  criarConta,
  criarLancamento,
  estornarLancamento,
  type EstadoBalancete,
} from "./actions";

const campo = "rounded-lg border border-border bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring px-2 py-1.5 text-sm";
const botao = "rounded-lg bg-primary hover:opacity-90 px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50";
const rotulo = "flex flex-col gap-1 text-xs text-muted-foreground";

type Acao = (estado: EstadoBalancete, formData: FormData) => Promise<EstadoBalancete>;
type Conta = { id: string; codigo: string; nome: string; tipo: string };

function Mensagens({ estado }: { estado: EstadoBalancete }) {
  return (
    <>
      {estado.erro && <p className="w-full text-sm text-danger">{estado.erro}</p>}
      {estado.aviso && <p className="w-full text-sm text-success">{estado.aviso}</p>}
    </>
  );
}

export function FormularioLancamento({
  condominioId,
  contas,
  hoje,
}: {
  condominioId: string;
  contas: Conta[];
  hoje: string;
}) {
  const [estado, enviar, pendente] = useActionState<EstadoBalancete, FormData>(criarLancamento as Acao, {});
  const grupo = (tipo: string, titulo: string) => (
    <optgroup label={titulo}>
      {contas
        .filter((c) => c.tipo === tipo)
        .map((c) => (
          <option key={c.id} value={c.id}>
            {c.codigo} · {c.nome}
          </option>
        ))}
    </optgroup>
  );

  return (
    <form action={enviar} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="condominioId" value={condominioId} />
      <label className={rotulo}>
        Conta
        <select name="contaId" required defaultValue="" className={campo}>
          <option value="" disabled>
            Selecione
          </option>
          {grupo("despesa", "Despesas")}
          {grupo("receita", "Receitas")}
        </select>
      </label>
      <label className={rotulo}>
        Data
        <input type="date" name="data" defaultValue={hoje} required className={campo} />
      </label>
      <label className={rotulo}>
        Valor (R$)
        <input name="valor" placeholder="1.250,00" inputMode="decimal" required className={`${campo} w-28`} />
      </label>
      <label className={`${rotulo} flex-1`}>
        Descrição
        <input name="descricao" required className={campo} />
      </label>
      <button disabled={pendente} className={botao}>
        Lançar
      </button>
      <Mensagens estado={estado} />
    </form>
  );
}

export function BotaoEstornarLancamento({
  condominioId,
  lancamentoId,
}: {
  condominioId: string;
  lancamentoId: string;
}) {
  const [estado, enviar, pendente] = useActionState<EstadoBalancete, FormData>(estornarLancamento as Acao, {});
  return (
    <form
      action={enviar}
      onSubmit={(e) => {
        if (!confirm("Estornar este lançamento?")) e.preventDefault();
      }}
      className="flex flex-col items-end gap-1"
    >
      <input type="hidden" name="condominioId" value={condominioId} />
      <input type="hidden" name="lancamentoId" value={lancamentoId} />
      <button disabled={pendente} className="rounded-lg border border-border bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring px-2 py-1 text-xs disabled:opacity-50">
        Estornar
      </button>
      {estado.erro && <p className="text-xs text-danger">{estado.erro}</p>}
    </form>
  );
}

export function FormularioConta({ condominioId }: { condominioId: string }) {
  const [estado, enviar, pendente] = useActionState<EstadoBalancete, FormData>(criarConta as Acao, {});
  return (
    <form action={enviar} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="condominioId" value={condominioId} />
      <label className={rotulo}>
        Código
        <input name="codigo" placeholder="2.11" required className={`${campo} w-24`} />
      </label>
      <label className={rotulo}>
        Nome
        <input name="nome" required className={campo} />
      </label>
      <label className={rotulo}>
        Tipo
        <select name="tipo" defaultValue="despesa" className={campo}>
          <option value="despesa">Despesa</option>
          <option value="receita">Receita</option>
        </select>
      </label>
      <button disabled={pendente} className={botao}>
        Criar conta
      </button>
      <Mensagens estado={estado} />
    </form>
  );
}
