/**
 * Adónde volver después del login cuando el usuario llegó desde "Conectar"
 * en Claude / ChatGPT (pantalla de consentimiento OAuth).
 *
 * Solo se acepta la pantalla de consentimiento con su authorization_id: nada
 * de URLs absolutas ni otros paths. Un "next" libre sería un open redirect
 * (alguien podría armar un link de login que termine en un sitio falso).
 */
const PREFIJO = "/oauth/consent?authorization_id=";

export const COOKIE_NEXT_OAUTH = "ys_oauth_next";

export function nextOauthSeguro(valor: unknown): string | null {
  // typeof: ?next=a&next=b llega como array.
  if (typeof valor !== "string" || !valor || valor.length > 700) return null;
  if (!valor.startsWith(PREFIJO)) return null;
  let id: string;
  try {
    id = decodeURIComponent(valor.slice(PREFIJO.length));
  } catch {
    return null;
  }
  if (!esAuthorizationIdValido(id)) return null;
  return valor;
}

/**
 * authorization_id de Supabase: solo caracteres "no reservados" de URL, así
 * no se le puede colar otro parámetro ni un path. No se asume un formato más
 * específico (UUID u otro) porque Supabase no lo documenta.
 */
export function esAuthorizationIdValido(id: string): boolean {
  return /^[A-Za-z0-9._~-]{8,512}$/.test(id);
}

export function urlConsentimiento(authorizationId: string): string {
  return `${PREFIJO}${encodeURIComponent(authorizationId)}`;
}
