"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { sair } from "@/app/login/actions";
import { AlternarTema } from "./alternar-tema";
import { Icone, type NomeIcone } from "./icones";
import { Logo } from "./logo";

type Condominio = { id: string; nome: string };

const SUBMENU: { sufixo: string; rotulo: string; icone: NomeIcone }[] = [
  { sufixo: "", rotulo: "Visão geral", icone: "predio" },
  { sufixo: "/cotas", rotulo: "Cotas", icone: "cotas" },
  { sufixo: "/garantidora", rotulo: "Garantidora", icone: "escudo" },
  { sufixo: "/balancete", rotulo: "Balancete", icone: "balanca" },
  { sufixo: "/pessoas", rotulo: "Pessoas", icone: "pessoas" },
  { sufixo: "/moradores", rotulo: "Acesso ao portal", icone: "chave" },
  { sufixo: "/comunicados", rotulo: "Comunicados", icone: "megafone" },
];

function Item({
  href,
  icone,
  ativo,
  children,
  aoClicar,
  recuo = false,
}: {
  href: string;
  icone: NomeIcone;
  ativo: boolean;
  children: React.ReactNode;
  aoClicar: () => void;
  recuo?: boolean;
}) {
  return (
    <Link
      href={href}
      onClick={aoClicar}
      aria-current={ativo ? "page" : undefined}
      className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        recuo ? "ml-3" : ""
      } ${
        ativo
          ? "bg-primary/10 font-medium text-primary"
          : "text-muted-foreground hover:bg-muted hover:text-foreground"
      }`}
    >
      <Icone nome={icone} tamanho={17} />
      <span className="truncate">{children}</span>
    </Link>
  );
}

export function MenuLateral({
  condominios,
  temGestao,
  temPortal,
  email,
}: {
  condominios: Condominio[];
  temGestao: boolean;
  temPortal: boolean;
  email: string | null;
}) {
  const pathname = usePathname();
  const [aberto, setAberto] = useState(false);
  const fechar = () => setAberto(false);
  const condominioAtual = /^\/condominios\/([0-9a-f-]{36})/.exec(pathname)?.[1];

  const navegacao = (
    <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-4" aria-label="Menu principal">
      <Item href="/dashboard" icone="inicio" ativo={pathname === "/dashboard"} aoClicar={fechar}>
        Início
      </Item>
      {temGestao && (
        <Item href="/relatorios" icone="grafico" ativo={pathname.startsWith("/relatorios")} aoClicar={fechar}>
          Relatório consolidado
        </Item>
      )}
      {temPortal && (
        <Item href="/portal" icone="usuario" ativo={pathname.startsWith("/portal")} aoClicar={fechar}>
          Meu portal
        </Item>
      )}

      {condominios.length > 0 && (
        <>
          <p className="mt-5 px-3 pb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground/70">
            Condomínios
          </p>
          {condominios.map((c) => {
            const base = `/condominios/${c.id}`;
            const ativo = c.id === condominioAtual;
            return (
              <div key={c.id} className="flex flex-col gap-1">
                <Item href={base} icone="predio" ativo={ativo && pathname === base} aoClicar={fechar}>
                  {c.nome}
                </Item>
                {ativo &&
                  SUBMENU.filter((s) => s.sufixo !== "").map((s) => (
                    <Item
                      key={s.sufixo}
                      href={`${base}${s.sufixo}`}
                      icone={s.icone}
                      ativo={pathname.startsWith(`${base}${s.sufixo}`)}
                      aoClicar={fechar}
                      recuo
                    >
                      {s.rotulo}
                    </Item>
                  ))}
              </div>
            );
          })}
        </>
      )}
    </nav>
  );

  const rodape = (
    <div className="flex items-center gap-2 border-t border-border px-3 py-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs text-muted-foreground" title={email ?? undefined}>
          {email ?? "Conta"}
        </p>
      </div>
      <AlternarTema />
      <form action={sair}>
        <button
          aria-label="Sair"
          title="Sair"
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Icone nome="sair" />
        </button>
      </form>
    </div>
  );

  return (
    <>
      {/* Barra superior (celular) */}
      <header className="nao-imprimir sticky top-0 z-30 flex items-center justify-between border-b border-border bg-card/90 px-4 py-2.5 backdrop-blur md:hidden">
        <Link href="/dashboard" onClick={fechar} aria-label="ECONDOMINIO - início">
          <Logo tamanho={30} />
        </Link>
        <button
          type="button"
          onClick={() => setAberto((v) => !v)}
          aria-label={aberto ? "Fechar menu" : "Abrir menu"}
          aria-expanded={aberto}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Icone nome={aberto ? "fechar" : "menu"} />
        </button>
      </header>

      {aberto && (
        <div
          className="nao-imprimir fixed inset-0 z-40 bg-black/40 md:hidden"
          onClick={fechar}
          aria-hidden="true"
        />
      )}

      <aside
        className={`nao-imprimir fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-border bg-card transition-transform md:sticky md:top-0 md:z-auto md:h-screen md:w-64 md:shrink-0 md:translate-x-0 ${
          aberto ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between px-5 py-5">
          <Link href="/dashboard" onClick={fechar} aria-label="ECONDOMINIO - início">
            <Logo tamanho={34} />
          </Link>
        </div>
        {navegacao}
        {rodape}
      </aside>
    </>
  );
}
