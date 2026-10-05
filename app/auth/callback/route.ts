import { createClient } from "@/lib/supabase/server";
import { linkInvalido, redirigirTrasLogin } from "@/lib/auth/postLogin";

/**
 * Link viejo (?code=, flujo PKCE). Solo funciona en el MISMO navegador que
 * pidió el link, porque el canje necesita el "code verifier" que quedó en
 * una cookie de ese navegador. Los mails nuevos apuntan a /auth/confirm
 * (token_hash), que funciona desde cualquier navegador; esta ruta queda
 * para los links que ya se mandaron y para no romper nada.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return redirigirTrasLogin(request, origin);
  }

  // Sin código o inválido/vencido: el link ya se usó, expiró o se abrió en
  // otro navegador.
  return linkInvalido(origin);
}
