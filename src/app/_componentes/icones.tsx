const CAMINHOS = {
  inicio: "M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10",
  grafico: "M4 20V10M10 20V4M16 20v-8M22 20H2",
  usuario: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0",
  predio: "M5 21V4h9v17M14 9h5v12M3 21h18M8 8h3M8 12h3M8 16h3",
  cotas: "M6 3h12v18l-3-2-3 2-3-2-3 2V3zM9 8h6M9 12h6",
  escudo: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3zM9 12l2 2 4-4",
  balanca: "M12 3v18M5 7h14M5 7l-3 7a3 3 0 0 0 6 0L5 7zM19 7l-3 7a3 3 0 0 0 6 0l-3-7z",
  pessoas: "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2 20a7 7 0 0 1 14 0M17 4.5a3.5 3.5 0 0 1 0 6.5M22 20a6 6 0 0 0-4-5.6",
  chave: "M15 7a4 4 0 1 1-3.9 4.9L4 19v-3H1v-3h3l5.1-5.1A4 4 0 0 1 15 7zM16 8h.01",
  megafone: "M3 11v2a1 1 0 0 0 1 1h3l8 4V6L7 10H4a1 1 0 0 0-1 1zM19 9a4 4 0 0 1 0 6",
  sol: "M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4",
  lua: "M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z",
  sair: "M9 21H5V3h4M16 17l5-5-5-5M21 12H9",
  menu: "M4 6h16M4 12h16M4 18h16",
  fechar: "M6 6l12 12M18 6L6 18",
  impressora: "M6 9V3h12v6M6 18H4v-7h16v7h-2M7 14h10v7H7z",
  lapis: "M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4",
  voltar: "M15 18l-6-6 6-6",
} as const;

export type NomeIcone = keyof typeof CAMINHOS;

export function Icone({ nome, tamanho = 18, className }: { nome: NomeIcone; tamanho?: number; className?: string }) {
  return (
    <svg
      width={tamanho}
      height={tamanho}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d={CAMINHOS[nome]} />
    </svg>
  );
}
