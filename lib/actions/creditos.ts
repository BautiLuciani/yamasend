"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentMembership } from "@/lib/auth/permisos";
import { getPreciosCreditos, type PreciosCreditos } from "@/lib/creditos/precio";

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
