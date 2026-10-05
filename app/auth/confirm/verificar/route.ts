import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { linkInvalido, redirigirTrasLogin } from "@/lib/auth/postLogin";

const TIPOS_VALIDOS: EmailOtpType[] = ["email", "magiclink", "signup"];

/**
 * Canje del link del mail por una sesión, con token_hash (sin PKCE): no
 * depende de ninguna cookie del navegador que pidió el link, así que el link
 * se puede reenviar y abrir en otro navegador, en incógnito o en otro
 * dispositivo. Sigue siendo de un solo uso y vence como cualquier magic link.
 *
 * Solo POST: lo dispara el botón de /auth/confirm. Un GET (por ejemplo, el
 * antivirus del mail que "previsualiza" el link) nunca consume el token.
 */
export async function POST(request: Request) {
  const { origin } = new URL(request.url);
  const form = await request.formData();
  const tokenHash = String(form.get("token_hash") ?? "").trim();
  const tipo = String(form.get("type") ?? "email") as EmailOtpType;

  if (!tokenHash || !TIPOS_VALIDOS.includes(tipo)) return linkInvalido(origin, 303);

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: tipo });
  if (error) return linkInvalido(origin, 303);

  return redirigirTrasLogin(request, origin, 303);
}
