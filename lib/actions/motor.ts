"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient, hayServiceRole } from "@/lib/supabase/admin";

/**
 * Puente mínimo autenticado entre el frontend de YamaSend y el Motor V1.
 *
 * Motor V1 (schema `motor.*` en Supabase) es un pipeline de decisión
 * comercial (WHO/WHAT/WHEN/Plan/Draft/Execution) que hoy vive aislado en la
 * base de datos: ningún flujo de producción lo invoca todavía. Este archivo
 * NO integra Motor V1 al frontend — solo habilita el primer paso humano que
 * el propio contrato SQL exige antes de poder reservar créditos para una
 * ejecución de Motor V1 ("congelar" quién autoriza el gasto), y completa
 * automáticamente la reserva de créditos que se deriva de esa autorización.
 *
 * PRODUCT-P1 / P1B — frontera humano/infraestructura, verificada contra los
 * grants reales de Postgres:
 *
 *   1. motor_congelar_actor_economico requiere auth.uid() real (no acepta
 *      service_role como sustituto de una persona). Sigue usando el mismo
 *      cliente Supabase autenticado por cookies que el resto de
 *      lib/actions/*.ts. Esta parte NO cambió en P1B.
 *
 *   2. motor.reservar_creditos_intent vive en el schema `motor`, que no está
 *      expuesto a la API REST de PostgREST (verificado en P1: ninguna otra
 *      función de `motor.*` es alcanzable por HTTP salvo a través de un
 *      wrapper en `public` — exactamente el patrón de
 *      motor_extractor_reclamar/persistir/marcar_error). Por eso este
 *      segundo paso llama a public.motor_reservar_creditos_intent (wrapper
 *      P1B, EXECUTE solo para service_role, SECURITY INVOKER — no escala
 *      ningún privilegio) con createAdminClient(). El binding es la única
 *      fuente de identidad económica; ni el wrapper ni la función interna
 *      aceptan ni usan ningún parámetro de actor humano.
 *
 * Sigue sin crear jobs de ejecución más allá de lo que la propia reserva
 * crea (el job 'dispatch' en PENDIENTE), sin llamar claim/procesar, sin
 * tocar el webhook de envío legacy ni sendCampaignAction, y sin habilitar
 * ningún provider real.
 *
 * IDEMPOTENCIA REAL (hallazgo de P1, corregido en P1B): tanto
 * motor_congelar_actor_economico como motor.reservar_creditos_intent
 * exigen `estado='READY'` ANTES de llegar a su propio chequeo de
 * idempotencia (YA_CONGELADO / RESERVA_EXISTENTE). Una vez que la reserva
 * tuvo éxito y el intent pasó a CREDITS_RESERVED, un reintento ya NO ve
 * YA_CONGELADO/RESERVA_EXISTENTE: ve `intent_no_ready` / `INTENT_NO_READY`.
 * Por eso este archivo (el "caller productivo", no las funciones SQL
 * certificadas) reconoce ese caso leyendo la evidencia persistida que
 * devuelve el wrapper (estado del intent + existencia y estado de la
 * reserva + job asociado) y solo entonces lo trata como éxito idempotente.
 * Si la evidencia es incoherente, falla cerrado — nunca asume éxito por la
 * sola presencia de CREDITS_RESERVED.
 */

export interface ConfirmarEjecucionMotorResult {
  ok: boolean;
  /**
   * Estado real de motor_congelar_actor_economico: "CONGELADO" | "YA_CONGELADO".
   * null si el binding falló, o si no se pudo determinar porque el intent ya
   * había avanzado más allá de READY (ver reservaEstado en ese caso).
   */
  bindingEstado: string | null;
  /**
   * Estado real de la reserva. Para provider='fake': motor.reservar_creditos_intent
   * ("RESERVADA" | "RESERVA_EXISTENTE" | "RESERVA_RECHAZADA" |
   * "GATE_BLOCKED_EN_DISPATCH" | "APPROVAL_2_CAMBIO_DESDE_EL_INTENT" |
   * "COSTO_CAMBIO_DESDE_LA_APROBACION" | "INTENT_NO_READY"). Para
   * provider='ycloud': motor.reservar_y_preparar_dispatches_intent
   * ("RESERVADA_Y_DESPACHADA" | "RESERVA_EXISTENTE" | ...). O el literal
   * sintetizado por este archivo "RESERVA_YA_CONFIRMADA" cuando se reconoce
   * éxito idempotente a partir de evidencia persistida en vez de la
   * respuesta directa de la RPC. null si nunca se llegó a intentar la
   * reserva.
   */
  reservaEstado: string | null;
  /** id del motor.execution_jobs asociado, cuando la reserva es o ya era exitosa. */
  jobId: string | null;
  /**
   * PRODUCT-P6.1 — cantidad de execution_dispatches creados atómicamente.
   * Solo poblado para provider='ycloud' (camino atómico); null para
   * provider='fake' (el camino P2 no crea dispatches en esta llamada).
   */
  dispatchCount: number | null;
  error: string | null;
}

const MENSAJES_BINDING: Record<string, string> = {
  sin_sesion: "No hay sesión activa.",
  intent_no_encontrado: "No encontramos esa ejecución de Motor V1.",
  sin_membresia_activa_en_el_tenant:
    "Tu cuenta no tiene una membresía activa como empleado en este tenant.",
};

const MENSAJES_RESERVA: Record<string, string> = {
  INTENT_NO_ENCONTRADO: "No encontramos esa ejecución de Motor V1 al reservar los créditos.",
  SIN_ACTOR_ECONOMICO_CONGELADO:
    "No se encontró la autorización económica recién confirmada. Probá de nuevo.",
  BINDING_INCOHERENTE_CON_INTENT:
    "La autorización económica no coincide con esta ejecución. Contactá a soporte.",
  GATE_BLOCKED_EN_DISPATCH:
    "Algo cambió en la campaña desde que se armó esta ejecución (contactos, oferta o canal). Hay que revisarla de nuevo antes de reservar créditos.",
  APPROVAL_2_CAMBIO_DESDE_EL_INTENT:
    "La aprobación del envío cambió desde que se creó esta ejecución. Hay que volver a aprobarla.",
  COSTO_CAMBIO_DESDE_LA_APROBACION:
    "El costo cambió desde que se aprobó el envío. Hay que revisar la campaña antes de reservar créditos.",
  RESERVA_RECHAZADA: "No alcanzan los créditos disponibles para esta ejecución.",
  INTENT_NO_READY:
    "Esta ejecución ya no está en un estado que permita reservar créditos.",
  // Estados propios de motor_reservar_y_preparar_dispatches_intent que no
  // ya cubre el mapa de arriba (los nombres de estado coinciden 1:1 para
  // el resto: INTENT_NO_ENCONTRADO, SIN_ACTOR_ECONOMICO_CONGELADO,
  // BINDING_INCOHERENTE_CON_INTENT, GATE_BLOCKED_EN_DISPATCH,
  // APPROVAL_2_CAMBIO_DESDE_EL_INTENT, COSTO_CAMBIO_DESDE_LA_APROBACION,
  // INTENT_NO_READY).
  SIN_DESTINATARIOS: "Esta ejecución no tiene ningún destinatario incluido.",
  CREDITOS_NO_COINCIDEN_CON_DESTINATARIOS:
    "La cantidad de créditos ya no coincide con los destinatarios de esta ejecución. Contactá a soporte.",
};


/** Estados del intent en los que, si la evidencia coincide, ya hay una reserva viva. */
const ESTADOS_INTENT_CON_RESERVA_POSIBLE = new Set([
  "CREDITS_RESERVED",
  "DISPATCHING",
  "COMPLETED",
  "PARTIAL",
]);

interface EvidenciaPersistida {
  intent_estado?: string | null;
  binding_existe?: boolean;
  reserva_existe?: boolean;
  reserva_estado?: string | null;
  job_id?: string | null;
}

/**
 * Reconoce, a partir de evidencia persistida (nunca de una comprobación
 * client-side ni de una fuente de verdad paralela), si esta ejecución ya
 * tiene una reserva de créditos coherente y viva. Falla cerrado ante
 * cualquier combinación que no sea inequívoca.
 */
function esReservaYaConfirmada(ev: EvidenciaPersistida | undefined): ev is Required<EvidenciaPersistida> {
  return Boolean(
    ev &&
      ev.intent_estado &&
      ESTADOS_INTENT_CON_RESERVA_POSIBLE.has(ev.intent_estado) &&
      ev.binding_existe === true &&
      ev.reserva_existe === true &&
      ev.reserva_estado === "RESERVADA" &&
      typeof ev.job_id === "string" &&
      ev.job_id.length > 0,
  );
}

/**
 * PRODUCT-P6.1 — resuelve, server-side y tenant-scoped, el provider real de
 * un execution_intent ya creado. Nunca acepta el provider del cliente: es
 * la única fuente de verdad para decidir qué primitiva de reserva usar
 * (routing policy A — ver comentario de confirmarEjecucionMotorAction).
 * Usa la misma RPC ya certificada que obtenerEstadoEjecucionMotorAction.
 */
async function resolverProviderYEstadoDelIntent(
  tenantId: string,
  executionIntentId: string,
): Promise<{ provider: string | null; intentEstado: string | null; jobEstado: string | null } | null> {
  if (!hayServiceRole()) return null;
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("motor_estado_execution_intent", {
    p_tenant: tenantId,
    p_execution_intent_id: executionIntentId,
  });
  if (error || !data) return null;
  const d = data as { provider?: string; intent_estado?: string; job_estado?: string };
  return {
    provider: d.provider ?? null,
    intentEstado: d.intent_estado ?? null,
    jobEstado: d.job_estado ?? null,
  };
}

/**
 * PRODUCT-P6.1 — camino atómico para provider='ycloud'. Llama al wrapper
 * public.motor_reservar_y_preparar_dispatches_intent (service_role), que en
 * una sola transacción SQL reserva créditos + crea el job (ya CLAIMED,
 * nunca PENDIENTE) + crea los execution_dispatches — elimina
 * estructuralmente la ventana de carrera con el claim genérico de P2 (ver
 * PRODUCT-P5-D.9). Misma interpretación de éxito/idempotencia/rechazo que
 * intentarReserva, adaptada al contrato de esta RPC.
 */
async function intentarReservaAtomica(
  executionIntentId: string,
  tenantId: string,
): Promise<{
  ok: boolean;
  reservaEstado: string | null;
  jobId: string | null;
  dispatchCount: number | null;
  error: string | null;
}> {
  if (!hayServiceRole()) {
    return {
      ok: false,
      reservaEstado: null,
      jobId: null,
      dispatchCount: null,
      error:
        "No se pudo completar la reserva y preparación por un problema de configuración del servidor. Podés reintentarla en unos minutos.",
    };
  }

  const admin = createAdminClient();

  const { data, error } = await admin.rpc("motor_reservar_y_preparar_dispatches_intent", {
    p_execution_intent_id: executionIntentId,
  });

  if (error) {
    console.error("[motor atomic reserve] RPC failed", {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
      executionIntentId,
    });
    return {
      ok: false,
      reservaEstado: null,
      jobId: null,
      dispatchCount: null,
      error: "No se pudo preparar la reserva y el dispatch. No vuelvas a intentar hasta verificar el estado.",
    };
  }

  const rr = data as {
    ok?: boolean;
    estado?: string;
    job_id?: string;
    dispatch_count?: number;
  } | null;

  if (!rr || typeof rr.ok !== "boolean") {
    return {
      ok: false,
      reservaEstado: null,
      jobId: null,
      dispatchCount: null,
      error: "Respuesta inesperada del servidor al preparar la reserva y el dispatch.",
    };
  }

  if (rr.ok) {
    // RESERVADA_Y_DESPACHADA (recién creada) y RESERVA_EXISTENTE
    // (idempotente, ventana mientras el intent seguía READY) son éxito.
    return {
      ok: true,
      reservaEstado: rr.estado ?? null,
      jobId: rr.job_id ?? null,
      dispatchCount: rr.dispatch_count ?? null,
      error: null,
    };
  }

  // rr.ok === false. Igual que en el camino fake: si el intent ya avanzó
  // (INTENT_NO_READY), verificar evidencia persistida antes de rechazar —
  // puede ser un reintento legítimo sobre una preparación atómica ya
  // exitosa. Único estado que la deja completa en este camino: DISPATCHING
  // (o terminal posterior) con un job asociado.
  const evidencia = await resolverProviderYEstadoDelIntent(tenantId, executionIntentId);
  const yaPreparado =
    evidencia?.intentEstado != null &&
    ["DISPATCHING", "COMPLETED", "PARTIAL", "FAILED"].includes(evidencia.intentEstado) &&
    typeof evidencia.jobEstado === "string" &&
    evidencia.jobEstado.length > 0;

  if (yaPreparado) {
    return {
      ok: true,
      reservaEstado: "RESERVA_YA_CONFIRMADA",
      jobId: null,
      dispatchCount: null,
      error: null,
    };
  }

  return {
    ok: false,
    reservaEstado: rr.estado ?? null,
    jobId: null,
    dispatchCount: null,
    error: MENSAJES_RESERVA[rr.estado ?? ""] ?? "No se pudo preparar la reserva y el dispatch de esta ejecución.",
  };
}


/**
 * Llama al wrapper public.motor_reservar_creditos_intent (service_role) y
 * devuelve, ya interpretado, si hay que tratarlo como éxito (fresco,
 * idempotente-directo, o idempotente-por-evidencia), rechazo de negocio, o
 * error de infraestructura.
 */
async function intentarReserva(
  executionIntentId: string,
): Promise<{
  ok: boolean;
  reservaEstado: string | null;
  jobId: string | null;
  error: string | null;
}> {
  if (!hayServiceRole()) {
    return {
      ok: false,
      reservaEstado: null,
      jobId: null,
      error:
        "No se pudo completar la reserva de créditos por un problema de configuración del servidor. Podés reintentarla en unos minutos.",
    };
  }

  const admin = createAdminClient();

  const { data, error } = await admin.rpc("motor_reservar_creditos_intent", {
    p_execution_intent_id: executionIntentId,
  });

  if (error) {
    return {
      ok: false,
      reservaEstado: null,
      jobId: null,
      error: "Hubo un error al reservar los créditos. Podés reintentar en unos segundos.",
    };
  }

  const wrapped = data as {
    reserva?: { ok?: boolean; estado?: string; job_id?: string };
    evidencia?: EvidenciaPersistida;
  } | null;

  const rr = wrapped?.reserva;

  if (!rr || typeof rr.ok !== "boolean") {
    return {
      ok: false,
      reservaEstado: null,
      jobId: null,
      error: "Respuesta inesperada del servidor al reservar los créditos.",
    };
  }

  if (rr.ok) {
    // RESERVADA (recién creada) y RESERVA_EXISTENTE (idempotente, ventana de
    // carrera mientras el intent seguía READY) son ambos éxito directo.
    return {
      ok: true,
      reservaEstado: rr.estado ?? null,
      jobId: rr.job_id ?? null,
      error: null,
    };
  }

  // rr.ok === false. Antes de tratarlo como rechazo, verificar si la
  // evidencia persistida muestra que esta ejecución YA tiene una reserva
  // viva y coherente (el caso real de reintento post-éxito: el intent ya
  // avanzó de READY, así que la RPC certificada devuelve *_NO_READY en vez
  // de RESERVA_EXISTENTE — ver comentario de archivo).
  if (esReservaYaConfirmada(wrapped?.evidencia)) {
    return {
      ok: true,
      reservaEstado: "RESERVA_YA_CONFIRMADA",
      jobId: wrapped!.evidencia!.job_id ?? null,
      error: null,
    };
  }

  return {
    ok: false,
    reservaEstado: rr.estado ?? null,
    jobId: null,
    error: MENSAJES_RESERVA[rr.estado ?? ""] ?? "No se pudo reservar los créditos de esta ejecución.",
  };
}

/**
 * Ejecuta, en una sola interacción, la autorización económica humana de un
 * execution_intent de Motor V1 ya en estado READY y la reserva de créditos
 * que se desprende de ella. Debe llamarse con la sesión real de un empleado
 * activo del tenant dueño del intent.
 *
 * Si el binding falla por un motivo que no tiene relación con haber avanzado
 * de READY (sin sesión, intent inexistente, sin membresía activa), no se
 * intenta la reserva. Si falla específicamente con `intent_no_ready`, igual
 * se intenta la reserva: puede ser un reintento legítimo sobre una ejecución
 * que ya se reservó antes, y la evidencia persistida lo termina de confirmar
 * o lo rechaza (ver esReservaYaConfirmada).
 */
export async function confirmarEjecucionMotorAction(
  executionIntentId: string,
): Promise<ConfirmarEjecucionMotorResult> {
  if (!executionIntentId || typeof executionIntentId !== "string") {
    return {
      ok: false,
      bindingEstado: null,
      reservaEstado: null,
      jobId: null,
      dispatchCount: null,
      error: "Falta el ID del execution intent.",
    };
  }

  // Paso 1 — HUMANO. Cliente autenticado por cookies, sin service_role.
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      ok: false,
      bindingEstado: null,
      reservaEstado: null,
      jobId: null,
      dispatchCount: null,
      error: "No hay sesión activa.",
    };
  }

  const { data, error } = await supabase.rpc("motor_congelar_actor_economico", {
    p_execution_intent_id: executionIntentId,
  });

  if (error) {
    return {
      ok: false,
      bindingEstado: null,
      reservaEstado: null,
      jobId: null,
      dispatchCount: null,
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
      bindingEstado: null,
      reservaEstado: null,
      jobId: null,
      dispatchCount: null,
      error: "Respuesta inesperada del servidor al confirmar la autorización económica.",
    };
  }

  let bindingEstado: string | null = null;

  if (!r.ok) {
    if (r.error !== "intent_no_ready") {
      // Falla dura de binding, sin relación con un reintento post-reserva:
      // no tiene sentido intentar la reserva.
      return {
        ok: false,
        bindingEstado: null,
        reservaEstado: null,
        jobId: null,
        dispatchCount: null,
        error: MENSAJES_BINDING[r.error ?? ""] ?? "No se pudo confirmar la autorización económica.",
      };
    }
    // intent_no_ready: puede ser un reintento sobre un intent que ya se
    // reservó. No se conoce el estado real de binding acá — lo resuelve la
    // evidencia del paso 2. bindingEstado queda null explícitamente (no se
    // inventa CONGELADO/YA_CONGELADO, que son strings reales de la RPC).
  } else {
    bindingEstado = r.estado ?? null;
  }

  // Paso 2 — INFRAESTRUCTURA (service_role, vía wrapper public P1B/P6.1).
  //
  // PRODUCT-P6.1 — routing policy A: el provider real del intent (resuelto
  // server-side, jamás del cliente) decide qué primitiva de reserva usar.
  // provider='fake' sigue exactamente el camino P2 sin cambios (job sin
  // dispatch, tal como P2 espera). provider='ycloud' usa el camino atómico
  // P4 (reserva + job ya-owned + dispatch en una sola transacción SQL — sin
  // ventana de carrera con el claim genérico de P2). Cualquier otro valor
  // de provider (o uno que no se pueda resolver) es fail-closed explícito:
  // nunca cae por defecto a ninguno de los dos caminos.
  const tenantId = await resolverTenantDelUsuario(user.id);
  if (!tenantId) {
    return {
      ok: false,
      bindingEstado,
      reservaEstado: null,
      jobId: null,
      dispatchCount: null,
      error: "Tu cuenta no tiene una membresía activa como empleado en ningún tenant.",
    };
  }

  const info = await resolverProviderYEstadoDelIntent(tenantId, executionIntentId);
  const provider = info?.provider ?? null;

  if (provider === "fake") {
    const resultado = await intentarReserva(executionIntentId);
    return {
      ok: resultado.ok,
      bindingEstado,
      reservaEstado: resultado.reservaEstado,
      jobId: resultado.jobId,
      dispatchCount: null,
      error: resultado.error,
    };
  }

  if (provider === "ycloud") {
    const resultado = await intentarReservaAtomica(executionIntentId, tenantId);
    return {
      ok: resultado.ok,
      bindingEstado,
      reservaEstado: resultado.reservaEstado,
      jobId: resultado.jobId,
      dispatchCount: resultado.dispatchCount,
      error: resultado.error,
    };
  }

  return {
    ok: false,
    bindingEstado,
    reservaEstado: null,
    jobId: null,
    dispatchCount: null,
    error: `No se pudo determinar cómo procesar esta ejecución (provider desconocido: ${provider ?? "no resuelto"}).`,
  };
}

// ---------------------------------------------------------------------
// PRODUCT-P3 — Dashboard de Recomendaciones del Motor.
//
// Flujo productivo completo, gatillado exclusivamente por clicks humanos
// explícitos (nunca por render/refresh del Dashboard):
//
//   prepararPlanMotorAction()          [HUMANO: click "Preparar plan"]
//     → public.motor_preparar_plan (reutiliza plan pendiente o genera uno)
//   aprobarPlanMotorAction(planId)     [HUMANO: Approval 1]
//     → public.motor_aprobar_plan
//     → AUTO: public.motor_materializar_plan
//   obtenerDraftPreviewMotorAction(draftId)  [lectura]
//     → public.motor_preview_draft
//   aprobarDraftMotorAction(draftId)   [HUMANO: Approval 2]
//     → public.motor_aprobar_draft
//     → AUTO: public.motor_crear_execution_intent (canal fake, resuelto
//       server-side vía motor_canales_visibles — nunca del browser)
//   confirmarEjecucionMotorAction(executionIntentId)  [HUMANO: ya existe, P1/P1B]
//   obtenerEstadoEjecucionMotorAction(executionIntentId)  [lectura]
//     → public.motor_estado_execution_intent
//
// Identidad humana: SIEMPRE derivada de auth.uid() + membresía 'empleado'
// activa dentro de este mismo archivo — nunca un p_usuario/tenant que
// venga del browser. El browser solo puede enviar IDs (planId, draftId,
// executionIntentId); cada Server Action resuelve el tenant del usuario
// autenticado y lo pasa como p_tenant a las funciones certificadas, que ya
// rechazan (con excepción o resultado vacío) cualquier ID que no pertenezca
// a ese tenant — así es como se cierra el cross-tenant sin inventar otra
// verificación.
// ---------------------------------------------------------------------

interface ContextoMotor {
  tenantId: string;
  /** auth_user_id real, nunca un string arbitrario del browser. */
  usuario: string;
}

async function resolverContextoMotor(): Promise<
  { ok: true; ctx: ContextoMotor } | { ok: false; error: string }
> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { ok: false, error: "No hay sesión activa." };

  const { data: miembro } = await supabase
    .from("yamas_send_miembros")
    .select("tenant_id")
    .eq("auth_user_id", user.id)
    .eq("rol", "empleado")
    .eq("estado", "activo")
    .maybeSingle();

  if (!miembro?.tenant_id) {
    return {
      ok: false,
      error: "Tu cuenta no tiene una membresía activa como empleado en ningún tenant.",
    };
  }

  return { ok: true, ctx: { tenantId: miembro.tenant_id, usuario: user.id } };
}

/**
 * PRODUCT-P6.1 — variante de resolverContextoMotor para callers que ya
 * tienen el auth_user_id resuelto (evita una segunda llamada a
 * auth.getUser() dentro de la misma Server Action). Mismo guard exacto:
 * rol='empleado', estado='activo'.
 */
async function resolverTenantDelUsuario(authUserId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data: miembro } = await supabase
    .from("yamas_send_miembros")
    .select("tenant_id")
    .eq("auth_user_id", authUserId)
    .eq("rol", "empleado")
    .eq("estado", "activo")
    .maybeSingle();
  return miembro?.tenant_id ?? null;
}

export interface PrepararPlanMotorResult {
  ok: boolean;
  planId: string | null;
  /** "PLAN_GENERATED" (recién creado) | "PENDING_PLAN_REUSED" (ya existía) */
  resultado: "PLAN_GENERATED" | "PENDING_PLAN_REUSED" | null;
  /**
   * Estado real del plan (uno de los 5 que motor.planes permite). La UI
   * SOLO debe ofrecer "Aprobar plan" cuando esto sea 'PLAN_GENERADO' — es
   * la única defensa correcta contra aprobar un plan sin candidatos, en
   * vez de inferirlo del lado del cliente.
   */
  planEstado: string | null;
  nEvaluados: number | null;
  nSeleccionados: number | null;
  nFuturos: number | null;
  nExcluidos: number | null;
  error: string | null;
}

/**
 * Único punto de entrada para generar/reutilizar un Plan. Se invoca
 * EXCLUSIVAMENTE por un click humano explícito ("Preparar plan") — nunca
 * desde el render del Dashboard. Serializado por tenant a nivel SQL
 * (pg_advisory_xact_lock dentro de motor_preparar_plan), así que dos clicks
 * concurrentes del mismo tenant nunca generan dos planes.
 */
export async function prepararPlanMotorAction(): Promise<PrepararPlanMotorResult> {
  const contexto = await resolverContextoMotor();
  if (!contexto.ok) {
    return {
      ok: false,
      planId: null,
      resultado: null,
      planEstado: null,
      nEvaluados: null,
      nSeleccionados: null,
      nFuturos: null,
      nExcluidos: null,
      error: contexto.error,
    };
  }

  if (!hayServiceRole()) {
    return {
      ok: false,
      planId: null,
      resultado: null,
      planEstado: null,
      nEvaluados: null,
      nSeleccionados: null,
      nFuturos: null,
      nExcluidos: null,
      error: "No se pudo preparar el plan por un problema de configuración del servidor.",
    };
  }

  const admin = createAdminClient();

  const { data, error } = await admin.rpc("motor_preparar_plan", {
    p_tenant: contexto.ctx.tenantId,
    p_ref_ts: new Date().toISOString(),
  });

  if (error) {
    return {
      ok: false,
      planId: null,
      resultado: null,
      planEstado: null,
      nEvaluados: null,
      nSeleccionados: null,
      nFuturos: null,
      nExcluidos: null,
      error: "No se pudo preparar el plan. Probá de nuevo en unos segundos.",
    };
  }

  const r = data as {
    plan_id?: string;
    creado?: boolean;
    plan_estado?: string;
    n_evaluados?: number;
    n_seleccionados?: number;
    n_futuros?: number;
    n_excluidos?: number;
  } | null;

  if (!r || typeof r.plan_id !== "string") {
    return {
      ok: false,
      planId: null,
      resultado: null,
      planEstado: null,
      nEvaluados: null,
      nSeleccionados: null,
      nFuturos: null,
      nExcluidos: null,
      error: "Respuesta inesperada del servidor al preparar el plan.",
    };
  }

  return {
    ok: true,
    planId: r.plan_id,
    resultado: r.creado ? "PLAN_GENERATED" : "PENDING_PLAN_REUSED",
    planEstado: r.plan_estado ?? null,
    nEvaluados: r.n_evaluados ?? null,
    nSeleccionados: r.n_seleccionados ?? null,
    nFuturos: r.n_futuros ?? null,
    nExcluidos: r.n_excluidos ?? null,
    error: null,
  };
}

export interface AprobarPlanMotorResult {
  ok: boolean;
  /** id del primer draft materializado, si lo hay — la UI sigue con éste. */
  draftId: string | null;
  estadoMaterializacion: string | null;
  error: string | null;
}

/**
 * Approval 1 + materialización automática. La identidad humana se deriva
 * acá mismo (auth.uid() + membresía) — nunca se acepta un p_usuario del
 * browser. Idempotente: aprobar dos veces el mismo plan no duplica nada
 * (motor.aprobar_plan tiene un índice único parcial sobre plan_approvals;
 * motor.materializar_plan devuelve YA_MATERIALIZADO si ya corrió).
 */
export async function aprobarPlanMotorAction(
  planId: string,
): Promise<AprobarPlanMotorResult> {
  if (!planId || typeof planId !== "string") {
    return { ok: false, draftId: null, estadoMaterializacion: null, error: "Falta el ID del plan." };
  }

  const contexto = await resolverContextoMotor();
  if (!contexto.ok) {
    return { ok: false, draftId: null, estadoMaterializacion: null, error: contexto.error };
  }

  if (!hayServiceRole()) {
    return {
      ok: false,
      draftId: null,
      estadoMaterializacion: null,
      error: "No se pudo aprobar el plan por un problema de configuración del servidor.",
    };
  }

  const admin = createAdminClient();

  // Approval 1. motor.aprobar_plan valida internamente que el plan
  // pertenezca al tenant (RAISE EXCEPTION si no) — acá eso llega como
  // `error`, y lo tratamos como "no encontrado", nunca como autorización
  // implícita de otro tenant.
  const { error: errorAprobar } = await admin.rpc("motor_aprobar_plan", {
    p_tenant: contexto.ctx.tenantId,
    p_plan_id: planId,
    p_usuario: contexto.ctx.usuario,
  });

  if (errorAprobar) {
    return {
      ok: false,
      draftId: null,
      estadoMaterializacion: null,
      error: "No encontramos ese plan para tu cuenta.",
    };
  }

  // AUTO: materializar. Idempotente por diseño (YA_MATERIALIZADO si ya corrió).
  const { data: dataMaterializar, error: errorMaterializar } = await admin.rpc(
    "motor_materializar_plan",
    { p_tenant: contexto.ctx.tenantId, p_plan_id: planId, p_usuario: contexto.ctx.usuario },
  );

  if (errorMaterializar) {
    return {
      ok: false,
      draftId: null,
      estadoMaterializacion: null,
      error: "El plan se aprobó, pero no se pudo materializar. Podés reintentar en unos segundos.",
    };
  }

  const m = dataMaterializar as {
    estado?: string;
    drafts?: Array<{ draft_id?: string; estado?: string }>;
  } | null;

  const primerDraft = m?.drafts?.[0];

  if (!primerDraft?.draft_id) {
    return {
      ok: true,
      draftId: null,
      estadoMaterializacion: m?.estado ?? null,
      error:
        m?.estado === "PLAN_NO_MATERIALIZABLE" || m?.estado === "SIN_SELECCIONADOS"
          ? "El plan quedó aprobado, pero no generó ningún draft (sin candidatos seleccionados)."
          : null,
    };
  }

  return {
    ok: true,
    draftId: primerDraft.draft_id,
    estadoMaterializacion: m?.estado ?? primerDraft.estado ?? null,
    error: null,
  };
}

export interface DraftPreviewMotorResult {
  ok: boolean;
  preview: Record<string, unknown> | null;
  error: string | null;
}

/** Lectura del draft materializado, para mostrar antes de Approval 2. */
export async function obtenerDraftPreviewMotorAction(
  draftId: string,
): Promise<DraftPreviewMotorResult> {
  if (!draftId || typeof draftId !== "string") {
    return { ok: false, preview: null, error: "Falta el ID del draft." };
  }

  const contexto = await resolverContextoMotor();
  if (!contexto.ok) {
    return { ok: false, preview: null, error: contexto.error };
  }

  if (!hayServiceRole()) {
    return { ok: false, preview: null, error: "No se pudo leer el draft por un problema de configuración del servidor." };
  }

  const admin = createAdminClient();

  const { data, error } = await admin.rpc("motor_preview_draft", {
    p_tenant: contexto.ctx.tenantId,
    p_draft_id: draftId,
  });

  if (error || !data) {
    return { ok: false, preview: null, error: "No encontramos ese draft para tu cuenta." };
  }

  return { ok: true, preview: data as Record<string, unknown>, error: null };
}

export interface AprobarDraftMotorResult {
  ok: boolean;
  executionIntentId: string | null;
  /** "READY" habilita el siguiente paso (autorización económica); cualquier otro valor, no. */
  estadoIntent: string | null;
  gate: Record<string, unknown> | null;
  error: string | null;
}

/**
 * Approval 2 + creación automática del Execution Intent. Misma frontera de
 * identidad que Approval 1. El canal se resuelve server-side (nunca lo
 * elige el browser): el único canal utilizable mientras
 * REAL_PROVIDER_ENABLED=false es uno con provider='fake' ya configurado
 * para el tenant (motor_canales_visibles, ya autenticado=true, ya filtra
 * por los tenants visibles del usuario real).
 */
export async function aprobarDraftMotorAction(
  draftId: string,
): Promise<AprobarDraftMotorResult> {
  if (!draftId || typeof draftId !== "string") {
    return { ok: false, executionIntentId: null, estadoIntent: null, gate: null, error: "Falta el ID del draft." };
  }

  const contexto = await resolverContextoMotor();
  if (!contexto.ok) {
    return { ok: false, executionIntentId: null, estadoIntent: null, gate: null, error: contexto.error };
  }

  if (!hayServiceRole()) {
    return {
      ok: false,
      executionIntentId: null,
      estadoIntent: null,
      gate: null,
      error: "No se pudo aprobar el draft por un problema de configuración del servidor.",
    };
  }

  const supabase = await createClient();
  const admin = createAdminClient();

  // Necesitamos la versión del draft (preview_draft ya la expone) antes de
  // aprobar y crear el intent.
  const { data: previewData, error: previewError } = await admin.rpc("motor_preview_draft", {
    p_tenant: contexto.ctx.tenantId,
    p_draft_id: draftId,
  });

  if (previewError || !previewData) {
    return {
      ok: false,
      executionIntentId: null,
      estadoIntent: null,
      gate: null,
      error: "No encontramos ese draft para tu cuenta.",
    };
  }

  const preview = previewData as { version?: number };

  if (typeof preview.version !== "number") {
    return {
      ok: false,
      executionIntentId: null,
      estadoIntent: null,
      gate: null,
      error: "El draft no tiene una versión válida.",
    };
  }

  // HUMANO: Approval 2.
  const { data: aprobarData, error: aprobarError } = await admin.rpc("motor_aprobar_draft", {
    p_tenant: contexto.ctx.tenantId,
    p_draft_id: draftId,
    p_usuario: contexto.ctx.usuario,
  });

  if (aprobarError) {
    return {
      ok: false,
      executionIntentId: null,
      estadoIntent: null,
      gate: null,
      error: "No se pudo aprobar el draft.",
    };
  }

  const a = aprobarData as { estado?: string };
  if (a?.estado !== "APROBADO_PARA_EJECUCION") {
    return {
      ok: false,
      executionIntentId: null,
      estadoIntent: null,
      gate: null,
      error: `El draft no quedó en condiciones de ejecutarse (${a?.estado ?? "estado desconocido"}).`,
    };
  }

  // Resolver el canal server-side, con el cliente autenticado (ya filtra
  // por tenants visibles del usuario real) — nunca un canal_id del browser.
  const { data: canales, error: canalesError } = await supabase.rpc("motor_canales_visibles");

  if (canalesError) {
    return {
      ok: false,
      executionIntentId: null,
      estadoIntent: null,
      gate: null,
      error: "No se pudo resolver el canal de envío.",
    };
  }

  const canal = (
    (canales as Array<{
      canal_id: string;
      tenant_id: string;
      provider: string;
      activo: boolean;
      es_fake: boolean;
    }> | null) ?? []
  ).find((c) => c.tenant_id === contexto.ctx.tenantId && c.activo && c.es_fake);

  if (!canal) {
    return {
      ok: false,
      executionIntentId: null,
      estadoIntent: null,
      gate: null,
      error: "Tu cuenta no tiene un canal de prueba (fake) configurado todavía.",
    };
  }

  // AUTO: crear execution intent.
  const { data: intentData, error: intentError } = await admin.rpc("motor_crear_execution_intent", {
    p_tenant: contexto.ctx.tenantId,
    p_draft_id: draftId,
    p_version: preview.version,
    p_canal_id: canal.canal_id,
    p_provider: canal.provider,
    p_actor: contexto.ctx.usuario,
    p_ref_ts: new Date().toISOString(),
    p_proposito: "campana",
  });

  if (intentError) {
    return {
      ok: false,
      executionIntentId: null,
      estadoIntent: null,
      gate: null,
      error: "El draft se aprobó, pero no se pudo crear la ejecución. Podés reintentar en unos segundos.",
    };
  }

  const intent = intentData as {
    estado?: string;
    execution_id?: string;
    gate?: Record<string, unknown>;
  } | null;

  if (!intent?.execution_id) {
    return {
      ok: false,
      executionIntentId: null,
      estadoIntent: intent?.estado ?? null,
      gate: intent?.gate ?? null,
      error: "Respuesta inesperada del servidor al crear la ejecución.",
    };
  }

  return {
    ok: intent.estado === "READY",
    executionIntentId: intent.execution_id,
    estadoIntent: intent.estado ?? null,
    gate: intent.gate ?? null,
    error:
      intent.estado === "READY"
        ? null
        : "La ejecución quedó bloqueada por el gate de seguridad. Revisá el motivo antes de continuar.",
  };
}

export interface EstadoEjecucionMotorResult {
  ok: boolean;
  /** Etiqueta ya lista para mostrar, nunca afirma un envío real mientras el provider sea fake. */
  estado:
    | "PENDIENTE"
    | "PROCESANDO"
    | "COMPLETADO"
    | "PARCIAL"
    | "FALLIDO"
    | "DESCONOCIDO"
    | null;
  detalle: Record<string, unknown> | null;
  error: string | null;
}

const MAPA_ESTADO_INTENT: Record<string, EstadoEjecucionMotorResult["estado"]> = {
  READY: "PENDIENTE",
  CREDITS_RESERVED: "PENDIENTE",
  DISPATCHING: "PROCESANDO",
  COMPLETED: "COMPLETADO",
  PARTIAL: "PARCIAL",
  FAILED: "FALLIDO",
  CANCELLED: "FALLIDO",
  GATE_BLOCKED: "FALLIDO",
};

/** Lectura del estado final de una ejecución, para la sección "Estado" del Dashboard. */
export async function obtenerEstadoEjecucionMotorAction(
  executionIntentId: string,
): Promise<EstadoEjecucionMotorResult> {
  if (!executionIntentId || typeof executionIntentId !== "string") {
    return { ok: false, estado: null, detalle: null, error: "Falta el ID de la ejecución." };
  }

  const contexto = await resolverContextoMotor();
  if (!contexto.ok) {
    return { ok: false, estado: null, detalle: null, error: contexto.error };
  }

  if (!hayServiceRole()) {
    return { ok: false, estado: null, detalle: null, error: "No se pudo leer el estado por un problema de configuración del servidor." };
  }

  const admin = createAdminClient();

  const { data, error } = await admin.rpc("motor_estado_execution_intent", {
    p_tenant: contexto.ctx.tenantId,
    p_execution_intent_id: executionIntentId,
  });

  if (error || !data) {
    return { ok: false, estado: null, detalle: null, error: "No encontramos esa ejecución para tu cuenta." };
  }

  const d = data as { intent_estado?: string };

  return {
    ok: true,
    estado: (d.intent_estado ? MAPA_ESTADO_INTENT[d.intent_estado] : undefined) ?? "DESCONOCIDO",
    detalle: data as Record<string, unknown>,
    error: null,
  };
}
