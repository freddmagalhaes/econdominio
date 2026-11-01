/** Lê CSV (separador `;` ou `,`, aspas duplas, BOM) e devolve linhas de células. */
export function lerCsv(texto: string): string[][] {
  const conteudo = texto.replace(/^﻿/, "");
  const primeiraLinha = conteudo.split(/\r?\n/, 1)[0] ?? "";
  const sep = primeiraLinha.split(";").length >= primeiraLinha.split(",").length ? ";" : ",";

  const linhas: string[][] = [];
  let linha: string[] = [];
  let celula = "";
  let emAspas = false;

  for (let i = 0; i < conteudo.length; i++) {
    const c = conteudo[i];
    if (emAspas) {
      if (c === '"' && conteudo[i + 1] === '"') {
        celula += '"';
        i++;
      } else if (c === '"') {
        emAspas = false;
      } else {
        celula += c;
      }
    } else if (c === '"') {
      emAspas = true;
    } else if (c === sep) {
      linha.push(celula);
      celula = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && conteudo[i + 1] === "\n") i++;
      linha.push(celula);
      celula = "";
      linhas.push(linha);
      linha = [];
    } else {
      celula += c;
    }
  }
  if (celula !== "" || linha.length > 0) {
    linha.push(celula);
    linhas.push(linha);
  }

  return linhas.filter((l) => l.some((c) => c.trim() !== ""));
}
