/** Versão do termo mostrado ao morador. Mude ao alterar o texto: cada aceite grava a versão. */
export const VERSAO_TERMO = "2026-11-01-v2";

export const TITULO_TERMO = "Termo de autorização de comunicações";

export type TipoVinculo = "proprietario" | "inquilino";

export type VinculoTermo = {
  bloco: string | null;
  unidade: string;
  tipo: TipoVinculo;
};

export const ROTULO_VINCULO: Record<TipoVinculo, string> = {
  proprietario: "Proprietário(a)",
  inquilino: "Inquilino(a)",
};

/** Cláusulas fixas do termo (a identificação do titular é montada por `montarTermo`). */
export const PARAGRAFOS_TERMO: string[] = [
  "autorizo o condomínio e sua administradora a me enviar comunicados (avisos, convocações de reunião e informações sobre cotas e balancetes) pelos canais marcados nesta tela, nos contatos informados.",
  "Para isso, meu nome e meus dados de contato (e-mail e/ou telefone) serão compartilhados com a plataforma ECONDOMINIO e com os provedores de envio de mensagens (serviço de e-mail e serviço de mensagens por WhatsApp), exclusivamente para essa finalidade.",
  "As mensagens de WhatsApp saem de um número exclusivo para comunicados, que não recebe respostas nem é usado para conversas. Não enviaremos publicidade.",
  "Posso revogar esta autorização a qualquer momento, desmarcando o canal; a revogação também fica registrada. Tratamento de dados conforme a Lei nº 13.709/2018 (LGPD).",
];

const PARAGRAFO_INQUILINO =
  "Como inquilino(a), declaro que o contato informado é pessoal e que devo avisar a administradora se deixar de ocupar a unidade, para que esta autorização seja atualizada ou revogada.";

function descreverVinculo(v: VinculoTermo): string {
  const papel = v.tipo === "inquilino" ? "inquilino(a)" : "proprietário(a)";
  return `${papel} da unidade ${v.unidade}${v.bloco ? ` do bloco ${v.bloco}` : ""}`;
}

function juntar(itens: string[]): string {
  if (itens.length <= 1) return itens.join("");
  return `${itens.slice(0, -1).join("; ")} e ${itens[itens.length - 1]}`;
}

/**
 * Monta o termo com a identificação do titular: nome, CPF/CNPJ, bloco, unidade e se é proprietário ou
 * inquilino. O primeiro parágrafo traz os dados e já inicia a autorização; segue o restante do texto.
 */
export function montarTermo(d: {
  condominio: string;
  nome: string;
  documento: string | null | undefined;
  vinculos: VinculoTermo[];
}): string[] {
  const nome = d.nome.trim() || "(nome não informado)";
  const documento = d.documento?.trim() || "(não informado)";
  const vinculos =
    d.vinculos.length > 0 ? juntar(d.vinculos.map(descreverVinculo)) : "(sem unidade vinculada)";

  const [clausulaInicial, ...demais] = PARAGRAFOS_TERMO;
  const identificacao = `Eu, ${nome}, CPF/CNPJ ${documento}, ${vinculos}, no condomínio ${d.condominio}, ${clausulaInicial}`;

  const inquilino = d.vinculos.some((v) => v.tipo === "inquilino");
  return [identificacao, ...demais, ...(inquilino ? [PARAGRAFO_INQUILINO] : [])];
}

/** Mantém só dígitos e remove o DDI 55 quando vier com ele (mesma regra do banco). */
export function normalizarTelefone(texto: string): string {
  let d = texto.replace(/\D/g, "");
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) d = d.slice(2);
  return d;
}

/** "11981000000" -> "(11) 98100-0000" */
export function formatarTelefone(digitos: string | null | undefined): string {
  const d = normalizarTelefone(digitos ?? "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return digitos ?? "";
}
