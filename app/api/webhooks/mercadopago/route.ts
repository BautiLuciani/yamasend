import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { obtenerPagoMP, validarFirmaWebhook } from "@/lib/mercadopago/mercadopago";

/**
 * Webhook de Mercado Pago. Notifica cuando un pago cambia de estado.
 *
 * Cadena de confianza, en orden:
 *   1. Validar la firma HMAC del header x-signature. Sin esto, cualquiera que
 *      encuentre esta URL podría simular un pago aprobado con solo adivinar
 *      la forma del body.
 *   2. Ignorar el body de la notificación para todo lo que importa. Se toma
 *      de ahí únicamente el id del pago, y con ese id se vuelve a consultar la
 *      API de Mercado Pago con el access token del servidor. El monto y el
 *      estado que se usan son siempre los de esa segunda llamada.
 *   3. Delegar la acreditación a una RPC de Postgres que hace todo el resto
 *      atómicamente y es idempotente por payment_id — Mercado Pago reintenta
 *      esta misma notificación cada 15 minutos hasta recibir un 200 o 201, así
 *      que un reintento no puede duplicar la acreditación.
 *
 * Devuelve 200 en la enorme mayoría de los casos, incluso cuando el pago no se
 * acredita por una razón de negocio (monto insuficiente, pago rechazado,
 * orden no encontrada): esos no son errores de recepción del webhook, y
 * devolver 200 le confirma a Mercado Pago que no reintente algo que ya se
 * proceso correctamente. Solo se devuelve un código de error cuando la firma
 * no valida o cuando ocurre algo verdaderamente inesperado.
 */
export async function POST(req: NextRequest) {
  const url = new URL(req.url);

  const dataId =
    url.searchParams.get("data.id") ?? url.searchParams.get("id") ?? null;

  const firmaValida = validarFirmaWebhook({
    xSignature: req.headers.get("x-signature"),
    xRequestId: req.headers.get("x-request-id"),
    dataId,
  });

  if (!firmaValida) {
    // 401 y no 200: esta sí es una notificación que hay que rechazar, no una
    // que se procesó y no ameritó nada. No se reintenta desde Mercado Pago
    // porque, si la firma no valida legítimamente, tampoco va a validar en el
    // reintento.
    return NextResponse.json({ ok: false, error: "firma_invalida" }, { status: 401 });
  }

  let body: { type?: string; action?: string; data?: { id?: string } } | null = null;
  try {
    body = await req.json();
  } catch {
    // Un body vacío o no-JSON no es motivo de rechazo si la firma ya validó;
    // dataId puede haber llegado igual por query params.
  }

  const paymentId = body?.data?.id ?? dataId;
  const tipo = body?.type ?? url.searchParams.get("type");

  // Solo interesan las notificaciones de pago. Mercado Pago también manda
  // otros tipos (merchant_order, point_integration_wh, etc.) que no tienen
  // nada que acreditar acá.
  if (tipo !== "payment" || !paymentId) {
    return NextResponse.json({ ok: true, ignorado: true });
  }

  const pago = await obtenerPagoMP(paymentId);

  if (!pago || !pago.externalReference) {
    // No se pudo reconsultar el pago o no trae la referencia a la orden. Se
    // responde 200 igual: reintentar no va a cambiar el resultado de una
    // consulta que ya falló por datos ausentes, y frenar acá no bloquea nada
    // porque no hay orden identificada para acreditar.
    return NextResponse.json({ ok: true, procesado: false, motivo: "pago_no_resuelto" });
  }

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("yamas_send_acreditar_orden", {
    p_orden_id: pago.externalReference,
    p_payment_id: pago.id,
    p_mp_status: pago.status,
    p_mp_status_detail: pago.statusDetail,
    p_monto_pagado: pago.transactionAmount,
  });

  if (error) {
    // Este sí es un fallo real de nuestro lado (RPC caída, conexión, etc.):
    // vale la pena que Mercado Pago reintente en 15 minutos.
    return NextResponse.json({ ok: false, error: "error_interno" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, resultado: data });
}

/**
 * Mercado Pago a veces prueba el endpoint con GET antes de guardar la
 * configuración. Se responde 200 sin hacer nada: no hay pago que validar en
 * un GET, y devolver un error acá haría fallar la verificación inicial del
 * webhook en el panel de Mercado Pago.
 */
export async function GET() {
  return NextResponse.json({ ok: true });
}
