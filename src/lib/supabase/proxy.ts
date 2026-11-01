import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const ROTAS_PUBLICAS = ["/login"];
// Rotas chamadas por serviços externos (cron), autenticadas por segredo próprio.
const ROTAS_SEM_SESSAO = ["/api/comunicacao"];

export async function atualizarSessao(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (ROTAS_SEM_SESSAO.some((rota) => pathname.startsWith(rota))) {
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // getUser() valida o token no servidor do Supabase (não confie em getSession no servidor).
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const publica = ROTAS_PUBLICAS.some((rota) => pathname.startsWith(rota));

  if (!user && !publica) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    // Depois de entrar, volta para onde a pessoa estava (ex.: link de convite).
    url.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(url);
  }

  if (user && publica) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}
