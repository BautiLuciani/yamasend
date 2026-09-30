import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { procesarPrimerIngreso } from "@/lib/actions/auth";
import { COOKIE_NEXT_OAUTH, nextOauthSeguro } from "@/lib/utils/redireccionOauth";

/**
 * Adonde Supabase redirige después de que el usuario clickea el magic link
 * (login o registro, son el mismo link). Acá recién existe la sesión real.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      const resultado = await procesarPrimerIngreso();
      if ("error" in resultado) {
        const url = new URL("/register", origin);
        url.searchParams.set("error", resultado.error);
        const respuesta = NextResponse.redirect(url);
        respuesta.cookies.delete(COOKIE_NEXT_OAUTH);
        return respuesta;
      }
      // Si el login arrancó desde "Conectar" en Claude / ChatGPT, se vuelve a
      // la pantalla de consentimiento en vez de ir al panel. Solo para
      // cuentas ya operativas: una cuenta nueva sigue su onboarding normal.
      const nextOauth =
        resultado.destino === "/panel"
          ? nextOauthSeguro(decodeCookie(request.headers.get("cookie"), COOKIE_NEXT_OAUTH))
          : null;

      const respuesta = NextResponse.redirect(new URL(nextOauth ?? resultado.destino, origin));
      respuesta.cookies.delete(COOKIE_NEXT_OAUTH);
      return respuesta;
    }
  }

  // Sin código o inválido/vencido: el link ya se usó, o expiró.
  const url = new URL("/login", origin);
  url.searchParams.set("error", "El link ya no es válido. Pedí uno nuevo.");
  const respuesta = NextResponse.redirect(url);
  respuesta.cookies.delete(COOKIE_NEXT_OAUTH);
  return respuesta;
}

function decodeCookie(header: string | null, nombre: string): string | null {
  if (!header) return null;
  for (const parte of header.split(";")) {
    const [k, ...v] = parte.trim().split("=");
    if (k === nombre) {
      try {
        return decodeURIComponent(v.join("="));
      } catch {
        return null;
      }
    }
  }
  return null;
}
