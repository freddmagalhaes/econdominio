import { InvalidInputError, readSheet } from "read-excel-file/node";

const MENSAGENS: Record<string, string> = {
  XLS_FILE_NOT_SUPPORTED: "Arquivo .xls antigo: salve como .xlsx (ou CSV) e envie de novo",
  INVALID_ZIP: "Arquivo .xlsx inválido ou corrompido",
  FILE_NOT_SUPPORTED: "Arquivo não é um .xlsx válido",
  NO_DATA: "Arquivo vazio",
};

export class ErroXlsx extends Error {}

function celulaParaTexto(valor: unknown): string {
  if (valor === null || valor === undefined) return "";
  if (typeof valor === "string") return valor;
  if (typeof valor === "number") return Number.isInteger(valor) ? String(valor) : String(valor).replace(".", ",");
  return ""; // datas e booleanos não fazem sentido nesta planilha
}

/** Lê a primeira aba de um .xlsx e devolve as linhas como texto. */
export async function lerXlsx(conteudo: Buffer): Promise<string[][]> {
  try {
    const linhas = await readSheet(conteudo);
    return linhas
      .map((linha) => linha.map(celulaParaTexto))
      .filter((linha) => linha.some((c) => c.trim() !== ""));
  } catch (e) {
    if (e instanceof InvalidInputError) throw new ErroXlsx(MENSAGENS[e.code] ?? "Não foi possível ler o arquivo .xlsx");
    throw new ErroXlsx("Não foi possível ler o arquivo .xlsx");
  }
}
