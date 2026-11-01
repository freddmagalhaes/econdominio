import { Logo } from "./logo";

/** Cabeçalho que só aparece ao imprimir / salvar em PDF: marca, título do relatório e emissão. */
export function CabecalhoImpressao({
  titulo,
  subtitulo,
  emitidoEm,
}: {
  titulo: string;
  subtitulo?: string;
  emitidoEm: string;
}) {
  return (
    <div className="somente-impressao mb-6 border-b border-border pb-4">
      <div className="flex items-start justify-between">
        <Logo tamanho={40} />
        <p className="text-xs text-muted-foreground">Emitido em {emitidoEm}</p>
      </div>
      <h1 className="mt-4 text-xl font-semibold">{titulo}</h1>
      {subtitulo && <p className="text-sm text-muted-foreground">{subtitulo}</p>}
    </div>
  );
}
