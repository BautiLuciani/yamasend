import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { runWithAccessToken } from "@/lib/supabase/request-auth";
import { RESOURCE_METADATA_PATH, origenPublicoFijo, verificarTokenMcp } from "@/lib/mcp/auth";
import { INSTRUCCIONES_SERVIDOR, registrarToolsYamasend } from "@/lib/mcp/tools";

/**
 * Conector MCP de YamaSend (Claude, ChatGPT y cualquier cliente MCP remoto).
 *
 * URL que se pega en el cliente: https://<dominio de YamaSend>/api/mcp
 *
 * Sin token válido responde 401 con WWW-Authenticate → el cliente descubre el
 * login (/.well-known/oauth-protected-resource/api/mcp → Supabase Auth) y le
 * muestra al usuario el botón "Conectar". Todo es stateless: cada request se
 * autentica y se resuelve sola, así que escala en serverless sin Redis.
 */

const mcpHandler = createMcpHandler(
  (server) => {
    registrarToolsYamasend(server);
  },
  {
    serverInfo: { name: "YamaSend", version: "1.0.0" },
    instructions: INSTRUCCIONES_SERVIDOR,
  },
);

const handler = withMcpAuth(
  (req: Request) => {
    // withMcpAuth ya validó el token y lo dejó en req.auth. Se envuelve el
    // request completo en el contexto del usuario para que createClient()
    // (lib/supabase/server.ts) actúe con ese token en vez de buscar cookies.
    const token = req.auth?.token;
    if (!token) return new Response("Unauthorized", { status: 401 });
    return runWithAccessToken(token, () => mcpHandler(req));
  },
  verificarTokenMcp,
  { required: true, resourceMetadataPath: RESOURCE_METADATA_PATH, resourceUrl: origenPublicoFijo() },
);

// Enviar una campaña llama al workflow de n8n: se da margen de sobra.
export const maxDuration = 60;

export { handler as GET, handler as POST, handler as DELETE };
