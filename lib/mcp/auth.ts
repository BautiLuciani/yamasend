import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { AuthInfo } from "@modelcontextprotocol/server";

/**
 * Autenticación del conector MCP.
 *
 * Quien emite los tokens es el OAuth 2.1 Server de Supabase Auth (el mismo
 * proyecto y los mismos usuarios que el panel). Claude y ChatGPT se registran
 * solos contra él (Dynamic Client Registration), el usuario inicia sesión con
 * su cuenta de YamaSend, aprueba en /oauth/consent, y el cliente recibe un
 * access token que después manda en cada request al MCP.
 */

/** Issuer del Auth server de Supabase (lo que va en authorization_servers). */
export function supabaseIssuer(): string {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/+$/, "");
  return `${url}/auth/v1`;
}

/** Path público del endpoint MCP. La URL completa es origen + este path. */
export const MCP_PATH = "/api/mcp";

/**
 * Origen público fijo del MCP, si está configurado (MCP_PUBLIC_ORIGIN, ej.
 * https://app.yamasend.com). Claude exige que `resource` sea exactamente la
 * URL que pegó el usuario; fijarlo evita diferencias entre dominios (www vs
 * sin www, previews de Vercel). Sin la variable se usa el host del request.
 */
export function origenPublicoFijo(): string | undefined {
  const v = process.env.MCP_PUBLIC_ORIGIN?.trim().replace(/\/+$/, "");
  return v ? v : undefined;
}

/** Path de la Protected Resource Metadata (RFC 9728) para el endpoint MCP. */
export const RESOURCE_METADATA_PATH = `/.well-known/oauth-protected-resource${MCP_PATH}`;

interface ClaimsToken {
  sub?: string;
  role?: string;
  iss?: string;
  exp?: number;
  client_id?: string;
  scope?: string;
}

function decodificarPayload(token: string): ClaimsToken | null {
  const partes = token.split(".");
  if (partes.length !== 3) return null;
  try {
    const json = Buffer.from(partes[1], "base64url").toString("utf8");
    const payload = JSON.parse(json) as unknown;
    return payload && typeof payload === "object" ? (payload as ClaimsToken) : null;
  } catch {
    return null;
  }
}

/**
 * Valida el bearer token de un request al MCP. Devuelve undefined si no es
 * válido: withMcpAuth responde entonces 401 con el WWW-Authenticate que hace
 * que Claude / ChatGPT muestren el botón "Conectar".
 *
 * Reglas (todas fail-closed):
 *   1. auth.getUser(token) contra el Auth server de Supabase: verifica firma,
 *      vencimiento y que la sesión no se haya revocado (si el usuario
 *      desconecta el conector o cierra sesión, el token deja de servir).
 *   2. El token tiene que haber sido emitido por NUESTRO proyecto (iss).
 *   3. Tiene que ser un token OAuth (claim client_id). Un token de sesión del
 *      panel no se acepta acá: el conector solo funciona si el usuario lo
 *      aprobó explícitamente en la pantalla de consentimiento.
 *   4. role "authenticated": nunca anon ni service_role.
 */
export async function verificarTokenMcp(
  _req: Request,
  bearerToken?: string,
): Promise<AuthInfo | undefined> {
  if (!bearerToken) return undefined;

  const claims = decodificarPayload(bearerToken);
  if (!claims) return undefined;
  if (claims.iss !== supabaseIssuer()) return undefined;
  if (claims.role !== "authenticated") return undefined;
  if (!claims.client_id || !claims.sub) return undefined;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return undefined;

  const supabase = createSupabaseClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const { data, error } = await supabase.auth.getUser(bearerToken);
  if (error || !data.user || data.user.id !== claims.sub) return undefined;

  return {
    token: bearerToken,
    clientId: claims.client_id,
    scopes: claims.scope ? claims.scope.split(" ").filter(Boolean) : [],
    expiresAt: claims.exp,
    extra: { userId: data.user.id },
  };
}
