import { generateProtectedResourceMetadata, getPublicOrigin } from "mcp-handler";
import { MCP_PATH, origenPublicoFijo, supabaseIssuer } from "@/lib/mcp/auth";

/**
 * Protected Resource Metadata (RFC 9728) del endpoint MCP.
 *
 * `resource` tiene que ser EXACTAMENTE la URL del MCP que pegó el usuario
 * (Claude lo exige, path incluido), y `authorization_servers` el issuer de
 * Supabase Auth: de ahí el cliente saca el login, el registro automático
 * (DCR) y el canje de tokens.
 *
 * Se sirve en las dos ubicaciones que prueban los clientes:
 *   /.well-known/oauth-protected-resource/api/mcp  (la que anuncia el 401)
 *   /.well-known/oauth-protected-resource          (fallback en la raíz)
 */
export function respuestaMetadata(req: Request): Response {
  const metadata = generateProtectedResourceMetadata({
    authServerUrls: [supabaseIssuer()],
    resourceUrl: `${origenPublicoFijo() ?? getPublicOrigin(req)}${MCP_PATH}`,
    additionalMetadata: {
      resource_name: "YamaSend",
      bearer_methods_supported: ["header"],
    },
  });

  return new Response(JSON.stringify(metadata), {
    headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "max-age=3600" },
  });
}

export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Max-Age": "86400",
};

export function respuestaOptions(): Response {
  return new Response(null, { status: 204, headers: CORS });
}
