import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/supabase/config";

const AREAS_LOGADAS = ["/cliente", "/painel"];

// Renova o token de sessão a cada navegação (Server Components não podem
// escrever cookie) e manda pro login quem entra em área logada sem sessão.
// Quem pode ver o quê dentro dessas áreas é decidido nos layouts e, de
// verdade, pela RLS — isto aqui é só o portão de entrada.
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers).forEach(([chave, valor]) => response.headers.set(chave, valor));
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  const logado = Boolean(data?.claims?.sub);
  const { pathname, search } = request.nextUrl;

  if (!logado && AREAS_LOGADAS.some((area) => pathname === area || pathname.startsWith(`${area}/`))) {
    const destino = request.nextUrl.clone();
    destino.pathname = "/entrar";
    destino.search = `?proximo=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(destino);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest|painel.webmanifest|icons/|fotos/).*)",
  ],
};
