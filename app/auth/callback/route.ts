import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { procesarPrimerIngreso } from "@/lib/actions/auth";

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
        return NextResponse.redirect(url);
      }
      return NextResponse.redirect(new URL(resultado.destino, origin));
    }
  }

  // Sin código o inválido/vencido: el link ya se usó, o expiró.
  const url = new URL("/login", origin);
  url.searchParams.set("error", "El link ya no es válido. Pedí uno nuevo.");
  return NextResponse.redirect(url);
}
