import { createHmac, timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Integración con Mercado Pago Checkout Pro.
 *
 * Dos responsabilidades separadas a propósito:
 *   1. Crear la preferencia de pago (crearPreferenciaPago) — la llama el
 *      server action de compra, con sesión de usuario.
 *   2. Validar la firma de un webhook entrante (validarFirmaWebhook) — la
 *      llama el route handler, que no tiene sesión porque quien golpea la
 *      puerta es Mercado Pago, no el usuario.
 *
 * El flujo completo de la plata:
 *   usuario elige pack → RPC congela el precio en una orden → esta función
 *   crea la preferencia con ese monto ya fijo → se redirige al init_point →
 *   Mercado Pago cobra → webhook avisa → se valida firma → se reconsulta el
 *   pago a la API de MP (nunca se confía en el body del webhook) → se
 *   acreditan los créditos.
 *
 * Ningún paso de ese flujo confía en un monto que venga del navegador.
 */

const MP_API = "https://api.mercadopago.com";

function accessToken(): string {
  const t = process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!t) throw new Error("Falta MERCADOPAGO_ACCESS_TOKEN en el entorno.");
  return t;
}

function webhookSecret(): string {
  const s = process.env.MERCADOPAGO_WEBHOOK_SECRET;
  if (!s) throw new Error("Falta MERCADOPAGO_WEBHOOK_SECRET en el entorno.");
  return s;
}

/** URL pública de la app, para las back_urls y el notification_url. */
function appUrl(): string {
  const u = process.env.NEXT_PUBLIC_APP_URL;
  if (!u) throw new Error("Falta NEXT_PUBLIC_APP_URL en el entorno.");
  return u.replace(/\/$/, "");
}

export interface CrearPreferenciaInput {
  ordenId: string;
  packNombre: string;
  creditos: number;
  montoArs: number;
}

export interface CrearPreferenciaResult {
  ok: boolean;
  error: string | null;
  /** URL a la que redirigir al comprador para pagar. */
  initPoint: string | null;
}

/**
 * Crea una preferencia de Checkout Pro para una orden ya existente.
 *
 * external_reference lleva el id de la orden, no datos de precio: es la única
 * forma en que el webhook, más adelante, sabe qué orden acreditar. El monto
 * que ve Mercado Pago es el que ya quedó congelado en la orden por la RPC
 * yamas_send_crear_orden_compra — esta función nunca recibe un precio como
 * parámetro suelto para no abrir la puerta a que alguien la llame con un
 * monto distinto del real.
 */
export async function crearPreferenciaPago(
  input: CrearPreferenciaInput,
): Promise<CrearPreferenciaResult> {
  const base = appUrl();

  try {
    const res = await fetch(`${MP_API}/checkout/preferences`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken()}`,
        // Evita crear una preferencia duplicada si el usuario refresca o si
        // un reintento de red repite la llamada: Mercado Pago devuelve la
        // preferencia ya creada para la misma clave en vez de generar otra.
        "X-Idempotency-Key": input.ordenId,
      },
      body: JSON.stringify({
        items: [
          {
            id: input.ordenId,
            title: `${input.packNombre} — ${input.creditos.toLocaleString("es-AR")} créditos YamaSend`,
            quantity: 1,
            currency_id: "ARS",
            unit_price: input.montoArs,
          },
        ],
        external_reference: input.ordenId,
        back_urls: {
          success: `${base}/panel/creditos/resultado?estado=success`,
          failure: `${base}/panel/creditos/resultado?estado=failure`,
          pending: `${base}/panel/creditos/resultado?estado=pending`,
        },
        auto_return: "approved",
        notification_url: `${base}/api/webhooks/mercadopago`,
        statement_descriptor: "YAMASEND",
        // 30 minutos, igual que expira_at de la orden: pasada la ventana, el
        // precio mostrado ya no es válido y conviene que el usuario vuelva a
        // elegir el pack para recalcularlo contra el dólar del momento.
        expires: true,
        expiration_date_from: new Date().toISOString(),
        expiration_date_to: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      }),
    });

    const data = await res.json().catch(() => null);

    if (!res.ok || !data?.init_point) {
      return {
        ok: false,
        error: "No pudimos iniciar el pago. Probá de nuevo en unos segundos.",
        initPoint: null,
      };
    }

    // Se guarda el preference_id en la orden para poder correlacionar después
    // si hace falta soporte, aunque la acreditación no depende de este dato.
    const admin = createAdminClient();
    await admin
      .from("yamas_send_ordenes_compra")
      .update({ mp_preference_id: data.id, updated_at: new Date().toISOString() })
      .eq("id", input.ordenId);

    return { ok: true, error: null, initPoint: data.init_point as string };
  } catch {
    return {
      ok: false,
      error: "No pudimos conectar con Mercado Pago. Probá de nuevo en unos segundos.",
      initPoint: null,
    };
  }
}

export interface PagoMP {
  id: string;
  status: string;
  statusDetail: string | null;
  transactionAmount: number | null;
  externalReference: string | null;
}

/**
 * Reconsulta un pago a la API de Mercado Pago por su id.
 *
 * El webhook nunca acredita créditos en base a lo que trae el propio body de
 * la notificación: ese body es fácil de falsificar si alguien conociera (o
 * adivinara) la forma del payload. El monto y el estado que importan son los
 * que devuelve esta llamada, autenticada con el access token del servidor.
 */
export async function obtenerPagoMP(paymentId: string): Promise<PagoMP | null> {
  try {
    const res = await fetch(`${MP_API}/v1/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${accessToken()}` },
      cache: "no-store",
    });

    if (!res.ok) return null;

    const data = await res.json();
    return {
      id: String(data.id),
      status: String(data.status ?? ""),
      statusDetail: data.status_detail ?? null,
      transactionAmount:
        typeof data.transaction_amount === "number" ? data.transaction_amount : null,
      externalReference: data.external_reference ?? null,
    };
  } catch {
    return null;
  }
}

/**
 * Valida la firma HMAC-SHA256 de un webhook de Mercado Pago.
 *
 * Formato del header x-signature: "ts=<timestamp>,v1=<hmac>". El manifiesto a
 * firmar es "id:{dataId};request-id:{xRequestId};ts:{ts};", con dataId en
 * minúsculas (Mercado Pago lo pide así explícitamente en su documentación
 * cuando el id trae caracteres alfanuméricos en mayúscula).
 *
 * Usa una comparación de tiempo constante (timingSafeEqual) y no === : con ===
 * el tiempo de respuesta varía según cuántos caracteres coinciden antes de la
 * primera diferencia, lo cual en teoría permite reconstruir la firma correcta
 * byte a byte probando muchas veces. timingSafeEqual siempre tarda lo mismo,
 * sin importar en qué posición difieren las cadenas.
 */
export function validarFirmaWebhook(params: {
  xSignature: string | null;
  xRequestId: string | null;
  dataId: string | null;
}): boolean {
  const { xSignature, xRequestId, dataId } = params;
  if (!xSignature || !dataId) return false;

  let ts: string | undefined;
  let hash: string | undefined;
  for (const part of xSignature.split(",")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    const val = part.slice(eq + 1).trim();
    if (key === "ts") ts = val;
    if (key === "v1") hash = val;
  }
  if (!ts || !hash) return false;

  const parts: string[] = [];
  parts.push(`id:${dataId.toLowerCase()}`);
  if (xRequestId) parts.push(`request-id:${xRequestId}`);
  parts.push(`ts:${ts}`);
  const manifest = parts.join(";") + ";";

  const computed = createHmac("sha256", webhookSecret())
    .update(manifest)
    .digest("hex");

  const a = Buffer.from(computed, "utf8");
  const b = Buffer.from(hash, "utf8");
  if (a.length !== b.length) return false;

  return timingSafeEqual(a, b);
}
