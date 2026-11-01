import type { CSSProperties } from "react";

/**
 * Marca ECONDOMINIO: edifício estilizado sobre degradê índigo → turquesa + nome em caixa alta.
 * O degradê é CSS (e não <linearGradient> com id): ids de SVG repetidos na página quebram quando a
 * primeira instância está dentro de um elemento oculto (ex.: barra do celular), e o fundo some.
 */
export function MarcaLogo({ tamanho = 36, className = "" }: { tamanho?: number; className?: string }) {
  const estilo: CSSProperties & Record<string, string | number> = {
    width: tamanho,
    height: tamanho,
    borderRadius: tamanho * 0.27,
    background: "linear-gradient(135deg, #4f46e5 0%, #14b8a6 100%)",
    printColorAdjust: "exact",
    WebkitPrintColorAdjust: "exact",
  };

  return (
    <span
      role="img"
      aria-label="ECONDOMINIO"
      className={`inline-flex shrink-0 items-center justify-center ${className}`}
      style={estilo}
    >
      <svg width={tamanho} height={tamanho} viewBox="0 0 48 48" aria-hidden="true">
        <rect x="8.5" y="24" width="11" height="15" rx="2" fill="#fff" fillOpacity=".82" />
        <rect x="29.5" y="19" width="10" height="20" rx="2" fill="#fff" fillOpacity=".82" />
        <rect x="18.5" y="9" width="11.5" height="30" rx="2.5" fill="#fff" />
        <g fill="#3d7bd9">
          <rect x="21.4" y="14" width="3" height="3" rx=".8" />
          <rect x="26" y="14" width="3" height="3" rx=".8" />
          <rect x="21.4" y="20" width="3" height="3" rx=".8" />
          <rect x="26" y="20" width="3" height="3" rx=".8" />
          <rect x="21.4" y="26" width="3" height="3" rx=".8" />
          <rect x="26" y="26" width="3" height="3" rx=".8" />
          <rect x="22.7" y="32" width="4.6" height="7" rx="1" />
        </g>
        <rect x="6" y="39.5" width="36" height="2.2" rx="1.1" fill="#fff" fillOpacity=".9" />
      </svg>
    </span>
  );
}

export function Logo({
  tamanho = 36,
  mostrarTexto = true,
  className = "",
}: {
  tamanho?: number;
  mostrarTexto?: boolean;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <MarcaLogo tamanho={tamanho} />
      {mostrarTexto && (
        <span
          className="font-extrabold leading-none tracking-[0.16em] text-foreground"
          style={{ fontSize: tamanho * 0.42 }}
        >
          E<span className="text-primary">CONDOMINIO</span>
        </span>
      )}
    </span>
  );
}
