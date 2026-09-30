import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Códigos de confirmación para las acciones que no se pueden deshacer
 * (mandar un template a Meta, enviar o programar una campaña).
 *
 * El flujo desde el chat es siempre en dos pasos:
 *   1. "preparar_*"  → valida todo, NO ejecuta nada y devuelve un resumen para
 *                      mostrarle al usuario + un código.
 *   2. "confirmar_*" → recibe los mismos datos + el código. Solo ejecuta si el
 *                      código corresponde exactamente a esos datos, a ese
 *                      usuario y no venció.
 *
 * Qué garantiza y qué no:
 *   - El modelo no puede ejecutar sin haber generado antes la vista previa,
 *     ni cambiar un dato entre la vista previa y la ejecución (otra audiencia,
 *     otro template, otros destinatarios): cualquier diferencia invalida el
 *     código.
 *   - El código NO prueba por sí solo que el usuario dijo que sí: eso lo da el
 *     diálogo de aprobación de Claude / ChatGPT para tools destructivas (que
 *     muestra estos mismos datos, porque viajan como argumentos del paso 2) y
 *     las instrucciones del servidor. Si el usuario eligió "permitir siempre",
 *     el cliente puede no preguntar.
 *   - Que un código se use UNA sola vez lo garantiza la tabla
 *     yamas_send_mcp_confirmaciones (ver consumirCodigo en lib/mcp/tools.ts).
 *
 * La firma es stateless (HMAC): funciona igual en serverless con varias
 * instancias.
 */

const VIGENCIA_MS = 15 * 60 * 1000;

function clave(): Buffer | null {
  const explicita = process.env.MCP_CONFIRMACION_SECRET;
  if (explicita && explicita.length >= 32) return Buffer.from(explicita, "utf8");

  // Sin secreto propio, se deriva uno del service role (que ya existe en el
  // entorno y nunca sale del servidor). Derivarlo con HMAC y una etiqueta fija
  // evita usar la clave de Supabase tal cual para otra cosa.
  const base = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base) return null;
  return createHmac("sha256", base).update("yamasend-mcp-confirmacion-v1").digest();
}

/** Serialización estable (claves ordenadas) para que el HMAC sea determinista. */
function estable(valor: unknown): string {
  if (Array.isArray(valor)) return `[${valor.map(estable).join(",")}]`;
  if (valor && typeof valor === "object") {
    const obj = valor as Record<string, unknown>;
    return `{${Object.keys(obj)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${estable(obj[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(valor ?? null);
}

function firmar(tipo: string, userId: string, datos: unknown, exp: number, k: Buffer): string {
  return createHmac("sha256", k)
    .update(`${tipo}|${userId}|${exp}|${estable(datos)}`)
    .digest("base64url")
    .slice(0, 22);
}

export function crearCodigoConfirmacion(
  tipo: string,
  userId: string,
  datos: unknown,
): string | null {
  const k = clave();
  if (!k) return null;
  const exp = Date.now() + VIGENCIA_MS;
  return `${exp.toString(36)}.${firmar(tipo, userId, datos, exp, k)}`;
}

export type ResultadoVerificacion = "ok" | "vencido" | "invalido" | "sin_configurar";

export function verificarCodigoConfirmacion(
  codigo: string,
  tipo: string,
  userId: string,
  datos: unknown,
): ResultadoVerificacion {
  const k = clave();
  if (!k) return "sin_configurar";

  const [expTxt, firma] = (codigo ?? "").trim().split(".");
  if (!expTxt || !firma) return "invalido";

  const exp = parseInt(expTxt, 36);
  if (!Number.isFinite(exp)) return "invalido";

  const esperada = firmar(tipo, userId, datos, exp, k);
  const a = Buffer.from(firma);
  const b = Buffer.from(esperada);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return "invalido";

  if (Date.now() > exp) return "vencido";
  return "ok";
}
