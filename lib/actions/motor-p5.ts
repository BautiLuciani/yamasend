"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient, hayServiceRole } from "@/lib/supabase/admin";
import { getCurrentMembership } from "@/lib/auth/permisos";
import {
  confirmarEjecucionMotorAction,
  type ConfirmarEjecucionMotorResult,
} from "@/lib/actions/motor";

/**
 * PRODUCT-P5-D.4 — Página temporal de autorización humana real para el
 * primer envío controlado de Motor V1 vía YCloud.
 *
 * TEMPORAL. Fixture único, hardcodeado, sin ningún parámetro aceptado desde
 * el cliente:
 *
 *   tenant   = 5491137821111
 *   draft    = TEST_P5_REAL_SEND (id fijo, aprobado fuera de este archivo)
 *   canal    = 816bbea7-5d00-4d85-a658-ac60377277b8 (provider=ycloud)
 *   template = primera_prueba
 *
 * Nada de esto es parametrizable desde el navegador: ni el draft, ni el
 * canal, ni el tenant, ni el executionIntentId. El único guard de identidad
 * es getCurrentMembership() (el mismo canónico que usa el resto de la app):
 * auth.uid() real vía cookies + membresía activa como empleado del tenant
 * 5491137821111. Nada de JWT fabricado, nada de SET LOCAL, nada de
 * service_role como actor humano — motor_congelar_actor_economico sigue
 * resolviendo auth.uid() por sí misma, exactamente igual que siempre.
 *
 * Esta página NO activa/desactiva providers_permitidos.ycloud ni
 * motor.canales.activo: eso sigue siendo una operación controlada aparte
 * (fuera de este archivo, fuera del deploy). Si los flags están OFF,
 * prepararIntentP5Action simplemente falla con el mismo GATE_BLOCKED que
 * cualquier otro llamador — no hay ningún atajo acá.
 *
 * Reutiliza confirmarEjecucionMotorAction (lib/actions/motor.ts) SIN
 * modificarla: mismo contrato, mismo binding + reserva de crédito que ya
 * hace para el resto de la app. Esta página no cambia ese comportamiento,
 * solo lo invoca sobre el intent P5 ya resuelto server-side.
 */

const TENANT_P5 = "5491137821111";
const DRAFT_ID_P5 = "cc3ab5b9-f2c6-4a75-9caf-6ac7a6978652";
const CANAL_ID_P5 = "816bbea7-5d00-4d85-a658-ac60377277b8";
const PROVIDER_P5 = "ycloud";
const TEMPLATE_ESPERADO = "primera_prueba";
const RECIPIENT_MASKED = "******5307";

function accesoAutorizado(membership: { tenantId: string | null; estado: string; rol: string } | null): boolean {
  return Boolean(
    membership &&
      membership.tenantId === TENANT_P5 &&
      membership.estado === "activo" &&
      membership.rol === "empleado",
  );
}

export interface EstadoFixtureP5 {
  ok: boolean;
  error: string | null;
  draftEstado: string | null;
  intentId: string | null;
  intentEstado: string | null;
  bindingExiste: boolean;
  reservaExiste: boolean;
  reservaEstado: string | null;
  jobId: string | null;
  jobEstado: string | null;
  dispatchExiste: boolean;
  dispatchEstado: string | null;
  recipientMasked: string;
  template: string;
  provider: string;
  costoMaximoCreditos: number;
}

/**
 * Lectura pura, sin ningún side effect. Segura para llamar en render/GET y
 * para refrescar después de cada acción.
 *
 * El schema `motor` no está expuesto a PostgREST (mismo hallazgo ya
 * documentado en lib/actions/motor.ts): todo el estado se lee a través de
 * la RPC public.motor_p5_estado_fixture(), que además revalida membership
 * server-side por su cuenta (defensa en profundidad, no solo esta capa TS)
 * y resuelve tenant/draft/canal/provider fijos internamente — cero
 * parámetros aceptados.
 */
export async function leerEstadoFixtureP5Action(): Promise<EstadoFixtureP5> {
  const vacio: Omit<EstadoFixtureP5, "ok" | "error"> = {
    draftEstado: null,
    intentId: null,
    intentEstado: null,
    bindingExiste: false,
    reservaExiste: false,
    reservaEstado: null,
    jobId: null,
    jobEstado: null,
    dispatchExiste: false,
    dispatchEstado: null,
    recipientMasked: RECIPIENT_MASKED,
    template: TEMPLATE_ESPERADO,
    provider: PROVIDER_P5,
    costoMaximoCreditos: 1,
  };

  const membership = await getCurrentMembership();
  if (!accesoAutorizado(membership)) {
    return { ok: false, error: "No autorizado.", ...vacio };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("motor_p5_estado_fixture");

  if (error) {
    return { ok: false, error: "No se pudo leer el estado del fixture P5.", ...vacio };
  }

  const r = data as {
    ok?: boolean;
    error?: string;
    draft_estado?: string;
    intent_id?: string;
    intent_estado?: string;
    binding_existe?: boolean;
    reserva_existe?: boolean;
    reserva_estado?: string;
    job_id?: string;
    job_estado?: string;
    dispatch_existe?: boolean;
    dispatch_estado?: string;
  } | null;

  if (!r?.ok) {
    return { ok: false, error: r?.error ?? "Respuesta inesperada.", ...vacio };
  }

  return {
    ok: true,
    error: null,
    ...vacio,
    draftEstado: r.draft_estado ?? null,
    intentId: r.intent_id ?? null,
    intentEstado: r.intent_estado ?? null,
    bindingExiste: r.binding_existe ?? false,
    reservaExiste: r.reserva_existe ?? false,
    reservaEstado: r.reserva_estado ?? null,
    jobId: r.job_id ?? null,
    jobEstado: r.job_estado ?? null,
    dispatchExiste: r.dispatch_existe ?? false,
    dispatchEstado: r.dispatch_estado ?? null,
  };
}

export interface PrepararIntentP5Result {
  ok: boolean;
  intentId: string | null;
  estado: string | null;
  gate: Record<string, unknown> | null;
  error: string | null;
}

/**
 * Acción separada y explícita: crea el execution_intent del fixture P5,
 * exclusivamente con canal/provider/draft/tenant fijos. Nunca corre en
 * render. Si el intent ya existe (llamada repetida), lo reutiliza sin
 * crear un segundo. Falla cerrado si providers_permitidos.ycloud o
 * motor.canales.activo están OFF — esta acción no los toca ni los rodea.
 */
export async function prepararIntentP5Action(): Promise<PrepararIntentP5Result> {
  const membership = await getCurrentMembership();
  if (!accesoAutorizado(membership)) {
    return { ok: false, intentId: null, estado: null, gate: null, error: "No autorizado." };
  }

  if (!hayServiceRole()) {
    return {
      ok: false,
      intentId: null,
      estado: null,
      gate: null,
      error: "No se pudo preparar el intent por un problema de configuración del servidor.",
    };
  }

  // Reutilizar si ya existe, nunca duplicar. Misma RPC que la lectura de
  // estado, ya revalida membership por su cuenta.
  const existente = await leerEstadoFixtureP5Action();
  if (!existente.ok) {
    return { ok: false, intentId: null, estado: null, gate: null, error: existente.error };
  }
  if (existente.intentId) {
    return { ok: true, intentId: existente.intentId, estado: existente.intentEstado, gate: null, error: null };
  }
  if (existente.draftEstado !== "APROBADO_PARA_EJECUCION") {
    return {
      ok: false,
      intentId: null,
      estado: null,
      gate: null,
      error: `El draft del fixture P5 no está en condiciones (${existente.draftEstado ?? "no encontrado"}).`,
    };
  }

  const admin = createAdminClient();

  const { data: preview, error: previewError } = await admin.rpc("motor_preview_draft", {
    p_tenant: TENANT_P5,
    p_draft_id: DRAFT_ID_P5,
  });

  const version = (preview as { version?: number } | null)?.version;

  if (previewError || typeof version !== "number") {
    return {
      ok: false,
      intentId: null,
      estado: null,
      gate: null,
      error: "No se pudo leer la versión del draft del fixture P5.",
    };
  }

  const { data: intentData, error: intentError } = await admin.rpc("motor_crear_execution_intent", {
    p_tenant: TENANT_P5,
    p_draft_id: DRAFT_ID_P5,
    p_version: version,
    p_canal_id: CANAL_ID_P5,
    p_provider: PROVIDER_P5,
    p_actor: `p5_fixture:${membership!.miembroId}`,
    p_ref_ts: new Date().toISOString(),
    p_proposito: "campana",
  });

  if (intentError) {
    return {
      ok: false,
      intentId: null,
      estado: null,
      gate: null,
      error: "No se pudo crear el intent. Puede ser que providers_permitidos.ycloud o el canal sigan deshabilitados.",
    };
  }

  const intent = intentData as { estado?: string; execution_id?: string; gate?: Record<string, unknown> } | null;

  if (!intent?.execution_id) {
    return {
      ok: false,
      intentId: null,
      estado: intent?.estado ?? null,
      gate: intent?.gate ?? null,
      error: `Estado inesperado del servidor al crear el intent (${intent?.estado ?? "sin respuesta"}).`,
    };
  }

  // INTENT_EXISTENTE: motor_crear_execution_intent encontró un intent
  // vigente (no CANCELLED/GATE_BLOCKED) con la misma clave de idempotencia
  // — normalmente ya detectado antes por leerEstadoFixtureP5Action, pero
  // posible también si otra llamada concurrente lo creó justo antes. No es
  // un bloqueo: es éxito reutilizando lo que ya existe.
  if (intent.estado === "INTENT_EXISTENTE") {
    return { ok: true, intentId: intent.execution_id, estado: "INTENT_EXISTENTE", gate: null, error: null };
  }

  if (intent.estado === "READY") {
    return { ok: true, intentId: intent.execution_id, estado: "READY", gate: intent.gate ?? null, error: null };
  }

  if (intent.estado === "GATE_BLOCKED") {
    return {
      ok: false,
      intentId: intent.execution_id,
      estado: "GATE_BLOCKED",
      gate: intent.gate ?? null,
      error: "El intent quedó bloqueado por el gate de seguridad.",
    };
  }

  return {
    ok: false,
    intentId: intent.execution_id,
    estado: intent.estado ?? null,
    gate: intent.gate ?? null,
    error: `Estado inesperado del intent (${intent.estado ?? "desconocido"}).`,
  };
}

/**
 * Autoriza económicamente el fixture P5. Resuelve el executionIntentId
 * SERVER-SIDE (nunca del cliente) y reutiliza confirmarEjecucionMotorAction
 * sin modificarla: mismo binding real vía auth.uid(), misma reserva.
 */
export async function autorizarEjecucionP5Action(): Promise<
  ConfirmarEjecucionMotorResult | { ok: false; bindingEstado: null; reservaEstado: null; jobId: null; error: string }
> {
  const membership = await getCurrentMembership();
  if (!accesoAutorizado(membership)) {
    return { ok: false, bindingEstado: null, reservaEstado: null, jobId: null, error: "No autorizado." };
  }

  const estado = await leerEstadoFixtureP5Action();
  if (!estado.ok || !estado.intentId) {
    return {
      ok: false,
      bindingEstado: null,
      reservaEstado: null,
      jobId: null,
      error: "El intent del fixture P5 todavía no está preparado.",
    };
  }

  return confirmarEjecucionMotorAction(estado.intentId);
}
