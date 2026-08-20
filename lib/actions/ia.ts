"use server";

import OpenAI from "openai";
import { createClient } from "@/lib/supabase/server";
import { syncAndAnalyzeAction } from "@/lib/actions/sync";
import { saveListAction } from "@/lib/actions/write";
import type {
  ChatPayload,
  Contact,
  IAFlowState,
  IAHistoryTurn,
} from "@/lib/types";
import { IA_FLOW_IDLE } from "@/lib/types";

// -----------------------------------------------------------------------
// Cliente OpenAI. Se instancia perezosamente adentro de cada función (no a
// nivel de módulo) para que, si falta OPENAI_API_KEY en el entorno, el error
// ocurra recién cuando de verdad hace falta el LLM — la máquina de estados
// determinística del flujo (la mayoría de los turnos) no lo necesita en
// absoluto y sigue funcionando igual sin la key configurada.
// -----------------------------------------------------------------------
function getOpenAI(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Falta configurar OPENAI_API_KEY en las variables de entorno del proyecto.",
    );
  }
  return new OpenAI({ apiKey });
}

export interface IAResponse {
  text: string;
  payload?: ChatPayload;
  flowState: IAFlowState;
  error?: string;
}

// -----------------------------------------------------------------------
// Clasificador de intención — se usa SOLO cuando no hay un flujo guiado
// activo. Es deliberadamente barato (gpt-4o-mini, respuesta corta y
// estructurada) porque la mayoría de los mensajes durante un flujo ya
// resuelto no pasan por acá (ver sendIAMessageAction más abajo).
// -----------------------------------------------------------------------
type Intencion =
  | { tipo: "crear_grupo"; consulta: string | null }
  | { tipo: "crear_template" }
  | { tipo: "crear_campana" }
  | { tipo: "otra" };

async function clasificarIntencion(
  mensaje: string,
  historial: IAHistoryTurn[],
): Promise<Intencion> {
  const openai = getOpenAI();

  const contextoHistorial = historial
    .slice(-6)
    .map((h) => `${h.role === "user" ? "Usuario" : "Asistente"}: ${h.text}`)
    .join("\n");

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `Sos el clasificador de intención del chat de IA de YamaSend, una plataforma de mensajería masiva por WhatsApp para inmobiliarias y negocios similares.

Tu única tarea es decidir qué quiere hacer el usuario a partir de su último mensaje (y el historial reciente como contexto). Devolvé ÚNICAMENTE un JSON con esta forma exacta:

{"tipo": "crear_grupo" | "crear_template" | "crear_campana" | "otra", "consulta": string | null}

- "crear_grupo": el usuario quiere armar/crear una lista o grupo de contactos.
  - Si además especificó un criterio de selección en lenguaje natural (ej: "los que preguntaron por cocina americana", "los interesados en la casa de 3 ambientes"), poné ese criterio tal cual en "consulta". Si no especificó ningún criterio (solo dijo "quiero crear un grupo"), "consulta" debe ser null.
- "crear_template": el usuario quiere crear/redactar un template o mensaje para mandar a aprobar a Meta/WhatsApp.
- "crear_campana": el usuario quiere armar o enviar una campaña de mensajes.
- "otra": cualquier otra cosa (preguntas sobre sus datos, métricas, charla general, etc).

Para tipo distinto de "crear_grupo", "consulta" siempre va null.
No agregues texto fuera del JSON.`,
      },
      {
        role: "user",
        content: contextoHistorial
          ? `Historial reciente:\n${contextoHistorial}\n\nÚltimo mensaje del usuario: ${mensaje}`
          : `Último mensaje del usuario: ${mensaje}`,
      },
    ],
  });

  const raw = completion.choices[0]?.message?.content ?? "{}";
  try {
    const parsed = JSON.parse(raw);
    if (parsed.tipo === "crear_grupo") {
      return { tipo: "crear_grupo", consulta: parsed.consulta || null };
    }
    if (parsed.tipo === "crear_template") return { tipo: "crear_template" };
    if (parsed.tipo === "crear_campana") return { tipo: "crear_campana" };
    return { tipo: "otra" };
  } catch {
    return { tipo: "otra" };
  }
}

// -----------------------------------------------------------------------
// Resuelve tenant_id + contactos del usuario logueado. Centralizado acá
// para no repetir el patrón de sesión -> yamas_inmo_clientes en cada rama
// del flujo.
// -----------------------------------------------------------------------
async function resolverTenantId(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: cliente } = await supabase
    .from("yamas_inmo_clientes")
    .select("tenant_id")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  return cliente?.tenant_id ?? null;
}

async function contarContactos(): Promise<number> {
  const supabase = await createClient();
  const tenantId = await resolverTenantId();
  if (!tenantId) return 0;

  const { count } = await supabase
    .from("yamas_send_leads")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("activo", true);

  return count ?? 0;
}

/**
 * Busca, entre los contactos ya analizados por IA (yamas_send_leads), los
 * que matchean mejor una consulta en lenguaje natural. No vuelve a llamar
 * al LLM acá: usa keywords_detectados + resumen + necesidad, que ya fueron
 * generados por el workflow de análisis. El match es por texto simple
 * (ILIKE/contains), rápido porque corre sobre datos ya pre-procesados, no
 * sobre miles de mensajes crudos.
 */
async function preseleccionarPorConsulta(
  consulta: string,
): Promise<string[]> {
  const supabase = await createClient();
  const tenantId = await resolverTenantId();
  if (!tenantId) return [];

  const { data: rows } = await supabase
    .from("yamas_send_leads")
    .select("id, resumen, necesidad, producto_servicio, keywords_detectados")
    .eq("tenant_id", tenantId)
    .eq("activo", true)
    .neq("temperatura", "frio");

  if (!rows) return [];

  const terminos = consulta
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 2);

  return rows
    .filter((r) => {
      const bolsa = [
        r.resumen,
        r.necesidad,
        r.producto_servicio,
        ...(r.keywords_detectados ?? []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return terminos.some((t) => bolsa.includes(t));
    })
    .map((r) => r.id);
}

// -----------------------------------------------------------------------
// Punto de entrada único del chat de IA. Recibe el mensaje del usuario, el
// historial corto (para el clasificador) y el estado de flujo actual.
// Devuelve el próximo mensaje del bot + el nuevo estado de flujo.
// -----------------------------------------------------------------------
export async function sendIAMessageAction(
  userMessage: string,
  history: IAHistoryTurn[],
  flowState: IAFlowState,
): Promise<IAResponse> {
  const texto = userMessage.trim();
  if (!texto) {
    return {
      text: "Contame qué necesitás.",
      flowState,
    };
  }

  // ---- Flujo activo: crear_grupo -------------------------------------
  if (flowState.kind === "crear_grupo") {
    return handleCrearGrupoStep(texto, flowState);
  }

  // ---- Sin flujo activo: clasificar intención --------------------------
  let intencion: Intencion;
  try {
    intencion = await clasificarIntencion(texto, history);
  } catch (e) {
    return {
      text: "Tuve un problema para entender tu pedido. ¿Podés reformularlo?",
      flowState: IA_FLOW_IDLE,
      error: e instanceof Error ? e.message : "Error desconocido",
    };
  }

  if (intencion.tipo === "crear_grupo") {
    return iniciarFlujoCrearGrupo(intencion.consulta);
  }

  if (intencion.tipo === "crear_template" || intencion.tipo === "crear_campana") {
    const nombreFlujo =
      intencion.tipo === "crear_template" ? "crear templates" : "crear campañas";
    return {
      text: `Todavía estoy aprendiendo a ${nombreFlujo} por acá — esa parte va a estar disponible muy pronto. Por ahora podés hacerlo desde la sección correspondiente en el menú. Mientras tanto, sí puedo ayudarte a crear un grupo de contactos, ¿querés que arranquemos con eso?`,
      flowState: IA_FLOW_IDLE,
    };
  }

  // "otra": placeholder conversacional (analítica libre) — no es el foco de
  // esta iteración, así que respondemos con guía hacia lo que sí sabemos
  // hacer en vez de inventar una respuesta analítica sin datos reales detrás.
  return {
    text: "Puedo ayudarte a crear un grupo de contactos hablando conmigo. Por ejemplo, pedime: \"creame un grupo con los que preguntaron por casas de 3 ambientes\". ¿Querés que empecemos?",
    flowState: IA_FLOW_IDLE,
  };
}

// -----------------------------------------------------------------------
// Flujo: crear_grupo
// -----------------------------------------------------------------------

async function iniciarFlujoCrearGrupo(
  consultaInicial: string | null,
): Promise<IAResponse> {
  const totalContactos = await contarContactos();

  if (totalContactos === 0) {
    return {
      text: "Todavía no tenés contactos sincronizados, así que no puedo armar un grupo. Sincronizá tus contactos de WhatsApp desde la sección Contactos y volvé a intentarlo.",
      flowState: IA_FLOW_IDLE,
    };
  }

  return {
    text: "Dale, armemos un grupo. ¿Cómo querés que se llame?",
    flowState: {
      kind: "crear_grupo",
      step: "grupo_esperando_nombre",
      draft: { consultaUsada: consultaInicial },
    },
  };
}

async function handleCrearGrupoStep(
  texto: string,
  flowState: IAFlowState,
): Promise<IAResponse> {
  const { step, draft } = flowState;

  // Cancelación en cualquier punto del flujo. Deliberadamente estricta (match
  // exacto, no "contiene") para no confundir un nombre de grupo legítimo
  // como "Cancelaciones de reserva" con una intención de cancelar el flujo.
  // Trade-off conocido de v1: variantes como "mejor cancelalo" no matchean;
  // se prioriza no cancelar por accidente sobre reconocer toda frase posible.
  if (/^(cancelar|cancela|olvidalo|dejalo)$/i.test(texto)) {
    return {
      text: "Listo, cancelé la creación del grupo. ¿En qué más te ayudo?",
      flowState: IA_FLOW_IDLE,
    };
  }

  if (step === "grupo_esperando_nombre") {
    const nombre = texto.slice(0, 120);
    const nuevoDraft = { ...draft, nombre };

    // Si el usuario ya había dado un criterio de selección al iniciar el
    // flujo (ej: "los que preguntaron por X"), corremos el análisis de IA
    // sobre los contactos ANTES de mostrar la tabla, para llegar con una
    // preselección lista. Si no dio criterio, mostramos la tabla vacía de
    // selección directamente (equivalente al modal manual).
    if (draft.consultaUsada) {
      try {
        await syncAndAnalyzeAction({
          diasAnalisis: 30,
          limiteContactos: 100,
          consulta: draft.consultaUsada,
        });
      } catch {
        // Si el análisis falla (ej: sesión WAHA no conectada), seguimos
        // igual mostrando la tabla sin preselección — no bloqueamos el
        // flujo por un fallo de un paso opcional.
      }

      const preselectedIds = await preseleccionarPorConsulta(
        draft.consultaUsada,
      );

      return {
        text:
          preselectedIds.length > 0
            ? `Listo, "${nombre}". Analicé tus conversaciones y encontré ${preselectedIds.length} contacto${preselectedIds.length === 1 ? "" : "s"} relacionados con "${draft.consultaUsada}". Los dejé preseleccionados — revisá la lista y ajustá lo que necesites.`
            : `Listo, "${nombre}". Analicé tus conversaciones pero no encontré contactos claramente relacionados con "${draft.consultaUsada}". Elegí manualmente de la lista de abajo.`,
        payload: {
          kind: "seleccionar_contactos",
          preselectedIds,
          consultaUsada: draft.consultaUsada,
        },
        flowState: {
          kind: "crear_grupo",
          step: "grupo_esperando_contactos",
          draft: nuevoDraft,
        },
      };
    }

    return {
      text: `Listo, "${nombre}". Ahora elegí los contactos que van a formar parte del grupo.`,
      payload: { kind: "seleccionar_contactos", preselectedIds: [] },
      flowState: {
        kind: "crear_grupo",
        step: "grupo_esperando_contactos",
        draft: nuevoDraft,
      },
    };
  }

  if (step === "grupo_esperando_contactos") {
    // En este paso, el usuario interactúa con la tarjeta (checkboxes +
    // botón "Confirmar selección"), no con el textarea. Si de todos modos
    // escribe algo por texto, lo guiamos de vuelta a la tarjeta.
    return {
      text: "Elegí los contactos desde la lista de arriba y tocá \"Confirmar selección\" cuando termines.",
      flowState,
    };
  }

  if (step === "grupo_esperando_confirmacion") {
    return {
      text: "Confirmá desde la tarjeta de arriba para crear el grupo, o escribí \"cancelar\" si preferís no crearlo.",
      flowState,
    };
  }

  // Estado inesperado: reseteamos por seguridad.
  return {
    text: "Se ve que algo se desconfiguró en la conversación. Empecemos de nuevo: ¿qué necesitás?",
    flowState: IA_FLOW_IDLE,
  };
}

/**
 * Se llama cuando el usuario confirma la selección de contactos desde la
 * tarjeta (botón "Confirmar selección"), no desde el textarea de texto
 * libre. Avanza el flujo al paso de confirmación final con una tarjeta
 * resumen.
 */
export async function confirmarSeleccionContactosAction(
  flowState: IAFlowState,
  contactosIds: string[],
): Promise<IAResponse> {
  if (flowState.kind !== "crear_grupo" || !flowState.draft.nombre) {
    return {
      text: "Se perdió el contexto del grupo que estabas creando. Empecemos de nuevo.",
      flowState: IA_FLOW_IDLE,
    };
  }

  if (contactosIds.length === 0) {
    return {
      text: "Elegí al menos un contacto para poder crear el grupo.",
      payload: { kind: "seleccionar_contactos", preselectedIds: [] },
      flowState,
    };
  }

  const nuevoDraft = { ...flowState.draft, contactosIds };

  return {
    text: `Confirmame: creamos el grupo "${flowState.draft.nombre}" con ${contactosIds.length} contacto${contactosIds.length === 1 ? "" : "s"}.`,
    payload: {
      kind: "confirmar_grupo",
      nombre: flowState.draft.nombre,
      contactosIds,
    },
    flowState: {
      kind: "crear_grupo",
      step: "grupo_esperando_confirmacion",
      draft: nuevoDraft,
    },
  };
}

/**
 * Se llama cuando el usuario confirma la creación del grupo desde la
 * tarjeta final (botón "Crear grupo"). Ejecuta la Server Action real
 * (saveListAction), la misma que usa el modal manual — cero lógica de
 * negocio duplicada.
 */
export async function confirmarCreacionGrupoAction(
  flowState: IAFlowState,
): Promise<IAResponse> {
  if (
    flowState.kind !== "crear_grupo" ||
    !flowState.draft.nombre ||
    !flowState.draft.contactosIds?.length
  ) {
    return {
      text: "Se perdió el contexto del grupo que estabas creando. Empecemos de nuevo.",
      flowState: IA_FLOW_IDLE,
    };
  }

  const { nombre, contactosIds } = flowState.draft;
  const result = await saveListAction(nombre, contactosIds);

  if (result.error || !result.id) {
    return {
      text: `No pude crear el grupo: ${result.error ?? "error desconocido"}. ¿Querés reintentar?`,
      flowState,
    };
  }

  return {
    text: `Listo, creé el grupo "${nombre}" con ${contactosIds.length} contacto${contactosIds.length === 1 ? "" : "s"}. ¿Qué más necesitás?`,
    payload: {
      kind: "grupo_creado",
      grupoId: result.id,
      nombre,
      totalContactos: contactosIds.length,
    },
    flowState: IA_FLOW_IDLE,
  };
}

/** Utilidad de solo lectura para que IA.tsx pinte la tabla de selección. */
export async function getContactsForIAAction(): Promise<Contact[]> {
  const tenantId = await resolverTenantId();
  if (!tenantId) return [];
  const { getContactsForTenant } = await import("@/lib/actions/user");
  return getContactsForTenant(tenantId);
}
