import { Suspense } from "react";
import { MenuLateral } from "@/app/_componentes/menu-lateral";
import { createClient } from "@/lib/supabase/server";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<Esqueleto />}>
      <ComDados>{children}</ComDados>
    </Suspense>
  );
}

function Esqueleto() {
  return (
    <div className="flex min-h-screen">
      <div className="hidden w-64 shrink-0 border-r border-border bg-card md:block" />
      <div className="flex-1 p-6 text-sm text-muted-foreground">Carregando…</div>
    </div>
  );
}

async function ComDados({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const [{ data: auth }, { data: condominios }, { data: unidades }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from("condominio").select("id, nome").order("nome"),
    supabase.rpc("portal_minhas_unidades"),
  ]);

  const lista = condominios ?? [];
  const temPortal = Array.isArray(unidades) && unidades.length > 0;

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <MenuLateral
        condominios={lista}
        temGestao={lista.length > 0}
        temPortal={temPortal}
        email={auth.user?.email ?? null}
      />
      <main className="area-conteudo min-w-0 flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
    </div>
  );
}
