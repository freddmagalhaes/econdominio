"use client";

import { useActionState, useState } from "react";
import {
  baixarCota,
  cancelarCota,
  editarCota,
  estornarCota,
  gerarCotas,
  type EstadoCotas,
} from "./actions";

const campo =
  "rounded-lg border border-border bg-background px-2 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const botaoPrimario =
  "rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50";
const botaoSecundario =
  "rounded-lg border border-border bg-card px-2.5 py-1.5 text-sm hover:bg-muted disabled:opacity-50";

export function FormularioGerar({
  condominioId,
  competencia,
  vencimentoPadrao,
  totalUnidades,
  semValor,
}: {
  condominioId: string;
  competencia: string;
  vencimentoPadrao: string;
  totalUnidades: number;
  semValor: number;
}) {
  const [estado, enviar, pendente] = useActionState<EstadoCotas, FormData>(gerarCotas, {});
  const temCadastrados = totalUnidades - semValor > 0;
  const [modo, setModo] = useState<"cadastrado" | "igual">(temCadastrados ? "cadastrado" : "igual");

  return (
    <form action={enviar} className="flex flex-col gap-3">
      <input type="hidden" name="condominioId" value={condominioId} />
      <input type="hidden" name="competencia" value={competencia} />

      <fieldset className="flex flex-col gap-2 text-sm">
        <legend className="mb-1 text-xs text-muted-foreground">Valor das cotas</legend>
        <label className="flex items-start gap-2">
          <input
            type="radio"
            name="modo"
            value="cadastrado"
            checked={modo === "cadastrado"}
            onChange={() => setModo("cadastrado")}
            className="mt-1 accent-primary"
          />
          <span>
            Usar o valor cadastrado em cada unidade
            <span className="block text-xs text-muted-foreground">
              {totalUnidades - semValor} de {totalUnidades} unidades têm valor.
              {semValor > 0 && " As que não têm ficam de fora (cadastre na Visão geral do condomínio)."}
            </span>
          </span>
        </label>
        <label className="flex items-start gap-2">
          <input
            type="radio"
            name="modo"
            value="igual"
            checked={modo === "igual"}
            onChange={() => setModo("igual")}
            className="mt-1 accent-primary"
          />
          <span>Mesmo valor para todas as unidades</span>
        </label>
      </fieldset>

      <div className="flex flex-wrap items-end gap-3">
        {modo === "igual" && (
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Valor (R$)
            <input name="valor" placeholder="450,00" inputMode="decimal" required className={`${campo} w-32`} />
          </label>
        )}
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Vencimento
          <input type="date" name="vencimento" defaultValue={vencimentoPadrao} required className={campo} />
        </label>
        <button disabled={pendente} className={botaoPrimario}>
          Gerar cotas do mês
        </button>
      </div>
      {estado.erro && <p className="text-sm text-danger">{estado.erro}</p>}
      {estado.aviso && <p className="text-sm text-success">{estado.aviso}</p>}
    </form>
  );
}

export function AcoesCota({
  condominioId,
  cotaId,
  saldoTexto,
  valorTexto,
  vencimento,
  hoje,
  podeBaixar,
  podeEstornar,
  editavel,
}: {
  condominioId: string;
  cotaId: string;
  saldoTexto: string;
  valorTexto: string;
  vencimento: string;
  hoje: string;
  podeBaixar: boolean;
  podeEstornar: boolean;
  editavel: boolean;
}) {
  const [estadoBaixa, baixar, baixando] = useActionState<EstadoCotas, FormData>(baixarCota, {});
  const [estadoEstorno, estornar, estornando] = useActionState<EstadoCotas, FormData>(estornarCota, {});
  const [estadoEdicao, editar, editando] = useActionState<EstadoCotas, FormData>(editarCota, {});
  const [estadoCancel, cancelar, cancelando] = useActionState<EstadoCotas, FormData>(cancelarCota, {});
  const [aberto, setAberto] = useState(false);
  const erro = estadoBaixa.erro ?? estadoEstorno.erro ?? estadoEdicao.erro ?? estadoCancel.erro;

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex flex-wrap items-center justify-end gap-2">
        {podeBaixar && (
          <form action={baixar} className="flex items-center gap-1">
            <input type="hidden" name="condominioId" value={condominioId} />
            <input type="hidden" name="cotaId" value={cotaId} />
            <input type="date" name="pagoEm" defaultValue={hoje} required className={campo} />
            <input name="valor" defaultValue={saldoTexto} inputMode="decimal" required className={`${campo} w-24`} />
            <button disabled={baixando} className={botaoPrimario}>
              Baixar
            </button>
          </form>
        )}
        {podeEstornar && (
          <form
            action={estornar}
            onSubmit={(e) => {
              if (!confirm("Estornar o último pagamento desta cota?")) e.preventDefault();
            }}
          >
            <input type="hidden" name="condominioId" value={condominioId} />
            <input type="hidden" name="cotaId" value={cotaId} />
            <button disabled={estornando} className={botaoSecundario}>
              Estornar
            </button>
          </form>
        )}
        {editavel && (
          <button type="button" onClick={() => setAberto((v) => !v)} className={botaoSecundario}>
            {aberto ? "Fechar" : "Editar"}
          </button>
        )}
      </div>

      {editavel && aberto && (
        <div className="flex flex-wrap items-end justify-end gap-2 rounded-lg border border-border bg-muted/50 p-2">
          <form action={editar} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="condominioId" value={condominioId} />
            <input type="hidden" name="cotaId" value={cotaId} />
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Valor (R$)
              <input name="valor" defaultValue={valorTexto} inputMode="decimal" required className={`${campo} w-24`} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Vencimento
              <input type="date" name="vencimento" defaultValue={vencimento} required className={campo} />
            </label>
            <button disabled={editando} className={botaoPrimario}>
              Salvar
            </button>
          </form>
          <form
            action={cancelar}
            onSubmit={(e) => {
              if (!confirm("Cancelar esta cota? Ela deixa de ser cobrada e não será recriada ao gerar de novo.")) {
                e.preventDefault();
              }
            }}
          >
            <input type="hidden" name="condominioId" value={condominioId} />
            <input type="hidden" name="cotaId" value={cotaId} />
            <button disabled={cancelando} className={`${botaoSecundario} text-danger`}>
              Cancelar cota
            </button>
          </form>
        </div>
      )}

      {erro && <p className="max-w-xs text-right text-xs text-danger">{erro}</p>}
      {estadoEdicao.aviso && <p className="text-xs text-success">{estadoEdicao.aviso}</p>}
    </div>
  );
}
