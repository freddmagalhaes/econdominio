import { formatarCentavos } from "@/lib/dinheiro";

export type LinhaBalancete = {
  competencia: string;
  codigo: string;
  nome: string;
  tipo: "receita" | "despesa";
  total_centavos: number;
};

export function TabelaBalancete({
  titulo,
  linhas,
  total,
}: {
  titulo: string;
  linhas: LinhaBalancete[];
  total: number;
}) {
  return (
    <div className="flex flex-col gap-1">
      <h3 className="text-sm font-medium">{titulo}</h3>
      <table className="w-full text-sm">
        <tbody className="divide-y divide-border">
          {linhas.length === 0 && (
            <tr>
              <td className="py-1 text-muted-foreground">Sem movimento no mês.</td>
            </tr>
          )}
          {linhas.map((l) => (
            <tr key={l.codigo}>
              <td className="py-1 text-muted-foreground">{l.codigo}</td>
              <td>{l.nome}</td>
              <td className="text-right">{formatarCentavos(l.total_centavos)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot className="border-t border-border font-medium">
          <tr>
            <td colSpan={2} className="py-1">
              Total
            </td>
            <td className="text-right">{formatarCentavos(total)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

const soma = (linhas: LinhaBalancete[], tipo: string) =>
  linhas.filter((l) => l.tipo === tipo).reduce((s, l) => s + Number(l.total_centavos), 0);

/** Resumo de um mês a partir das linhas acumuladas até ele (competência = "AAAA-MM-01"). */
export function resumirBalancete(todas: LinhaBalancete[], inicioMes: string) {
  const doMes = todas.filter((l) => l.competencia === inicioMes).sort((a, b) => a.codigo.localeCompare(b.codigo));
  const anteriores = todas.filter((l) => l.competencia < inicioMes);
  const totalReceitas = soma(doMes, "receita");
  const totalDespesas = soma(doMes, "despesa");
  const resultado = totalReceitas - totalDespesas;
  const saldoAnterior = soma(anteriores, "receita") - soma(anteriores, "despesa");
  return {
    receitas: doMes.filter((l) => l.tipo === "receita"),
    despesas: doMes.filter((l) => l.tipo === "despesa"),
    totalReceitas,
    totalDespesas,
    resultado,
    saldoAnterior,
    saldoFinal: saldoAnterior + resultado,
  };
}

export function ResumoBalancete({
  saldoAnterior,
  resultado,
  saldoFinal,
}: {
  saldoAnterior: number;
  resultado: number;
  saldoFinal: number;
}) {
  return (
    <section className="grid grid-cols-3 gap-3">
      {[
        ["Saldo anterior", saldoAnterior],
        ["Resultado do mês", resultado],
        ["Saldo final", saldoFinal],
      ].map(([titulo, valor]) => (
        <div key={titulo as string} className="rounded-xl border border-border bg-card shadow-sm p-3">
          <p className="text-xs text-muted-foreground">{titulo}</p>
          <p className={`text-lg font-semibold ${Number(valor) < 0 ? "text-danger" : ""}`}>
            {formatarCentavos(Number(valor))}
          </p>
        </div>
      ))}
    </section>
  );
}
