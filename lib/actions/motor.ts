"use server";

import { createClient } from "@/lib/supabase/server";

/**
 * Puente mínimo autenticado entre el frontend de YamaSend y el Motor V1.
 *
 * Motor V1 (schema `motor.*` en Supabase) es un pipeline de decisión
 * comercial (WHO/WHAT/WHEN/Plan/Draft/Execution) que hoy vive aislado en la
 * base de datos: ningún flujo de producción lo invoca todavía. Este archivo
 * NO integra Motor V1 al frontend — solo habilita el primer paso humano que
 * el propio contrato SQL exige antes de poder reservar créditos para una
 * ejecución de Motor V1: "congelar" quién autoriza el gasto.
 *
 * `motor_congelar_actor_economico` requiere `auth.uid()` real (no acepta
 * service_role como sustituto de una persona), así que esta acción usa el
 * mismo cliente Supabase autenticado por cookies que el resto de
 * lib/actions/*.ts — nunca lib/supabase/admin.ts.
 *
 * Deliberadamente NO reserva créditos, NO crea jobs, NO llama al webhook de
 * envío ni a sendCampaignAction: termina apenas el binding queda confirmado.
 */

export interface ConfirmarEjecucionMotorResult {
  ok: boolean;
  /** Uno de los `estado` reales que devuelve motor_congelar_actor_economico: "CONGELADO" | "YA_CONGELADO". null si ok=false. */
  estado: string | null;
  error: string | null;
}

/**
 * Ejecuta la autorización económica humana de un execution_intent de Motor
 * V1 ya en estado READY. Debe llamarse con la sesión real de un empleado
 * activo del tenant dueño del intent.
 *
 * No interpreta ni normaliza los códigos de la RPC más allá de mapearlos a
 * mensajes legibles: los estados devueltos (`sin_sesion`,
 * `intent_no_encontrado`, `intent_no_ready`, `sin_membresia_activa_en_el_tenant`,
 * `CONGELADO`, `YA_CONGELADO`) son exactamente los que define
 * motor_congelar_actor_economico en la base.
 */
export async function confirmarEjecucionMotorAction(
  executionIntentId: string,
): Promise<ConfirmarEjecucionMotorResult> {
  if (!executionIntentId || typeof executionIntentId !== "string") {
    return { ok: false, estado: null, error: "Falta el ID del execution intent." };
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, estado: null, error: "No hay sesión activa." };
  }

  const { data, error } = await supabase.rpc("motor_congelar_actor_economico", {
    p_execution_intent_id: executionIntentId,
  });

  if (error) {
    return {
      ok: false,
      estado: null,
      error: "No se pudo confirmar la autorización económica. Probá de nuevo en unos segundos.",
    };
  }

  const r = data as {
    ok?: boolean;
    estado?: string;
    error?: string;
  } | null;

  if (!r || typeof r.ok !== "boolean") {
    return {
      ok: false,
      estado: null,
      error: "Respuesta inesperada del servidor al confirmar la autorización económica.",
    };
  }

  if (r.ok) {
    // CONGELADO (recién creado) y YA_CONGELADO (idempotente) son ambos éxito.
    return { ok: true, estado: r.estado ?? null, error: null };
  }

  const MENSAJES: Record<string, string> = {
    sin_sesion: "No hay sesión activa.",
    intent_no_encontrado: "No encontramos esa ejecución de Motor V1.",
    intent_no_ready: "Esta ejecución todavía no está lista para autorizar el gasto.",
    sin_membresia_activa_en_el_tenant:
      "Tu cuenta no tiene una membresía activa como empleado en este tenant.",
  };

  return {
    ok: false,
    estado: null,
    error:
      MENSAJES[r.error ?? ""] ??
      "No se pudo confirmar la autorización económica.",
  };
}
