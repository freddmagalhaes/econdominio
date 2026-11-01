"use client";

import { useActionState } from "react";
import { TITULO_TERMO, VERSAO_TERMO } from "@/lib/consentimento";
import { aceitarTermo, type EstadoTermo } from "./actions";

export type GrupoTermo = { condominio: string; paragrafos: string[] };

type Canais = {
  inicialEmail: boolean;
  inicialWhatsapp: boolean;
  temEmail: boolean;
  temTelefone: boolean;
};

function CamposCanais({ inicialEmail, inicialWhatsapp, temEmail, temTelefone }: Canais) {
  return (
    <div className="flex flex-col gap-3">
      <label className={`flex items-start gap-3 ${temEmail ? "" : "opacity-60"}`}>
        <input
          type="checkbox"
          name="aceitaEmail"
          defaultChecked={inicialEmail && temEmail}
          disabled={!temEmail}
          className="mt-1 h-4 w-4 accent-primary"
        />
        <span>
          <span className="block text-sm font-medium">Receber comunicados por e-mail</span>
          <span className="block text-sm text-muted-foreground">
            {temEmail ? "Avisos, convocações de reunião e informações do condomínio." : "Sem e-mail no cadastro: fale com a administração."}
          </span>
        </span>
      </label>
      <label className={`flex items-start gap-3 ${temTelefone ? "" : "opacity-60"}`}>
        <input
          type="checkbox"
          name="aceitaWhatsapp"
          defaultChecked={inicialWhatsapp && temTelefone}
          disabled={!temTelefone}
          className="mt-1 h-4 w-4 accent-primary"
        />
        <span>
          <span className="block text-sm font-medium">Receber comunicados por WhatsApp</span>
          <span className="block text-sm text-muted-foreground">
            {temTelefone
              ? "Só comunicados, de um número exclusivo que não recebe respostas."
              : "Sem telefone no cadastro: fale com a administração."}
          </span>
        </span>
      </label>
    </div>
  );
}

function Termo({ grupos }: { grupos: GrupoTermo[] }) {
  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border bg-muted/50 p-4 text-sm">
      <p className="font-medium">
        {TITULO_TERMO} <span className="font-normal text-muted-foreground">(versão {VERSAO_TERMO})</span>
      </p>
      {grupos.map((g) => (
        <div key={g.condominio + g.paragrafos[0]} className="flex flex-col gap-2 text-muted-foreground">
          {g.paragrafos.map((p, i) => (
            <p key={i} className={i === 0 ? "font-medium text-foreground" : undefined}>
              {p}
            </p>
          ))}
        </div>
      ))}
    </div>
  );
}

/** Tela obrigatória: enquanto o termo vigente não for aceito, o portal não mostra nada além disto. */
export function TermoAceite({ grupos, semDocumento, ...canais }: { grupos: GrupoTermo[]; semDocumento: boolean } & Canais) {
  const [estado, enviar, pendente] = useActionState<EstadoTermo, FormData>(aceitarTermo, {});

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Antes de continuar</h1>
        <p className="text-sm text-muted-foreground">
          Para acessar o portal você precisa ler e aceitar o termo abaixo. A data e a hora do aceite ficam registradas.
        </p>
      </header>

      {semDocumento && (
        <p className="rounded-lg border border-warning/30 bg-warning-soft p-3 text-sm text-warning">
          Seu CPF/CNPJ ainda não consta no cadastro, e ele é necessário para o termo. Peça ao síndico ou à
          administradora para completar o cadastro e volte aqui.
        </p>
      )}

      <Termo grupos={grupos} />

      <form action={enviar} className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5 shadow-sm">
        <h2 className="text-base font-semibold">Como você quer receber os comunicados</h2>
        <CamposCanais {...canais} />
        <label className="flex items-start gap-3 rounded-lg border border-border p-3">
          <input type="checkbox" name="li" required className="mt-1 h-4 w-4 accent-primary" />
          <span className="text-sm">
            <strong>Li e aceito</strong> o termo acima.
          </span>
        </label>
        <div className="flex items-center gap-4">
          <button
            disabled={pendente || semDocumento}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {pendente ? "Registrando…" : "Aceitar e continuar"}
          </button>
          {estado.erro && <p className="text-sm text-danger">{estado.erro}</p>}
        </div>
      </form>
    </div>
  );
}

/** Seção do portal para o morador gerenciar a própria autorização depois do primeiro aceite. */
export function MinhasAutorizacoes({
  grupos,
  aceitoEm,
  ...canais
}: { grupos: GrupoTermo[]; aceitoEm: string | null } & Canais) {
  const [estado, enviar, pendente] = useActionState<EstadoTermo, FormData>(aceitarTermo, {});

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-medium">Minhas autorizações</h2>
      <form action={enviar} className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5 shadow-sm">
        <p className="text-sm text-muted-foreground">
          Escolha por onde quer receber os comunicados do condomínio. Você pode mudar quando quiser; cada mudança fica registrada.
        </p>
        <CamposCanais {...canais} />
        <div className="flex flex-wrap items-center gap-4">
          <button
            disabled={pendente}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {pendente ? "Salvando…" : "Salvar autorizações"}
          </button>
          {estado.erro && <p className="text-sm text-danger">{estado.erro}</p>}
          {estado.aviso && <p className="text-sm text-success">{estado.aviso}</p>}
        </div>
        {aceitoEm && <p className="text-xs text-muted-foreground">Termo aceito em {aceitoEm}.</p>}
        <p className="text-xs text-muted-foreground">
          Para alterar seu e-mail, telefone ou CPF/CNPJ, fale com o síndico ou com a administradora.
        </p>
      </form>
      <details className="rounded-lg border border-border p-3 text-sm">
        <summary className="cursor-pointer font-medium">Ler o termo novamente</summary>
        <div className="mt-3">
          <Termo grupos={grupos} />
        </div>
      </details>
    </section>
  );
}
