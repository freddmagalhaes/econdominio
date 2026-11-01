"use client";

import { Icone } from "./icones";

/** Alterna claro/escuro e lembra a escolha. O ícone é trocado só por CSS (sem estado → sem erro de hidratação). */
export function AlternarTema({ className = "" }: { className?: string }) {
  function alternar() {
    const escuro = document.documentElement.classList.toggle("dark");
    try {
      localStorage.setItem("tema", escuro ? "escuro" : "claro");
    } catch {
      // armazenamento indisponível: a escolha vale só nesta página
    }
  }

  return (
    <button
      type="button"
      onClick={alternar}
      aria-label="Alternar entre tema claro e escuro"
      title="Alternar tema"
      className={`inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${className}`}
    >
      <Icone nome="sol" className="hidden dark:block" />
      <Icone nome="lua" className="dark:hidden" />
    </button>
  );
}
