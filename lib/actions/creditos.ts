"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentMembership } from "@/lib/auth/permisos";
import { getPreciosCreditos, type PreciosCreditos } from "@/lib/creditos/precio";
import { crearPreferenciaPago } from "@/lib/mercadopago/mercadopago";

/**
 * Datos de créditos para la UI: cuánto tiene la persona y cuánto cuesta
 * comprar más.
 *
 * Va en su propio archivo y no en user.ts porque user.ts arrastra funciones que
 * devuelven contactos y campañas; un modal que solo necesita el saldo no
 * debería tirar de todo ese árbol.
 */

export interface MisCreditos {
  /** Créditos que todavía se pueden comprometer (sin las reservas). */
  disponible: number;
  /** Total cargado alguna vez en la cuenta. */
  asignados: number;
  /** Ya gastados en mensajes efectivamente enviados. */
  usados: number;
  /** Apartados para campañas programadas o en curso. */
  reservados: number;
  /** true si la cuenta tiene cupo administrado (empresa o cobro activo). */
  aplica: boolean;
  /** true si la persona pertenece a una empresa: no compra, le asignan. */
  tieneEmpresa: boolean;
  /** true si además tiene permiso para comprar por su cuenta. */
  puedeComprar: boolean;
  precios: PreciosCreditos | null;
  errorPrecios: string | null;
}

export async function getMisCreditosAction(): Promise<MisCreditos | null> {
  const membership = await getCurrentMembership();
  if (!membership) return null;

  const supabase = await createClient();
  const { data } = await supabase.rpc("yamas_send_mi_saldo");

  const s = (data ?? {}) as {
    aplica?: boolean;
    saldo?: number;
    asignados?: number;
    usados?: number;
    reservados?: number;
  };

  // Los precios se piden igual aunque la persona no pueda comprar: una cuenta
  // de empleado sin permiso de compra igual muestra cuánto vale un crédito
  // cuando le pide más a su empresa.
  const precios = await getPreciosCreditos();

  return {
    disponible: s.saldo ?? 0,
    asignados: s.asignados ?? 0,
    usados: s.usados ?? 0,
    reservados: s.reservados ?? 0,
    aplica: Boolean(s.aplica),
    tieneEmpresa: Boolean(membership.orgId),
    puedeComprar:
      membership.rol !== "empresa" &&
      membership.estado === "activo" &&
      membership.permisos.comprar_creditos,
    precios: precios.precios,
    errorPrecios: precios.error,
  };
}

export interface IniciarCompraResult {
  ok: boolean;
  error: string | null;
  /** URL de Mercado Pago a la que redirigir al comprador. */
  initPoint: string | null;
}

/**
 * Arranca la compra de un pack de créditos: crea la orden con el precio
 * congelado y, sobre esa orden, la preferencia de pago de Mercado Pago.
 *
 * El pack se identifica por código, nunca por precio: el precio nunca viaja
 * desde el cliente en ningún punto de este flujo, se calcula íntegramente en
 * la RPC yamas_send_crear_orden_compra a partir de la configuración y la
 * cotización guardadas en el servidor.
 */
export async function iniciarCompraCreditosAction(
  packCodigo: string,
): Promise<IniciarCompraResult> {
  const membership = await getCurrentMembership();
  if (!membership) {
    return { ok: false, error: "No hay sesión activa.", initPoint: null };
  }

  if (membership.rol === "empresa" || !membership.permisos.comprar_creditos) {
    return {
      ok: false,
      error: "Tu cuenta no tiene permiso para comprar créditos.",
      initPoint: null,
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("yamas_send_crear_orden_compra", {
    p_pack_codigo: packCodigo,
  });

  if (error || !data) {
    return {
      ok: false,
      error: "No pudimos iniciar la compra. Probá de nuevo en unos segundos.",
      initPoint: null,
    };
  }

  const r = data as {
    ok?: boolean;
    error?: string;
    orden_id?: string;
    creditos?: number;
    monto_ars?: number;
    pack_nombre?: string;
  };

  if (!r.ok || !r.orden_id) {
    const MENSAJES: Record<string, string> = {
      sin_sesion: "No hay sesión activa.",
      sin_membresia: "Tu cuenta todavía no está configurada.",
      cuenta_no_activa: "Tu cuenta no está activa.",
      sin_permiso: "Tu cuenta no tiene permiso para comprar créditos.",
      pack_no_encontrado: "Ese pack ya no está disponible.",
      creditos_deshabilitados: "La compra de créditos todavía no está habilitada.",
      sin_cotizacion:
        "No pudimos calcular el precio en este momento. Probá de nuevo en unos minutos.",
    };
    return {
      ok: false,
      error: MENSAJES[r.error ?? ""] ?? "No pudimos iniciar la compra.",
      initPoint: null,
    };
  }

  const preferencia = await crearPreferenciaPago({
    ordenId: r.orden_id,
    packNombre: r.pack_nombre ?? "Créditos",
    creditos: r.creditos ?? 0,
    montoArs: r.monto_ars ?? 0,
  });

  if (!preferencia.ok) {
    return { ok: false, error: preferencia.error, initPoint: null };
  }

  return { ok: true, error: null, initPoint: preferencia.initPoint };
}
