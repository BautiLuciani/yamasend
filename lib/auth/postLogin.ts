import { NextResponse } from "next/server";
import { procesarPrimerIngreso } from "@/lib/actions/auth";
import { COOKIE_NEXT_OAUTH, nextOauthSeguro } from "@/lib/utils/redireccionOauth";

/**
 * Lo que pasa después de que la sesión ya existe (venga del link con
 * ?code= o del link con token_hash): primer ingreso, vuelta a la pantalla
 * de consentimiento del conector si correspondía, y limpieza de la cookie.
 *
 * `status` 303 para cuando se llega por POST (el formulario de
 * /auth/confirm): así el navegador sigue con un GET al destino.
 */
export async function redirigirTrasLogin(
  request: Request,
  origin: string,
  status: 302 | 303 = 302,
): Promise<NextResponse> {
  const resultado = await procesarPrimerIngreso();
  if ("error" in resultado) {
    const url = new URL("/register", origin);
    url.searchParams.set("error", resultado.error);
    const respuesta = NextResponse.redirect(url, status);
    respuesta.cookies.delete(COOKIE_NEXT_OAUTH);
    return respuesta;
  }
  // Si el login arrancó desde "Conectar" en Claude / ChatGPT, se vuelve a
  // la pantalla de consentimiento en vez de ir al panel. Solo para
  // cuentas ya operativas: una cuenta nueva sigue su onboarding normal.
  const nextOauth =
    resultado.destino === "/panel"
      ? nextOauthSeguro(leerCookie(request.headers.get("cookie"), COOKIE_NEXT_OAUTH))
      : null;

  const respuesta = NextResponse.redirect(new URL(nextOauth ?? resultado.destino, origin), status);
  respuesta.cookies.delete(COOKIE_NEXT_OAUTH);
  return respuesta;
}

export function linkInvalido(origin: string, status: 302 | 303 = 302): NextResponse {
  const url = new URL("/login", origin);
  url.searchParams.set("error", "El link ya no es válido. Pedí uno nuevo.");
  const respuesta = NextResponse.redirect(url, status);
  respuesta.cookies.delete(COOKIE_NEXT_OAUTH);
  return respuesta;
}

function leerCookie(header: string | null, nombre: string): string | null {
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
