// Firma server-to-server para los webhooks de n8n (n8n.yamasai.tech).
//
// Todos los Server Actions que llaman a n8n mandan el mismo header
// X-Yamasend-Signature con el valor de YAMASEND_SENDER_SECRET (variable
// "Sensitive" en Vercel; en n8n es la credencial Header Auth que validan los
// nodos Webhook). Antes solo lo mandaba el envío de campañas; los demás
// webhooks quedaban abiertos a cualquiera que conociera el path.
//
// Este módulo NO lleva "use server": es un helper común que los archivos
// "use server" importan. Nunca se usa desde el cliente: el secreto solo vive
// en el servidor (ver AppShell.tsx, que para el QR manda el access_token del
// usuario y n8n lo valida contra Supabase Auth).

export const N8N_SIGNATURE_HEADER = "X-Yamasend-Signature";

/**
 * Headers para un POST JSON a un webhook de n8n. Si la env var no está
 * seteada se manda vacío: n8n rechaza igual (401) y el error queda a la vista
 * en vez de pasar en silencio.
 */
export function n8nHeaders(
  extra: Record<string, string> = {},
): Record<string, string> {
  return {
    "Content-Type": "application/json",
    [N8N_SIGNATURE_HEADER]: process.env.YAMASEND_SENDER_SECRET ?? "",
    ...extra,
  };
}
