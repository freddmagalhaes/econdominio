"use client";

import { useActionState, useState } from "react";
import {
  montarTermo,
  normalizarTelefone,
  TITULO_TERMO,
  VERSAO_TERMO,
  type VinculoTermo,
} from "@/lib/consentimento";
import { salvarPessoa, type EstadoPessoa } from "./actions";

type Inicial = {
  nome: string;
  documento: string;
  email: string;
  telefone: string;
  aceitaEmail: boolean;
  aceitaWhatsapp: boolean;
};

const campo =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const rotulo = "flex flex-col gap-1 text-sm font-medium";

export function FormularioPessoa({
  condominioId,
  condominioNome,
  pessoaId,
  inicial,
  vinculos,
}: {
  condominioId: string;
  condominioNome: string;
  pessoaId: string;
  inicial: Inicial;
  vinculos: VinculoTermo[];
}) {
  const [estado, enviar, pendente] = useActionState<EstadoPessoa, FormData>(salvarPessoa, {});
  const [nome, setNome] = useState(inicial.nome);
  const [documento, setDocumento] = useState(inicial.documento);
  const [email, setEmail] = useState(inicial.email);
  const [telefone, setTelefone] = useState(inicial.telefone);
  const [aceitaEmail, setAceitaEmail] = useState(inicial.aceitaEmail);
  const [aceitaWhatsapp, setAceitaWhatsapp] = useState(inicial.aceitaWhatsapp);

  // Liberar um canal, ou trocar o contato de um canal liberado, exige o aceite do termo (o banco também exige).
  const liberaEmail =
    aceitaEmail && (!inicial.aceitaEmail || email.trim().toLowerCase() !== inicial.email.trim().toLowerCase());
  const liberaWhatsapp =
    aceitaWhatsapp && (!inicial.aceitaWhatsapp || normalizarTelefone(telefone) !== normalizarTelefone(inicial.telefone));
  const exigeTermo = liberaEmail || liberaWhatsapp;
  const faltaDocumento = exigeTermo && documento.trim() === "";

  // O termo reflete o que está digitado agora (nome e CPF/CNPJ) e os vínculos salvos.
  const termo = montarTermo({ condominio: condominioNome, nome, documento, vinculos });

  return (
    <form action={enviar} className="flex flex-col gap-6">
      <input type="hidden" name="condominioId" value={condominioId} />
      <input type="hidden" name="pessoaId" value={pessoaId} />

      <section className="grid gap-4 rounded-xl border border-border bg-card p-5 shadow-sm sm:grid-cols-2">
        <h2 className="text-base font-semibold sm:col-span-2">Dados</h2>
        <label className={rotulo}>
          Nome
          <input
            name="nome"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            required
            minLength={2}
            maxLength={120}
            className={campo}
          />
        </label>
        <label className={rotulo}>
          CPF / CNPJ
          <input
            name="documento"
            value={documento}
            onChange={(e) => setDocumento(e.target.value)}
            maxLength={30}
            required={exigeTermo}
            aria-invalid={faltaDocumento}
            className={campo}
          />
          {faltaDocumento && <span className="text-xs font-normal text-danger">Obrigatório para liberar o canal: consta no termo.</span>}
        </label>
        <label className={rotulo}>
          E-mail
          <input
            name="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            maxLength={200}
            className={campo}
          />
        </label>
        <label className={rotulo}>
          Telefone / WhatsApp
          <input
            name="telefone"
            value={telefone}
            onChange={(e) => setTelefone(e.target.value)}
            inputMode="tel"
            placeholder="(11) 98100-0000"
            maxLength={30}
            className={campo}
          />
        </label>
      </section>

      <section className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5 shadow-sm">
        <h2 className="text-base font-semibold">Comunicações</h2>

        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            name="aceitaEmail"
            checked={aceitaEmail}
            onChange={(e) => setAceitaEmail(e.target.checked)}
            className="mt-1 h-4 w-4 accent-primary"
          />
          <span>
            <span className="block text-sm font-medium">Receber comunicados por e-mail</span>
            <span className="block text-sm text-muted-foreground">
              Avisos, convocações de reunião e informações do condomínio.
            </span>
          </span>
        </label>

        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            name="aceitaWhatsapp"
            checked={aceitaWhatsapp}
            onChange={(e) => setAceitaWhatsapp(e.target.checked)}
            className="mt-1 h-4 w-4 accent-primary"
          />
          <span>
            <span className="block text-sm font-medium">Receber comunicados por WhatsApp</span>
            <span className="block text-sm text-muted-foreground">
              Só comunicados, de um número exclusivo (não recebe respostas). O envio por WhatsApp ainda será
              ativado; a autorização já fica registrada.
            </span>
          </span>
        </label>

        <details className="rounded-lg border border-border bg-muted/50 p-4 text-sm" open={exigeTermo}>
          <summary className="cursor-pointer font-medium">
            {TITULO_TERMO} <span className="font-normal text-muted-foreground">(versão {VERSAO_TERMO})</span>
          </summary>
          <div className="mt-3 flex flex-col gap-2 text-muted-foreground">
            {termo.map((p, i) => (
              <p key={i} className={i === 0 ? "font-medium text-foreground" : undefined}>
                {p}
              </p>
            ))}
          </div>
        </details>

        {exigeTermo && (
          <label className="flex items-start gap-3 rounded-lg border border-warning/30 bg-warning-soft p-3">
            <input type="checkbox" name="termo" required className="mt-1 h-4 w-4 accent-primary" />
            <span className="text-sm">
              Confirmo que o morador <strong>leu e autorizou</strong> o termo acima para os canais marcados.
            </span>
          </label>
        )}
      </section>

      <div className="flex items-center gap-4">
        <button
          disabled={pendente}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {pendente ? "Salvando…" : "Salvar"}
        </button>
        {estado.erro && <p className="text-sm text-danger">{estado.erro}</p>}
        {estado.aviso && <p className="text-sm text-success">{estado.aviso}</p>}
      </div>
    </form>
  );
}
