"use server";

import OpenAI from "openai";
import { createClient } from "@/lib/supabase/server";
import {
  syncAndAnalyzeAction,
  generarTemplateConIAAction,
  isWahaConectadaAction,
} from "@/lib/actions/sync";
import {
  saveListAction,
  saveTemplateDraftAction,
  sendTemplateToMetaAction,
  saveCampaignAction,
  sendCampaignAction,
} from "@/lib/actions/write";
import { getListsForTenant, getTemplatesForTenant } from "@/lib/actions/campaigns";
import type {
  ChatPayload,
  Contact,
  IAFlowState,
  IAHistoryTurn,
} from "@/lib/types";
import { IA_FLOW_IDLE } from "@/lib/types";

// Mismo costo por mensaje que usa CampaignWizardModal.tsx (COST_PER_MSG en
// AppShell.tsx) — se mantiene acá como constante propia porque ese valor
// vive hoy hardcodeado en el componente, no exportado desde ningún lado
// reusable. Si alguna vez se centraliza, actualizar ambos lugares.
const COST_PER_MSG = 0.0618;

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
  | { tipo: "crear_audiencia"; consulta: string | null }
  | { tipo: "crear_template" }
  | { tipo: "crear_campana" }
  | { tipo: "importar_contactos" }
  | { tipo: "buscar_contactos"; consulta: string }
  | { tipo: "otra" };

async function clasificarIntencion(
  mensaje: string,
  historial: IAHistoryTurn[],
  contexto: ContextoNegocio | null,
): Promise<Intencion> {
  const openai = getOpenAI();

  const contextoHistorial = historial
    .slice(-6)
    .map((h) => `${h.role === "user" ? "Usuario" : "Asistente"}: ${h.text}`)
    .join("\n");

  const lineasContextoNegocio = contexto
    ? [
        contexto.rubro && `Rubro: ${contexto.rubro}`,
        contexto.descripcionNegocio && `Descripción del negocio: ${contexto.descripcionNegocio}`,
        contexto.publicoObjetivo && `Público objetivo: ${contexto.publicoObjetivo}`,
      ].filter(Boolean)
    : [];

  const bloqueContextoNegocio = lineasContextoNegocio.length
    ? `\n\nContexto del negocio de este tenant (usalo únicamente para interpretar mejor vocabulario propio del rubro al momento de entender el mensaje, nunca para inventar una intención que el mensaje no pide):\n${lineasContextoNegocio.join("\n")}`
    : "";

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `Sos el clasificador de intención del chat de IA de YamaSend, una plataforma de mensajería masiva por WhatsApp para inmobiliarias y negocios similares.

Tu única tarea es decidir qué quiere hacer el usuario a partir de su último mensaje (y el historial reciente como contexto). Devolvé ÚNICAMENTE un JSON con esta forma exacta:

{"tipo": "crear_audiencia" | "crear_template" | "crear_campana" | "importar_contactos" | "buscar_contactos" | "otra", "consulta": string | null}

- "crear_audiencia": el usuario quiere armar/crear una lista o audiencia de contactos directamente (ej: "creame una audiencia con los que preguntaron por X", "quiero armar una audiencia nueva").
  - Si además especificó un criterio de selección en lenguaje natural, poné ese criterio tal cual en "consulta". Si no especificó ningún criterio, "consulta" debe ser null.
- "crear_template": el usuario quiere crear/redactar un template o mensaje para mandar a aprobar a Meta/WhatsApp.
- "crear_campana": el usuario quiere armar o enviar una campaña de mensajes.
- "importar_contactos": el usuario quiere importar, sincronizar o traer sus contactos de WhatsApp (ej: "importá mis contactos", "sincronizá mis chats", "traé mis contactos nuevos").
- "buscar_contactos": el usuario quiere VER o ENCONTRAR contactos según un tema que se haya hablado en las conversaciones, SIN pedir explícitamente crear una audiencia (ej: "mostrame los que hablamos de Coca-Cola", "quiénes preguntaron por el departamento de 3 ambientes", "buscá contactos que mencionaron descuentos"). La clave para diferenciarlo de "crear_audiencia": acá el usuario quiere VER/EXPLORAR resultados primero, no está pidiendo crear una audiencia de una.
  - En este caso, "consulta" es obligatorio: el tema o palabra clave que hay que buscar (ej: "coca cola", "departamento de 3 ambientes").
- "otra": cualquier otra cosa (preguntas sobre sus datos, métricas, charla general, etc).

Para "crear_template", "crear_campana", "importar_contactos" y "otra", "consulta" siempre va null.
No agregues texto fuera del JSON.${bloqueContextoNegocio}`,
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
    if (parsed.tipo === "crear_audiencia") {
      return { tipo: "crear_audiencia", consulta: parsed.consulta || null };
    }
    if (parsed.tipo === "crear_template") return { tipo: "crear_template" };
    if (parsed.tipo === "crear_campana") return { tipo: "crear_campana" };
    if (parsed.tipo === "importar_contactos") return { tipo: "importar_contactos" };
    if (parsed.tipo === "buscar_contactos" && parsed.consulta) {
      return { tipo: "buscar_contactos", consulta: String(parsed.consulta) };
    }
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

// -----------------------------------------------------------------------
// Contexto de negocio (sección "Datos de la empresa" de Mi perfil) del
// usuario logueado. Se usa para que el clasificador de intención interprete
// mejor el vocabulario propio del rubro del tenant (ej: términos de
// inmobiliaria) en vez de razonar en abstracto. Devuelve null si no hay
// sesión o no hay fila — el llamador debe seguir funcionando igual en ese
// caso (degradación genérica, no error).
// -----------------------------------------------------------------------
interface ContextoNegocio {
  rubro: string;
  descripcionNegocio: string;
  publicoObjetivo: string;
}

async function resolverContextoNegocio(): Promise<ContextoNegocio | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: cliente } = await supabase
    .from("yamas_inmo_clientes")
    .select("rubro, descripcion_negocio, publico_objetivo")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (!cliente) return null;

  return {
    rubro: cliente.rubro ?? "",
    descripcionNegocio: cliente.descripcion_negocio ?? "",
    publicoObjetivo: cliente.publico_objetivo ?? "",
  };
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

  // ---- Flujo activo: crear_audiencia -------------------------------------
  if (flowState.kind === "crear_audiencia") {
    return handleCrearAudienciaStep(texto, flowState);
  }

  // ---- Flujo activo: crear_template -----------------------------------
  if (flowState.kind === "crear_template") {
    return handleCrearTemplateStep(texto, flowState);
  }

  // ---- Flujo activo: crear_campana -------------------------------------
  if (flowState.kind === "crear_campana") {
    return handleCrearCampanaStep(texto, flowState);
  }

  // ---- Flujo activo: importar_contactos --------------------------------
  if (flowState.kind === "importar_contactos") {
    return handleImportarContactosStep(texto, flowState);
  }

  // ---- Sin flujo activo: clasificar intención --------------------------
  let intencion: Intencion;
  try {
    const contextoNegocio = await resolverContextoNegocio();
    intencion = await clasificarIntencion(texto, history, contextoNegocio);
  } catch (e) {
    // Log server-side con el detalle real (nunca se muestra tal cual al
    // usuario, pero queda en los runtime logs de Vercel para diagnosticar).
    console.error("[IA] Error en clasificarIntencion:", e);
    return {
      text: "Tuve un problema para entender tu pedido. ¿Podés reformularlo?",
      flowState: IA_FLOW_IDLE,
      error: e instanceof Error ? e.message : "Error desconocido",
    };
  }

  if (intencion.tipo === "crear_audiencia") {
    return iniciarFlujoCrearAudiencia(intencion.consulta);
  }

  if (intencion.tipo === "crear_template") {
    return iniciarFlujoCrearTemplate();
  }

  if (intencion.tipo === "crear_campana") {
    return iniciarFlujoCrearCampana();
  }

  if (intencion.tipo === "importar_contactos") {
    return await iniciarFlujoImportarContactos();
  }

  if (intencion.tipo === "buscar_contactos") {
    return buscarContactosPorTema(intencion.consulta);
  }

  // "otra": placeholder conversacional (analítica libre) — no es el foco de
  // esta iteración, así que respondemos con guía hacia lo que sí sabemos
  // hacer en vez de inventar una respuesta analítica sin datos reales detrás.
  return {
    text: "Puedo ayudarte a importar contactos, crear una audiencia, un template o una campaña, y buscar contactos por tema hablando conmigo. Por ejemplo, pedime: \"mostrame los que hablamos de casas de 3 ambientes\" o \"quiero mandar una campaña\". ¿Querés que empecemos?",
    flowState: IA_FLOW_IDLE,
  };
}

// -----------------------------------------------------------------------
// Flujo: crear_audiencia
// -----------------------------------------------------------------------

async function iniciarFlujoCrearAudiencia(
  consultaInicial: string | null,
): Promise<IAResponse> {
  const totalContactos = await contarContactos();

  if (totalContactos === 0) {
    return {
      text: "Todavía no tenés contactos sincronizados, así que no puedo armar una audiencia. Sincronizá tus contactos de WhatsApp desde la sección Contactos y volvé a intentarlo.",
      flowState: IA_FLOW_IDLE,
    };
  }

  return {
    text: "Dale, armemos una audiencia. ¿Cómo querés que se llame?",
    flowState: {
      kind: "crear_audiencia",
      step: "audiencia_esperando_nombre",
      draft: { consultaUsada: consultaInicial },
    },
  };
}

async function handleCrearAudienciaStep(
  texto: string,
  flowState: IAFlowState,
): Promise<IAResponse> {
  const { step, draft } = flowState;

  // Cancelación en cualquier punto del flujo. Deliberadamente estricta (match
  // exacto, no "contiene") para no confundir un nombre de audiencia legítimo
  // como "Cancelaciones de reserva" con una intención de cancelar el flujo.
  // Trade-off conocido de v1: variantes como "mejor cancelalo" no matchean;
  // se prioriza no cancelar por accidente sobre reconocer toda frase posible.
  if (/^(cancelar|cancela|olvidalo|dejalo)$/i.test(texto)) {
    return {
      text: "Listo, cancelé la creación de la audiencia. ¿En qué más te ayudo?",
      flowState: IA_FLOW_IDLE,
    };
  }

  if (step === "audiencia_esperando_nombre") {
    const nombre = texto.slice(0, 120);
    const nuevoDraft = { ...draft, nombre };

    // Si los contactos ya vienen resueltos (ej: desde resultados de
    // búsqueda de texto completo), saltamos directo a la tarjeta de
    // selección ya preseleccionada, SIN volver a correr syncAndAnalyzeAction
    // ni pisar la preselección con preseleccionarPorConsulta (que busca en
    // yamas_send_leads, una fuente distinta).
    if (draft.contactosIdsResueltos && draft.contactosIds) {
      return {
        text: `Listo, "${nombre}". Ya tengo los ${draft.contactosIds.length} contacto${draft.contactosIds.length === 1 ? "" : "s"} que encontramos — revisá la lista y ajustá lo que necesites.`,
        payload: {
          kind: "seleccionar_contactos",
          preselectedIds: draft.contactosIds,
          consultaUsada: draft.consultaUsada,
        },
        flowState: {
          kind: "crear_audiencia",
          step: "audiencia_esperando_contactos",
          draft: nuevoDraft,
        },
      };
    }

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
          kind: "crear_audiencia",
          step: "audiencia_esperando_contactos",
          draft: nuevoDraft,
        },
      };
    }

    return {
      text: `Listo, "${nombre}". Ahora elegí los contactos que van a formar parte de la audiencia.`,
      payload: { kind: "seleccionar_contactos", preselectedIds: [] },
      flowState: {
        kind: "crear_audiencia",
        step: "audiencia_esperando_contactos",
        draft: nuevoDraft,
      },
    };
  }

  if (step === "audiencia_esperando_contactos") {
    // En este paso, el usuario interactúa con la tarjeta (checkboxes +
    // botón "Confirmar selección"), no con el textarea. Si de todos modos
    // escribe algo por texto, lo guiamos de vuelta a la tarjeta.
    return {
      text: "Elegí los contactos desde la lista de arriba y tocá \"Confirmar selección\" cuando termines.",
      flowState,
    };
  }

  if (step === "audiencia_esperando_confirmacion") {
    return {
      text: "Confirmá desde la tarjeta de arriba para crear la audiencia, o escribí \"cancelar\" si preferís no crearla.",
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
  if (flowState.kind !== "crear_audiencia" || !flowState.draft.nombre) {
    return {
      text: "Se perdió el contexto de la audiencia que estabas creando. Empecemos de nuevo.",
      flowState: IA_FLOW_IDLE,
    };
  }

  if (contactosIds.length === 0) {
    return {
      text: "Elegí al menos un contacto para poder crear la audiencia.",
      payload: { kind: "seleccionar_contactos", preselectedIds: [] },
      flowState,
    };
  }

  const nuevoDraft = { ...flowState.draft, contactosIds };

  return {
    text: `Confirmame: creamos la audiencia "${flowState.draft.nombre}" con ${contactosIds.length} contacto${contactosIds.length === 1 ? "" : "s"}.`,
    payload: {
      kind: "confirmar_audiencia",
      nombre: flowState.draft.nombre,
      contactosIds,
    },
    flowState: {
      kind: "crear_audiencia",
      step: "audiencia_esperando_confirmacion",
      draft: nuevoDraft,
    },
  };
}

/**
 * Se llama cuando el usuario confirma la creación de la audiencia desde la
 * tarjeta final (botón "Crear audiencia"). Ejecuta la Server Action real
 * (saveListAction), la misma que usa el modal manual — cero lógica de
 * negocio duplicada.
 */
export async function confirmarCreacionAudienciaAction(
  flowState: IAFlowState,
): Promise<IAResponse> {
  if (
    flowState.kind !== "crear_audiencia" ||
    !flowState.draft.nombre ||
    !flowState.draft.contactosIds?.length
  ) {
    return {
      text: "Se perdió el contexto de la audiencia que estabas creando. Empecemos de nuevo.",
      flowState: IA_FLOW_IDLE,
    };
  }

  const { nombre, contactosIds } = flowState.draft;
  const result = await saveListAction(nombre, contactosIds);

  if (result.error || !result.id) {
    return {
      text: `No pude crear la audiencia: ${result.error ?? "error desconocido"}. ¿Querés reintentar?`,
      flowState,
    };
  }

  return {
    text: `Listo, creé la audiencia "${nombre}" con ${contactosIds.length} contacto${contactosIds.length === 1 ? "" : "s"}. ¿Qué más necesitás?`,
    payload: {
      kind: "audiencia_creada",
      audienciaId: result.id,
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

// -----------------------------------------------------------------------
// Flujo: crear_template
// Mismas reglas que TemplateCreateModal.tsx (el modal manual): nombre >= 3
// caracteres, categoría entre las 4 fijas de Meta, contenido > 10
// caracteres para poder enviar a Meta. La sugerencia de IA reusa el mismo
// webhook de n8n (generarTemplateConIAAction) que ya usa el modal.
// -----------------------------------------------------------------------

const CATEGORIAS_TEMPLATE = ["marketing", "utility", "authentication"] as const;
type CategoriaTemplate = (typeof CATEGORIAS_TEMPLATE)[number];

const CATEGORIA_LABELS: Record<CategoriaTemplate, string> = {
  marketing: "Marketing",
  utility: "Utilidad",
  authentication: "Autenticación",
};

function esCategoriaValida(v: string): v is CategoriaTemplate {
  return (CATEGORIAS_TEMPLATE as readonly string[]).includes(v);
}

function iniciarFlujoCrearTemplate(): IAResponse {
  return {
    text: "Dale, armemos un template. ¿Cómo querés que se llame? (usá un nombre corto que te ayude a identificarlo, ej: promo_agosto)",
    flowState: {
      kind: "crear_template",
      step: "template_esperando_nombre",
      draft: {},
    },
  };
}

async function handleCrearTemplateStep(
  texto: string,
  flowState: IAFlowState,
): Promise<IAResponse> {
  const { step, draft } = flowState;

  // Cancelación en cualquier punto del flujo. Ver nota de diseño equivalente
  // en handleCrearAudienciaStep: match exacto, no "contiene", para no confundir
  // un nombre de template legítimo con la intención de cancelar.
  if (/^(cancelar|cancela|olvidalo|dejalo)$/i.test(texto)) {
    return {
      text: "Listo, cancelé la creación del template. ¿En qué más te ayudo?",
      flowState: IA_FLOW_IDLE,
    };
  }

  if (step === "template_esperando_nombre") {
    if (texto.trim().length < 3) {
      return {
        text: "El nombre necesita al menos 3 caracteres. ¿Cómo querés que se llame el template?",
        flowState,
      };
    }
    const nombre = texto.trim().slice(0, 120);
    return {
      text: `Buenísimo, "${nombre}". Ahora elegí la categoría del template.`,
      payload: { kind: "elegir_categoria_template" },
      flowState: {
        kind: "crear_template",
        step: "template_esperando_categoria",
        draft: { ...draft, nombre },
      },
    };
  }

  if (step === "template_esperando_categoria") {
    // Este paso se resuelve por click en la tarjeta (ver
    // seleccionarCategoriaTemplateAction), no por texto libre. Si el
    // usuario igual escribe, lo guiamos de vuelta a la tarjeta.
    return {
      text: "Elegí una categoría desde las opciones de arriba.",
      payload: { kind: "elegir_categoria_template" },
      flowState,
    };
  }

  if (step === "template_esperando_descripcion") {
    return generarSugerenciaTemplate(texto, flowState);
  }

  if (step === "template_esperando_confirmacion") {
    return {
      text: "Confirmá desde la tarjeta de arriba (Guardar borrador o Enviar a Meta), o escribí \"cancelar\" si preferís no continuar.",
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
 * Se llama cuando el usuario elige una categoría desde la tarjeta
 * `elegir_categoria_template` (click, no texto libre).
 */
export async function seleccionarCategoriaTemplateAction(
  flowState: IAFlowState,
  categoria: string,
): Promise<IAResponse> {
  if (flowState.kind !== "crear_template" || !flowState.draft.nombre) {
    return {
      text: "Se perdió el contexto del template que estabas creando. Empecemos de nuevo.",
      flowState: IA_FLOW_IDLE,
    };
  }

  if (!esCategoriaValida(categoria)) {
    return {
      text: "Esa categoría no es válida. Elegí una de las opciones de arriba.",
      payload: { kind: "elegir_categoria_template" },
      flowState,
    };
  }

  return {
    text: `"${CATEGORIA_LABELS[categoria]}", listo. Contame en pocas palabras qué querés comunicar y te armo una propuesta de mensaje — por ejemplo: "quiero avisar que tenemos 20% de descuento en agosto".`,
    flowState: {
      kind: "crear_template",
      step: "template_esperando_descripcion",
      draft: { ...flowState.draft, categoria },
    },
  };
}

/**
 * Genera (o regenera) la sugerencia de mensaje vía IA a partir de una
 * descripción en lenguaje natural. Reusa generarTemplateConIAAction, el
 * mismo webhook de n8n que usa el botón "Crear con IA" del modal manual.
 */
async function generarSugerenciaTemplate(
  descripcion: string,
  flowState: IAFlowState,
): Promise<IAResponse> {
  if (!flowState.draft.categoria) {
    return {
      text: "Se perdió el contexto del template que estabas creando. Empecemos de nuevo.",
      flowState: IA_FLOW_IDLE,
    };
  }

  const result = await generarTemplateConIAAction(descripcion, flowState.draft.categoria);

  if (result.error || !result.sugerencia) {
    return {
      text: `No pude generar el mensaje: ${result.error ?? "error desconocido"}. ¿Querés intentar con otra descripción?`,
      flowState,
    };
  }

  return {
    text: "Te dejo una propuesta de mensaje:",
    payload: { kind: "sugerencia_template", sugerencia: result.sugerencia },
    flowState: {
      ...flowState,
      draft: { ...flowState.draft, contenido: result.sugerencia },
    },
  };
}

/**
 * Se llama cuando el usuario pide "Generar otra opción" desde la tarjeta de
 * sugerencia — reintenta con la misma descripción original que escribió.
 * Como no guardamos la descripción textual en el draft (no hace falta para
 * nada más), le pedimos al usuario que la repita o la ajuste; es un costo
 * bajo y evita guardar estado que no se usa en ningún otro lado.
 */
export async function pedirOtraSugerenciaTemplateAction(
  flowState: IAFlowState,
): Promise<IAResponse> {
  if (flowState.kind !== "crear_template") {
    return {
      text: "Se perdió el contexto del template que estabas creando. Empecemos de nuevo.",
      flowState: IA_FLOW_IDLE,
    };
  }
  return {
    text: "Contame de nuevo (o con otras palabras) qué querés comunicar y te propongo otra versión.",
    flowState: {
      ...flowState,
      step: "template_esperando_descripcion",
    },
  };
}

/**
 * Se llama cuando el usuario confirma "Usar este mensaje" desde la tarjeta
 * de sugerencia. Avanza a la tarjeta de confirmación final.
 */
export async function usarSugerenciaTemplateAction(
  flowState: IAFlowState,
): Promise<IAResponse> {
  if (
    flowState.kind !== "crear_template" ||
    !flowState.draft.nombre ||
    !flowState.draft.categoria ||
    !flowState.draft.contenido
  ) {
    return {
      text: "Se perdió el contexto del template que estabas creando. Empecemos de nuevo.",
      flowState: IA_FLOW_IDLE,
    };
  }

  const { nombre, categoria, contenido } = flowState.draft;

  return {
    text: `Perfecto. Revisá cómo quedó "${nombre}" antes de confirmar.`,
    payload: { kind: "confirmar_template", nombre, contenido, categoria },
    flowState: {
      kind: "crear_template",
      step: "template_esperando_confirmacion",
      draft: flowState.draft,
    },
  };
}

/**
 * Se llama cuando el usuario confirma "Guardar borrador" desde la tarjeta
 * final. Ejecuta la Server Action real (saveTemplateDraftAction), la misma
 * que usa el modal manual.
 */
export async function guardarBorradorTemplateAction(
  flowState: IAFlowState,
): Promise<IAResponse> {
  if (
    flowState.kind !== "crear_template" ||
    !flowState.draft.nombre ||
    !flowState.draft.categoria
  ) {
    return {
      text: "Se perdió el contexto del template que estabas creando. Empecemos de nuevo.",
      flowState: IA_FLOW_IDLE,
    };
  }

  const { nombre, categoria, contenido } = flowState.draft;
  const result = await saveTemplateDraftAction(nombre, contenido ?? "", categoria);

  if (result.error || !result.id) {
    return {
      text: `No pude guardar el borrador: ${result.error ?? "error desconocido"}. ¿Querés reintentar?`,
      flowState,
    };
  }

  return {
    text: `Listo, guardé "${nombre}" como borrador. Podés retomarlo cuando quieras desde Templates. ¿Qué más necesitás?`,
    payload: { kind: "template_guardado", resultado: "borrador", nombre },
    flowState: IA_FLOW_IDLE,
  };
}

/**
 * Se llama cuando el usuario confirma "Enviar a Meta" desde la tarjeta
 * final. Ejecuta la Server Action real (sendTemplateToMetaAction), la
 * misma que usa el modal manual. El resultado final (verificado/rechazado)
 * llega async — lo cubre el polling ya existente en AppShell, que ahora
 * también avisa por el chat cuando detecta el cambio de estado.
 */
export async function confirmarEnvioTemplateAction(
  flowState: IAFlowState,
): Promise<IAResponse> {
  if (
    flowState.kind !== "crear_template" ||
    !flowState.draft.nombre ||
    !flowState.draft.categoria ||
    !flowState.draft.contenido
  ) {
    return {
      text: "Se perdió el contexto del template que estabas creando. Empecemos de nuevo.",
      flowState: IA_FLOW_IDLE,
    };
  }

  const { nombre, categoria, contenido } = flowState.draft;
  const result = await sendTemplateToMetaAction(nombre, contenido, categoria);

  if (!result.ok) {
    return {
      text: `No se pudo enviar el template a Meta: ${result.error ?? "error desconocido"}`,
      flowState,
    };
  }

  return {
    text: `${result.mensaje} El template quedó "En revisión" — Meta puede tardar unos minutos (a veces más) en aprobarlo. Te aviso por acá apenas cambie el estado.`,
    payload: { kind: "template_guardado", resultado: "enviado", nombre },
    flowState: IA_FLOW_IDLE,
  };
}

// -----------------------------------------------------------------------
// Flujo: crear_campana
// Mismas reglas que CampaignWizardModal.tsx (el wizard manual): audiencia →
// template → momento (ahora/programar) → confirmar. A diferencia del
// wizard manual, acá SÍ filtramos los templates a solo "verificado" —
// decisión explícita para no ofrecer por chat un template rechazado o en
// borrador (ver conversación del 21/08 con Bauti).
// -----------------------------------------------------------------------

async function iniciarFlujoCrearCampana(): Promise<IAResponse> {
  const tenantId = await resolverTenantId();
  if (!tenantId) {
    return {
      text: "No pude identificar tu cuenta. Probá recargar la página e intentar de nuevo.",
      flowState: IA_FLOW_IDLE,
    };
  }

  const lists = await getListsForTenant(tenantId);
  if (lists.length === 0) {
    return {
      text: "Todavía no tenés ninguna audiencia de contactos creada, así que no puedo armar una campaña. Pedime que te cree una audiencia primero, o hacelo desde la sección Audiencias.",
      flowState: IA_FLOW_IDLE,
    };
  }

  const templates = await getTemplatesForTenant(tenantId);
  const templatesAprobados = templates.filter((t) => t.status === "verificado");
  if (templatesAprobados.length === 0) {
    return {
      text: "Todavía no tenés ningún template aprobado por Meta, así que no puedo armar una campaña. Pedime que te cree un template, o esperá a que se apruebe uno que ya tengas en revisión.",
      flowState: IA_FLOW_IDLE,
    };
  }

  return {
    text: "Dale, armemos una campaña. ¿Cómo querés que se llame?",
    flowState: {
      kind: "crear_campana",
      step: "campana_esperando_nombre",
      draft: {},
    },
  };
}

async function handleCrearCampanaStep(
  texto: string,
  flowState: IAFlowState,
): Promise<IAResponse> {
  const { step, draft } = flowState;

  // Cancelación en cualquier punto del flujo. Ver nota de diseño equivalente
  // en handleCrearAudienciaStep/handleCrearTemplateStep: match exacto, no
  // "contiene", para no confundir un nombre de campaña legítimo con la
  // intención de cancelar.
  if (/^(cancelar|cancela|olvidalo|dejalo)$/i.test(texto)) {
    return {
      text: "Listo, cancelé la creación de la campaña. ¿En qué más te ayudo?",
      flowState: IA_FLOW_IDLE,
    };
  }

  if (step === "campana_esperando_nombre") {
    if (texto.trim().length < 3) {
      return {
        text: "El nombre necesita al menos 3 caracteres. ¿Cómo querés que se llame la campaña?",
        flowState,
      };
    }
    const nombre = texto.trim().slice(0, 120);
    return mostrarSelectorAudienciaCampana(nombre, draft);
  }

  if (step === "campana_esperando_audiencia") {
    return {
      text: "Elegí una audiencia desde las opciones de arriba.",
      payload: await payloadElegirAudienciaCampana(),
      flowState,
    };
  }

  if (step === "campana_esperando_template") {
    return {
      text: "Elegí un template desde las opciones de arriba.",
      payload: await payloadElegirTemplateCampana(),
      flowState,
    };
  }

  if (step === "campana_esperando_momento") {
    return {
      text: "Elegí cuándo enviarla desde las opciones de arriba.",
      payload: { kind: "elegir_momento_campana" },
      flowState,
    };
  }

  if (step === "campana_esperando_fecha") {
    return {
      text: "Elegí la fecha y hora desde el selector de arriba.",
      payload: { kind: "elegir_fecha_campana" },
      flowState,
    };
  }

  if (step === "campana_esperando_confirmacion") {
    return {
      text: "Confirmá desde la tarjeta de arriba, o escribí \"cancelar\" si preferís no continuar.",
      flowState,
    };
  }

  // Estado inesperado: reseteamos por seguridad.
  return {
    text: "Se ve que algo se desconfiguró en la conversación. Empecemos de nuevo: ¿qué necesitás?",
    flowState: IA_FLOW_IDLE,
  };
}

async function payloadElegirAudienciaCampana(): Promise<ChatPayload> {
  const tenantId = await resolverTenantId();
  const lists = tenantId ? await getListsForTenant(tenantId) : [];
  return {
    kind: "elegir_audiencia_campana",
    audiencias: lists.map((l) => ({
      id: l.id,
      nombre: l.nombre,
      totalContactos: l.contactosIds.length,
    })),
  };
}

async function payloadElegirTemplateCampana(): Promise<ChatPayload> {
  const tenantId = await resolverTenantId();
  const templates = tenantId ? await getTemplatesForTenant(tenantId) : [];
  const aprobados = templates.filter((t) => t.status === "verificado");
  return {
    kind: "elegir_template_campana",
    templates: aprobados.map((t) => ({
      id: t.id,
      nombre: t.nombre,
      contenido: t.contenido,
    })),
  };
}

async function mostrarSelectorAudienciaCampana(
  nombre: string,
  draft: IAFlowState["draft"],
): Promise<IAResponse> {
  return {
    text: `Buenísimo, "${nombre}". Ahora elegí a qué audiencia se la vas a mandar.`,
    payload: await payloadElegirAudienciaCampana(),
    flowState: {
      kind: "crear_campana",
      step: "campana_esperando_audiencia",
      draft: { ...draft, nombre },
    },
  };
}

/**
 * Se llama cuando el usuario elige una audiencia desde la tarjeta
 * `elegir_audiencia_campana` (click, no texto libre).
 */
export async function seleccionarAudienciaCampanaAction(
  flowState: IAFlowState,
  audienciaId: string,
): Promise<IAResponse> {
  if (flowState.kind !== "crear_campana" || !flowState.draft.nombre) {
    return {
      text: "Se perdió el contexto de la campaña que estabas creando. Empecemos de nuevo.",
      flowState: IA_FLOW_IDLE,
    };
  }

  const tenantId = await resolverTenantId();
  const lists = tenantId ? await getListsForTenant(tenantId) : [];
  const audiencia = lists.find((l) => l.id === audienciaId);

  if (!audiencia) {
    return {
      text: "No encontré esa audiencia. Elegí una de las opciones de arriba.",
      payload: await payloadElegirAudienciaCampana(),
      flowState,
    };
  }

  return {
    text: `"${audiencia.nombre}" (${audiencia.contactosIds.length} contactos). Ahora elegí qué template querés enviar — solo se muestran los ya aprobados por Meta.`,
    payload: await payloadElegirTemplateCampana(),
    flowState: {
      kind: "crear_campana",
      step: "campana_esperando_template",
      draft: { ...flowState.draft, audienciaId },
    },
  };
}

/**
 * Se llama cuando el usuario elige un template desde la tarjeta
 * `elegir_template_campana`.
 */
export async function seleccionarTemplateCampanaAction(
  flowState: IAFlowState,
  templateId: string,
): Promise<IAResponse> {
  if (
    flowState.kind !== "crear_campana" ||
    !flowState.draft.nombre ||
    !flowState.draft.audienciaId
  ) {
    return {
      text: "Se perdió el contexto de la campaña que estabas creando. Empecemos de nuevo.",
      flowState: IA_FLOW_IDLE,
    };
  }

  const tenantId = await resolverTenantId();
  const templates = tenantId ? await getTemplatesForTenant(tenantId) : [];
  const template = templates.find((t) => t.id === templateId && t.status === "verificado");

  if (!template) {
    return {
      text: "No encontré ese template entre los aprobados. Elegí uno de las opciones de arriba.",
      payload: await payloadElegirTemplateCampana(),
      flowState,
    };
  }

  return {
    text: `"${template.nombre}", listo. ¿Cuándo la enviamos?`,
    payload: { kind: "elegir_momento_campana" },
    flowState: {
      kind: "crear_campana",
      step: "campana_esperando_momento",
      draft: { ...flowState.draft, templateId },
    },
  };
}

/**
 * Se llama cuando el usuario elige el momento de envío desde la tarjeta
 * `elegir_momento_campana`.
 */
export async function seleccionarMomentoCampanaAction(
  flowState: IAFlowState,
  momento: "ahora" | "programar",
): Promise<IAResponse> {
  if (
    flowState.kind !== "crear_campana" ||
    !flowState.draft.nombre ||
    !flowState.draft.audienciaId ||
    !flowState.draft.templateId
  ) {
    return {
      text: "Se perdió el contexto de la campaña que estabas creando. Empecemos de nuevo.",
      flowState: IA_FLOW_IDLE,
    };
  }

  if (momento === "programar") {
    return {
      text: "Elegí la fecha y hora de envío.",
      payload: { kind: "elegir_fecha_campana" },
      flowState: {
        kind: "crear_campana",
        step: "campana_esperando_fecha",
        draft: { ...flowState.draft, momento },
      },
    };
  }

  return mostrarConfirmacionCampana({ ...flowState.draft, momento, fechaProgramada: null });
}

/**
 * Se llama cuando el usuario confirma una fecha/hora desde la tarjeta
 * `elegir_fecha_campana` (input datetime-local + botón).
 */
export async function seleccionarFechaCampanaAction(
  flowState: IAFlowState,
  fechaProgramadaIso: string,
): Promise<IAResponse> {
  if (
    flowState.kind !== "crear_campana" ||
    !flowState.draft.nombre ||
    !flowState.draft.audienciaId ||
    !flowState.draft.templateId
  ) {
    return {
      text: "Se perdió el contexto de la campaña que estabas creando. Empecemos de nuevo.",
      flowState: IA_FLOW_IDLE,
    };
  }

  return mostrarConfirmacionCampana({
    ...flowState.draft,
    momento: "programar",
    fechaProgramada: fechaProgramadaIso,
  });
}

async function mostrarConfirmacionCampana(
  draft: IAFlowState["draft"],
): Promise<IAResponse> {
  const tenantId = await resolverTenantId();
  const [lists, templates] = await Promise.all([
    tenantId ? getListsForTenant(tenantId) : Promise.resolve([]),
    tenantId ? getTemplatesForTenant(tenantId) : Promise.resolve([]),
  ]);

  const audiencia = lists.find((l) => l.id === draft.audienciaId);
  const template = templates.find((t) => t.id === draft.templateId);

  if (!audiencia || !template || !draft.nombre || !draft.momento) {
    return {
      text: "Se perdió el contexto de la campaña que estabas creando. Empecemos de nuevo.",
      flowState: IA_FLOW_IDLE,
    };
  }

  const totalContactos = audiencia.contactosIds.length;
  const costoUsd = totalContactos * COST_PER_MSG;

  return {
    text: `Revisá cómo quedó "${draft.nombre}" antes de confirmar.`,
    payload: {
      kind: "confirmar_campana",
      nombre: draft.nombre,
      audienciaNombre: audiencia.nombre,
      totalContactos,
      templateNombre: template.nombre,
      momento: draft.momento,
      fechaProgramada: draft.fechaProgramada ?? null,
      costoUsd,
    },
    flowState: {
      kind: "crear_campana",
      step: "campana_esperando_confirmacion",
      draft,
    },
  };
}

/**
 * Se llama cuando el usuario confirma "Crear campaña" desde la tarjeta
 * final. Ejecuta saveCampaignAction y, si el momento es "ahora", además
 * sendCampaignAction — mismo patrón exacto que el wizard manual en
 * AppShell.tsx (incluyendo ventana24h: false), cero lógica duplicada.
 */
export async function confirmarCreacionCampanaAction(
  flowState: IAFlowState,
): Promise<IAResponse> {
  if (
    flowState.kind !== "crear_campana" ||
    !flowState.draft.nombre ||
    !flowState.draft.audienciaId ||
    !flowState.draft.templateId ||
    !flowState.draft.momento
  ) {
    return {
      text: "Se perdió el contexto de la campaña que estabas creando. Empecemos de nuevo.",
      flowState: IA_FLOW_IDLE,
    };
  }

  const { nombre, audienciaId, templateId, momento, fechaProgramada } = flowState.draft;

  const tenantId = await resolverTenantId();
  const lists = tenantId ? await getListsForTenant(tenantId) : [];
  const templates = tenantId ? await getTemplatesForTenant(tenantId) : [];
  const audiencia = lists.find((l) => l.id === audienciaId);
  const template = templates.find((t) => t.id === templateId);

  if (!audiencia || !template) {
    return {
      text: "No pude encontrar la audiencia o el template seleccionados. Empecemos de nuevo.",
      flowState: IA_FLOW_IDLE,
    };
  }

  const saveResult = await saveCampaignAction(
    nombre,
    audienciaId,
    templateId,
    audiencia.contactosIds,
    momento === "programar" ? fechaProgramada ?? null : null,
  );

  if (saveResult.error || !saveResult.id) {
    return {
      text: `No pude crear la campaña: ${saveResult.error ?? "error desconocido"}. ¿Querés reintentar?`,
      flowState,
    };
  }

  if (momento === "programar") {
    return {
      text: `Listo, "${nombre}" quedó programada para ${fechaProgramada ? new Date(fechaProgramada).toLocaleString("es-AR") : ""}. Te aviso cuando se envíe.`,
      payload: {
        kind: "campana_creada",
        campanaId: saveResult.id,
        nombre,
        momento,
        fechaProgramada: fechaProgramada ?? null,
      },
      flowState: IA_FLOW_IDLE,
    };
  }

  const sendResult = await sendCampaignAction(
    saveResult.id,
    audienciaId,
    template.nombre,
    template.templateLang ?? "es_AR",
    false,
    audiencia.contactosIds.length,
  );

  if (sendResult.error) {
    return {
      text: `La campaña se guardó pero no se pudo enviar: ${sendResult.error}. Podés reintentar el envío desde la sección Campañas.`,
      flowState: IA_FLOW_IDLE,
    };
  }

  return {
    text: `Listo, "${nombre}" se está enviando a ${audiencia.contactosIds.length} contacto${audiencia.contactosIds.length === 1 ? "" : "s"}.`,
    payload: {
      kind: "campana_creada",
      campanaId: saveResult.id,
      nombre,
      momento,
      fechaProgramada: null,
    },
    flowState: IA_FLOW_IDLE,
  };
}

// -----------------------------------------------------------------------
// Flujo: importar_contactos
// Expone syncAndAnalyzeAction como su propio flujo conversacional — el
// mismo mecanismo que ya usa el botón "Analizar contactos" de la sección
// Contactos (SyncConfigModal.tsx). No hay "importar" separado de
// "analizar": sincronizar contactos de WAHA y correr el análisis de IA
// ocurren en la misma llamada al webhook.
// -----------------------------------------------------------------------

const IMPORT_DIAS_DEFAULT = 30;
const IMPORT_LIMITE_DEFAULT = 50;

async function iniciarFlujoImportarContactos(): Promise<IAResponse> {
  // Igual que el guard de SyncConfigModal en el frontend: si el WhatsApp no
  // está vinculado, WAHA no tiene de dónde leer las conversaciones, así que
  // ni arrancamos el flujo — le avisamos y cortamos acá.
  const conectada = await isWahaConectadaAction();
  if (!conectada) {
    return {
      text: "Para analizar tus contactos necesito que tu WhatsApp esté vinculado, y todavía no lo está. Vinculalo desde el botón \"Vincular\" y volvé a pedírmelo.",
      flowState: IA_FLOW_IDLE,
    };
  }

  return {
    text: `Dale, puedo importar y analizar tus contactos de WhatsApp. Ajustá el rango de días y la cantidad de contactos si querés, o confirmá directo con los valores por defecto (${IMPORT_DIAS_DEFAULT} días, ${IMPORT_LIMITE_DEFAULT} contactos).`,
    payload: {
      kind: "confirmar_importar_contactos",
      diasAnalisis: IMPORT_DIAS_DEFAULT,
      limiteContactos: IMPORT_LIMITE_DEFAULT,
    },
    flowState: {
      kind: "importar_contactos",
      step: "importar_esperando_confirmacion",
      draft: { diasAnalisis: IMPORT_DIAS_DEFAULT, limiteContactos: IMPORT_LIMITE_DEFAULT },
    },
  };
}

/**
 * Mientras se espera confirmación, el usuario puede escribir ajustes en
 * lenguaje natural (ej: "90 días y 100 contactos") en vez de tocar la
 * tarjeta. Interpretamos números sueltos del mensaje como día/límite si
 * aparecen — sin IA, con una heurística simple: el primer número que
 * aparece junto a "día"/"dias" es diasAnalisis, el que aparece junto a
 * "contacto" es limiteContactos. Si no se puede interpretar nada,
 * mantenemos los valores actuales y volvemos a mostrar la tarjeta.
 */
async function handleImportarContactosStep(
  texto: string,
  flowState: IAFlowState,
): Promise<IAResponse> {
  if (/^(cancelar|cancela|olvidalo|dejalo)$/i.test(texto)) {
    return {
      text: "Listo, cancelé la importación. ¿En qué más te ayudo?",
      flowState: IA_FLOW_IDLE,
    };
  }

  const draft = flowState.draft;
  const matchDias = texto.match(/(\d+)\s*d[ií]as?/i);
  const matchLimite = texto.match(/(\d+)\s*contactos?/i);

  const diasAnalisis = matchDias
    ? Math.max(1, Math.min(365, parseInt(matchDias[1], 10)))
    : (draft.diasAnalisis ?? IMPORT_DIAS_DEFAULT);
  const limiteContactos = matchLimite
    ? Math.max(1, Math.min(500, parseInt(matchLimite[1], 10)))
    : (draft.limiteContactos ?? IMPORT_LIMITE_DEFAULT);

  return {
    text: `Listo: ${diasAnalisis} días, hasta ${limiteContactos} contactos. Confirmá desde la tarjeta para arrancar.`,
    payload: {
      kind: "confirmar_importar_contactos",
      diasAnalisis,
      limiteContactos,
    },
    flowState: {
      kind: "importar_contactos",
      step: "importar_esperando_confirmacion",
      draft: { diasAnalisis, limiteContactos },
    },
  };
}

/**
 * Se llama cuando el usuario confirma "Importar contactos" desde la
 * tarjeta. Ejecuta syncAndAnalyzeAction — puede tardar bastante (varios
 * segundos por contacto), el front debe mostrar el estado "pensando"
 * mientras se resuelve esta promesa.
 */
export async function confirmarImportarContactosAction(
  flowState: IAFlowState,
  diasAnalisisOverride?: number,
  limiteContactosOverride?: number,
): Promise<IAResponse> {
  if (flowState.kind !== "importar_contactos") {
    return {
      text: "Se perdió el contexto de la importación. Empecemos de nuevo.",
      flowState: IA_FLOW_IDLE,
    };
  }

  // Los valores editados en la tarjeta (presets de días + input de
  // contactos) tienen prioridad sobre lo que quedó guardado en el draft
  // por texto libre — el usuario pudo haber ajustado la tarjeta sin
  // escribir ningún mensaje nuevo.
  const diasAnalisis = Math.max(
    1,
    Math.min(365, diasAnalisisOverride ?? flowState.draft.diasAnalisis ?? IMPORT_DIAS_DEFAULT),
  );
  const limiteContactos = Math.max(
    1,
    Math.min(500, limiteContactosOverride ?? flowState.draft.limiteContactos ?? IMPORT_LIMITE_DEFAULT),
  );

  // Refuerzo: re-chequeamos acá por si el WhatsApp se desvinculó entre que
  // se mostró la tarjeta de confirmación y que el usuario la confirmó.
  const conectada = await isWahaConectadaAction();
  if (!conectada) {
    return {
      text: "Tu WhatsApp ya no está vinculado, así que no puedo analizar tus contactos ahora. Vinculalo desde el botón \"Vincular\" y volvé a pedírmelo.",
      flowState: IA_FLOW_IDLE,
    };
  }

  const result = await syncAndAnalyzeAction({
    diasAnalisis,
    limiteContactos,
    consulta: "",
  });

  if (!result.success) {
    return {
      text: `No pude completar la importación: ${result.error ?? "error desconocido"}. ¿Querés reintentar?`,
      flowState: IA_FLOW_IDLE,
    };
  }

  return {
    text:
      result.contactosAnalizados > 0
        ? `Listo, analicé ${result.contactosAnalizados} conversaciones y encontré ${result.leadsIdentificados} leads con interés. Ya podés verlos en Contactos, crear una audiencia, o pedirme que busque algo puntual entre ellos.`
        : `Terminé de revisar, pero no encontré contactos con mensajes en ese rango. ${result.mensaje ?? ""}`.trim(),
    payload: {
      kind: "importacion_completada",
      contactosAnalizados: result.contactosAnalizados,
      leadsIdentificados: result.leadsIdentificados,
      contactosProcesados: result.contactosProcesados,
    },
    flowState: IA_FLOW_IDLE,
  };
}

// -----------------------------------------------------------------------
// Flujo: buscar_contactos
// Búsqueda de texto completo (Postgres tsvector) sobre el histórico de
// mensajes ya persistido por el workflow de sync — NO vuelve a llamar a
// la IA ni a WAHA en vivo, por eso responde en milisegundos incluso con
// miles de mensajes acumulados. Si no hay resultados, ofrece de una el
// flujo de importar/sincronizar contactos (que es lo que llena esta
// tabla), en vez de solo avisar que no encontró nada.
// -----------------------------------------------------------------------

const MAX_RESULTADOS_BUSQUEDA = 15;

async function buscarContactosPorTema(consulta: string): Promise<IAResponse> {
  const tenantId = await resolverTenantId();
  if (!tenantId) {
    return {
      text: "No pude identificar tu cuenta. Probá recargar la página e intentar de nuevo.",
      flowState: IA_FLOW_IDLE,
    };
  }

  const supabase = await createClient();

  // to_tsquery con websearch_to_tsquery permite escribir la consulta en
  // lenguaje natural ("coca cola", "casas de 3 ambientes") sin que el
  // usuario tenga que aprender la sintaxis de tsquery de Postgres.
  const { data: rows, error } = await supabase.rpc("buscar_mensajes_historico", {
    p_tenant_id: tenantId,
    p_consulta: consulta,
    p_limite: MAX_RESULTADOS_BUSQUEDA,
  });

  if (error) {
    console.error("[IA] Error en buscar_mensajes_historico:", error);
    return {
      text: "Tuve un problema buscando en tus conversaciones. Probá de nuevo en un momento.",
      flowState: IA_FLOW_IDLE,
      error: error.message,
    };
  }

  const resultados = (rows ?? []) as {
    contacto_id: string | null;
    nombre: string | null;
    telefono: string;
    menciones: number;
    fragmento: string;
  }[];

  if (resultados.length === 0) {
    return {
      text: `No encontré ningún contacto que haya hablado de "${consulta}". Puede ser que todavía no hayas importado/sincronizado tus contactos, o que ese tema no haya salido en las conversaciones que ya tenemos guardadas. ¿Querés que importe y analice tus contactos ahora?`,
      payload: {
        kind: "confirmar_importar_contactos",
        diasAnalisis: IMPORT_DIAS_DEFAULT,
        limiteContactos: IMPORT_LIMITE_DEFAULT,
      },
      flowState: {
        kind: "importar_contactos",
        step: "importar_esperando_confirmacion",
        draft: { diasAnalisis: IMPORT_DIAS_DEFAULT, limiteContactos: IMPORT_LIMITE_DEFAULT },
      },
    };
  }

  return {
    text: `Encontré ${resultados.length} contacto${resultados.length === 1 ? "" : "s"} que hablaron de "${consulta}":`,
    payload: {
      kind: "resultados_busqueda_contactos",
      consulta,
      resultados: resultados.map((r) => ({
        contactoId: r.contacto_id,
        nombre: r.nombre ?? "Sin nombre",
        telefono: r.telefono,
        menciones: r.menciones,
        fragmento: r.fragmento,
      })),
    },
    flowState: IA_FLOW_IDLE,
  };
}

/**
 * Se llama cuando el usuario toca "Crear audiencia con estos contactos" desde
 * la tarjeta de resultados de búsqueda. Reutiliza el flujo de crear_audiencia
 * ya existente, preseleccionando los contactos encontrados — mismo patrón
 * que la búsqueda por IA dentro de handleCrearAudienciaStep, pero acá los IDs
 * ya vienen resueltos de la búsqueda de texto, sin correr análisis de IA
 * de nuevo.
 */
export async function iniciarAudienciaDesdeResultadosBusquedaAction(
  consulta: string,
  contactosIds: string[],
): Promise<IAResponse> {
  if (contactosIds.length === 0) {
    return {
      text: "No hay contactos para agrupar en estos resultados.",
      flowState: IA_FLOW_IDLE,
    };
  }

  return {
    text: `Dale, armemos una audiencia con estos ${contactosIds.length} contacto${contactosIds.length === 1 ? "" : "s"}. ¿Cómo querés que se llame?`,
    flowState: {
      kind: "crear_audiencia",
      step: "audiencia_esperando_nombre",
      draft: { consultaUsada: consulta, contactosIds, contactosIdsResueltos: true },
    },
  };
}
