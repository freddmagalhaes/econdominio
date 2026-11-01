// Gera public/modelo-importacao.xlsx (exemplo) e public/modelo-importacao-em-branco.xlsx a partir dos CSVs.
// Todas as células são texto, para o Excel não remover zeros à esquerda de CPF e telefone.
import { readFileSync } from "node:fs";
import writeExcelFile from "write-excel-file/node";

const colunas = [{ width: 10 }, { width: 10 }, { width: 28 }, { width: 18 }, { width: 34 }, { width: 16 }, { width: 14 }, { width: 14 }];

function linhasDoCsv(arquivo) {
  return readFileSync(arquivo, "utf8")
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((l) => l.split(";"));
}

async function gerar(csv, xlsx) {
  const [cabecalho, ...dados] = linhasDoCsv(csv);
  const planilha = [
    cabecalho.map((value) => ({ value, fontWeight: "bold" })),
    ...dados.map((linha) => linha.map((value) => (value === "" ? null : { value, type: String }))),
  ];
  await writeExcelFile(planilha, { columns: colunas }).toFile(xlsx);
  console.log("gerado", xlsx, `(${dados.length} linhas de dados)`);
}

await gerar("public/modelo-importacao.csv", "public/modelo-importacao.xlsx");
await gerar("public/modelo-importacao-em-branco.csv", "public/modelo-importacao-em-branco.xlsx");
