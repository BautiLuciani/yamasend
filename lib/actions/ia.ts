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
// Clasificador de intención — INACTIVO desde que el agente maneja también
// las acciones.
//
// Se retiró del dispatcher porque interceptaba los pedidos ANTES que el
// agente y perdía el contexto de la conversación: "creá una audiencia con
// los fríos que me mostraste" se clasificaba como crear_audiencia y
// arrancaba el flujo desde cero, sin saber a qué contactos se refería el
// usuario. Ahora el agente ve todo y llama a abrir_flujo /
// crear_audiencia_con_estos_contactos cuando corresponde.
//
// Se conserva porque es un detector barato (gpt-4o-mini) que sirve de
// respaldo si alguna vez se quiere pre-rutear acciones evidentes sin pagar
// una llamada al agente.
// -----------------------------------------------------------------------
type Intencion =
  | { tipo: "crear_audiencia"; consulta: string | null }
  | { tipo: "crear_template" }
  | { tipo: "crear_campana" }
  | { tipo: "importar_contactos" }
  | { tipo: "conversar" };

// eslint-disable-next-line @typescript-eslint/no-unused-vars
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
        content: `Sos el detector de acciones del chat de IA de YamaSend, una plataforma de mensajería masiva por WhatsApp.

Tu única tarea es decidir si el último mensaje del usuario pide EJECUTAR una de estas 4 acciones concretas, o si es cualquier otra cosa. Devolvé ÚNICAMENTE un JSON con esta forma exacta:

{"tipo": "crear_audiencia" | "crear_template" | "crear_campana" | "importar_contactos" | "conversar", "consulta": string | null}

- "crear_audiencia": pide CREAR/ARMAR una audiencia o lista de contactos (ej: "creame una audiencia con los que preguntaron por X", "armá una lista nueva").
  - Si especificó un criterio de selección, poné ese criterio en "consulta". Si no, null.
- "crear_template": pide CREAR/REDACTAR un template o mensaje para mandar a aprobar a Meta.
- "crear_campana": pide ARMAR o ENVIAR una campaña.
- "importar_contactos": pide IMPORTAR o SINCRONIZAR sus contactos de WhatsApp.
- "conversar": TODO lo demás. Incluye saludos, charla, y MUY IMPORTANTE: cualquier PREGUNTA sobre sus datos (cuántas audiencias tengo, cuál campaña rindió mejor, pasame los contactos fríos, quiénes hablaron de X, cuánto gasté, cuál es el mejor horario...). Preguntar POR datos no es lo mismo que pedir CREAR algo.

Regla clave: solo devolvé una de las 4 acciones si el usuario pide claramente EJECUTAR esa acción. Ante la duda, "conversar".

Para "crear_template", "crear_campana", "importar_contactos" y "conversar", "consulta" siempre va null.
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
    return { tipo: "conversar" };
  } catch {
    return { tipo: "conversar" };
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
  nombreUsuario: string | null;
  nombreEmpresa: string | null;
  rubro: string;
  descripcionNegocio: string;
  publicoObjetivo: string;
  tonoComunicacion: string;
  diferenciales: string;
}

async function resolverContextoNegocio(): Promise<ContextoNegocio | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: cliente } = await supabase
    .from("yamas_inmo_clientes")
    .select(
      "contacto_nombre, nombre_empresa, rubro, descripcion_negocio, publico_objetivo, tono_comunicacion, diferenciales",
    )
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (!cliente) return null;

  return {
    nombreUsuario: cliente.contacto_nombre ?? null,
    nombreEmpresa: cliente.nombre_empresa ?? null,
    rubro: cliente.rubro ?? "",
    descripcionNegocio: cliente.descripcion_negocio ?? "",
    publicoObjetivo: cliente.publico_objetivo ?? "",
    tonoComunicacion: cliente.tono_comunicacion ?? "",
    diferenciales: cliente.diferenciales ?? "",
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

/**
 * Resuelve el id real de yamas_send_leads para cada teléfono recién
 * analizado por syncAndAnalyzeAction (que solo devuelve teléfonos, ya que
 * el upsert ocurre server-side en el workflow de n8n). Mismo id que ya usa
 * el resto del flujo de audiencias (preseleccionarPorConsulta, etc.).
 */
async function resolverLeadsPorTelefono(
  tenantId: string,
  leads: { telefono: string; nombre: string | null; temperatura: "caliente" | "tibio" | "frio" }[],
): Promise<{ contactoId: string; nombre: string; telefono: string; temperatura: "caliente" | "tibio" | "frio" }[]> {
  if (leads.length === 0) return [];

  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("yamas_send_leads")
    .select("id, telefono, nombre")
    .eq("tenant_id", tenantId)
    .in(
      "telefono",
      leads.map((l) => l.telefono),
    );

  if (!rows) return [];

  const porTelefono = new Map(rows.map((r) => [r.telefono, r]));

  return leads
    .map((l) => {
      const row = porTelefono.get(l.telefono);
      if (!row) return null;
      return {
        contactoId: row.id,
        nombre: l.nombre || row.nombre || "Sin nombre",
        telefono: l.telefono,
        temperatura: l.temperatura,
      };
    })
    .filter((l): l is NonNullable<typeof l> => l !== null);
}

// -----------------------------------------------------------------------
// Detección determinística (sin LLM) de pedidos tipo "armá una audiencia
// con los calientes que acabás de importar". Se chequea ANTES del
// clasificador de intención por dos motivos: es gratis/instantáneo, y
// depende de un dato (draft.ultimaImportacion) que el clasificador no
// conoce y no tendría cómo usar aunque detectara la intención correcta.
// Requiere:
//   1) alguna palabra que refiera a la importación reciente ("importé",
//      "importaste", "acabo de importar", "sincronicé", etc.)
//   2) opcionalmente, un filtro de temperatura ("calientes", "tibios",
//      "fríos"/"frios") — si no hay filtro, se toman todos los importados.
// Si (1) no matchea, no se activa esta rama y el mensaje sigue el camino
// normal (clasificarIntencion), aunque haya una importación reciente en el
// draft — evita falsos positivos con mensajes que no la mencionan.
// -----------------------------------------------------------------------
const REGEX_REFERENCIA_IMPORTACION =
  /import(e|é|aste|ados?)|sincron(ice|icé|izaste|izados?)|acab[oa]s?\s+de\s+(importar|sincronizar)/i;

function detectarFiltroTemperatura(
  texto: string,
): "caliente" | "tibio" | "frio" | null {
  if (/calient/i.test(texto)) return "caliente";
  if (/tibi/i.test(texto)) return "tibio";
  if (/fr[ií]/i.test(texto)) return "frio";
  return null;
}

function intentaAudienciaDesdeUltimaImportacion(
  texto: string,
  flowState: IAFlowState,
): IAResponse | null {
  const ultimaImportacion = flowState.draft.ultimaImportacion;
  if (!ultimaImportacion || ultimaImportacion.length === 0) return null;
  if (!REGEX_REFERENCIA_IMPORTACION.test(texto)) return null;

  const filtroTemp = detectarFiltroTemperatura(texto);
  const seleccionados = filtroTemp
    ? ultimaImportacion.filter((c) => c.temperatura === filtroTemp)
    : ultimaImportacion;

  if (seleccionados.length === 0) {
    const etiqueta = filtroTemp === "caliente" ? "calientes" : filtroTemp === "tibio" ? "tibios" : "fríos";
    return {
      text: `De los contactos que importé recién no encontré ninguno ${etiqueta}. ¿Querés que arme la audiencia con todos igual?`,
      flowState,
    };
  }

  return {
    text: `Dale, armemos una audiencia con ${filtroTemp ? `los ${seleccionados.length} contactos ${filtroTemp === "caliente" ? "calientes" : filtroTemp === "tibio" ? "tibios" : "fríos"}` : `los ${seleccionados.length} contactos`} que acabo de importar. ¿Cómo querés que se llame?`,
    flowState: {
      kind: "crear_audiencia",
      step: "audiencia_esperando_nombre",
      draft: {
        contactosIds: seleccionados.map((c) => c.contactoId),
        contactosIdsResueltos: true,
      },
    },
  };
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

  // ---- Sin flujo activo, pero con una importación reciente disponible ---
  // (ver comentario de intentaAudienciaDesdeUltimaImportacion más arriba)
  if (!flowState.kind) {
    const respuestaImportacion = intentaAudienciaDesdeUltimaImportacion(texto, flowState);
    if (respuestaImportacion) return respuestaImportacion;
  }

  // ---- Sin flujo activo: todo va al agente -----------------------------
  //
  // Antes había acá un clasificador que decidía si el mensaje pedía una
  // acción (y disparaba el flujo correspondiente) o si era una pregunta.
  // Se eliminó porque interceptaba pedidos que dependían del contexto de
  // la conversación: "creá una audiencia con los fríos que me mostraste"
  // se clasificaba como crear_audiencia y arrancaba el flujo desde cero,
  // perdiendo justamente los contactos que el usuario estaba señalando.
  //
  // Ahora el agente ve todo y decide con contexto completo: responde
  // preguntas con sus herramientas de datos, y para las acciones llama a
  // crear_audiencia_con_estos_contactos o abrir_flujo, que le entregan el
  // control a la misma máquina de estados de siempre (con su confirmación
  // paso a paso intacta).
  const contextoNegocio = await resolverContextoNegocio();
  const tenantId = await resolverTenantId();
  try {
    return await responderConAgente(texto, history, contextoNegocio, tenantId);
  } catch (e) {
    console.error("[IA] Error en responderConAgente:", e);
    return {
      text: "Se me complicó procesar eso. ¿Probamos de nuevo en un momento?",
      flowState: IA_FLOW_IDLE,
      error: e instanceof Error ? e.message : "Error desconocido",
    };
  }
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

  // Resolvemos el id real de yamas_send_leads para cada teléfono analizado,
  // para poder mostrarlos en una tarjeta seleccionable y, si el usuario pide
  // "armá una audiencia con estos", reusar directo el flujo de crear_audiencia
  // sin tener que volver a preguntarle nada.
  const tenantId = await resolverTenantId();
  const contactosImportados =
    tenantId && result.leads && result.leads.length > 0
      ? await resolverLeadsPorTelefono(tenantId, result.leads)
      : [];

  return {
    text:
      result.contactosAnalizados > 0
        ? `Listo, analicé ${result.contactosAnalizados} conversaciones y encontré ${result.leadsIdentificados} leads con interés. Elegí de la lista de abajo, o pedime algo como "armá una audiencia con los calientes que acabás de importar".`
        : `Terminé de revisar, pero no encontré contactos con mensajes en ese rango. ${result.mensaje ?? ""}`.trim(),
    payload: {
      kind: "importacion_completada",
      contactosAnalizados: result.contactosAnalizados,
      leadsIdentificados: result.leadsIdentificados,
      contactosProcesados: result.contactosProcesados,
      contactosImportados,
    },
    // IA_FLOW_IDLE pero conservando el detalle de esta importación en el
    // draft, para que un mensaje de texto libre posterior ("armá audiencia
    // con los calientes que importaste") pueda encontrarlo — ver
    // detectarPedidoAudienciaDesdeImportacion en clasificarIntencion.
    flowState: {
      kind: null,
      step: null,
      draft: { ultimaImportacion: contactosImportados },
    },
  };
}

/**
 * Se llama cuando el usuario toca "Crear audiencia con seleccionados" desde
 * la tarjeta de contactos importados. Mismo patrón que
 * iniciarAudienciaDesdeResultadosBusquedaAction: los ids ya vienen resueltos,
 * así que saltamos directo a pedir el nombre sin volver a analizar nada.
 */
export async function iniciarAudienciaDesdeImportacionAction(
  contactosIds: string[],
): Promise<IAResponse> {
  if (contactosIds.length === 0) {
    return {
      text: "No hay contactos seleccionados para agrupar.",
      flowState: IA_FLOW_IDLE,
    };
  }

  return {
    text: `Dale, armemos una audiencia con estos ${contactosIds.length} contacto${contactosIds.length === 1 ? "" : "s"}. ¿Cómo querés que se llame?`,
    flowState: {
      kind: "crear_audiencia",
      step: "audiencia_esperando_nombre",
      draft: { contactosIds, contactosIdsResueltos: true },
    },
  };
}

// -----------------------------------------------------------------------
// Flujo: buscar_contactos — INACTIVO desde la migración al agente de datos.
//
// El agente cubre ahora la búsqueda por tema con su herramienta
// buscar_en_conversaciones (misma RPC buscar_mensajes_historico por debajo),
// así que esta función ya no se llama desde el dispatcher. Se conserva
// porque devuelve el payload "resultados_busqueda_contactos", que trae el
// botón "Crear audiencia con estos contactos" — una UX que el agente
// todavía no replica. Si más adelante se quiere volver a ofrecer ese botón
// tras una búsqueda, esto ya está listo para reconectar.
//
// Mientras tanto, el equivalente funcional sigue disponible por otro
// camino: pedir "creá una audiencia con los que hablaron de X" dispara el
// flujo crear_audiencia, que preselecciona contactos por esa consulta.
// -----------------------------------------------------------------------

const MAX_RESULTADOS_BUSQUEDA = 15;

// eslint-disable-next-line @typescript-eslint/no-unused-vars
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

// =======================================================================
// AGENTE DE DATOS
//
// Reemplaza el enfoque anterior ("clasificar la pregunta en un casillero
// fijo -> elegir UNA función -> devolver un texto pre-escrito"), que fallaba
// de forma sistemática: cualquier pregunta para la que no existiera una
// función exacta terminaba ejecutando la más parecida y devolviendo datos
// que no tenían nada que ver con lo preguntado.
//
// Acá el modelo recibe un conjunto de herramientas de datos COMPONIBLES
// (listar audiencias, contactos, templates, campañas, buscar en
// conversaciones, métricas agregadas), las llama las veces que haga falta,
// mira los datos reales que vuelven, y ESCRIBE LA RESPUESTA ÉL MISMO.
//
// Lo que se mantiene igual que antes, deliberadamente:
// - El modelo NUNCA genera SQL. Solo elige qué función llamar y con qué
//   parámetros; toda la SQL vive en funciones fijas de Postgres.
// - Todas las funciones filtran por tenant_id resuelto server-side desde
//   la sesión, nunca desde el texto del usuario.
// - Los flujos de ACCIÓN (crear audiencia/template/campaña, importar) NO
//   pasan por acá: siguen usando la máquina de estados determinística, que
//   funciona bien y tiene UI de confirmación paso a paso.
// =======================================================================

const MAX_ITERACIONES_AGENTE = 5;
const MAX_FILAS_TABLA = 12;

const HERRAMIENTAS_AGENTE: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "listar_audiencias",
      description:
        "Lista las audiencias (listas de contactos) de la cuenta, con su cantidad de contactos y fecha de creación. Usar para cualquier pregunta sobre audiencias: cuántas hay, cuál tiene más/menos contactos, cuál fue la primera o la última, listarlas todas.",
      parameters: {
        type: "object",
        properties: {
          orden_por: {
            type: "string",
            enum: ["fecha", "contactos", "nombre"],
            description: "Criterio de orden. 'contactos' para saber cuál tiene más/menos.",
          },
          direccion: {
            type: "string",
            enum: ["asc", "desc"],
            description: "'asc' para la más antigua/la de menos contactos primero, 'desc' para la más reciente/la de más contactos.",
          },
          limite: { type: "integer", description: "Máximo de filas a traer (1-100). Usá un número alto si te preguntan por el total." },
        },
        required: ["orden_por", "direccion", "limite"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "listar_contactos",
      description:
        "Lista los contactos/leads de la cuenta, opcionalmente filtrados por temperatura (caliente/tibio/frio). Usar para 'pasame los contactos fríos', 'cuáles son mis leads calientes', 'cuántos contactos tengo', 'quién está hace más tiempo sin responder'. NO usar para buscar por tema de conversación (para eso está buscar_en_conversaciones).",
      parameters: {
        type: "object",
        properties: {
          temperatura: {
            type: "string",
            enum: ["caliente", "tibio", "frio"],
            description: "Filtro opcional por temperatura del lead. Omitir para traer todos.",
          },
          orden_por: {
            type: "string",
            enum: ["score", "reciente", "nombre"],
            description: "'score' por nivel de interés, 'reciente' por último mensaje.",
          },
          limite: { type: "integer", description: "Máximo de filas (1-200)." },
        },
        required: ["orden_por", "limite"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "listar_templates",
      description:
        "Lista los templates de mensajes de la cuenta con su estado de aprobación de Meta. Estados posibles: 'borrador' (no enviado a Meta), 'enviado' (en revisión), 'verificado' (aprobado), 'rechazado', 'error'. Usar para 'cuántos templates aprobados tengo', 'qué templates me rechazaron y por qué', 'listame mis templates'.",
      parameters: {
        type: "object",
        properties: {
          status: {
            type: "string",
            enum: ["borrador", "enviado", "verificado", "rechazado", "error"],
            description: "Filtro opcional por estado. Omitir para traer todos.",
          },
          limite: { type: "integer", description: "Máximo de filas (1-100)." },
        },
        required: ["limite"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "listar_campanas",
      description:
        "Lista campañas con sus métricas reales (enviados, entregados, leídos, respondidos, costo, tasa de respuesta). Usar para 'cuál campaña rindió mejor', 'cuál fue la primera/última campaña', 'cuántas campañas tengo', 'listame las campañas de este mes'. Las fechas son opcionales: omitilas para buscar en todo el historial.",
      parameters: {
        type: "object",
        properties: {
          desde: { type: "string", description: "Fecha inicio ISO 8601 (YYYY-MM-DD). Omitir para no filtrar." },
          hasta: { type: "string", description: "Fecha fin ISO 8601 (YYYY-MM-DD), exclusiva. Omitir para no filtrar." },
          orden_por: {
            type: "string",
            enum: ["fecha", "tasa_respuesta", "contactos", "costo"],
            description: "Criterio de orden. 'tasa_respuesta' para saber cuál rindió mejor.",
          },
          direccion: { type: "string", enum: ["asc", "desc"], description: "'asc' para la primera/más antigua." },
          limite: { type: "integer", description: "Máximo de filas (1-100)." },
        },
        required: ["orden_por", "direccion", "limite"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "buscar_en_conversaciones",
      description:
        "Busca un TEMA o PALABRA CLAVE dentro del historial real de conversaciones de WhatsApp con los contactos, y devuelve qué contactos hablaron de eso. Usar SOLO para temas de conversación ('quiénes preguntaron por departamentos', 'quién habló de Coca-Cola'). NO usar para filtrar por atributos del contacto como temperatura — para eso está listar_contactos.",
      parameters: {
        type: "object",
        properties: {
          consulta: { type: "string", description: "El tema o palabra clave a buscar en los mensajes." },
        },
        required: ["consulta"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "metricas_periodo",
      description:
        "Métricas agregadas de mensajería en un rango de fechas: mensajes enviados/entregados/leídos/respondidos, tasas y gasto total en dólares. Usar para 'cuánto gasté', 'cómo me fue este mes', 'cuál es mi tasa de respuesta'.",
      parameters: {
        type: "object",
        properties: {
          desde: { type: "string", description: "Fecha inicio ISO 8601 (YYYY-MM-DD)." },
          hasta: { type: "string", description: "Fecha fin ISO 8601 (YYYY-MM-DD), exclusiva." },
        },
        required: ["desde", "hasta"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "mejor_horario_envio",
      description:
        "Analiza el historial de envíos y devuelve la franja horaria con mejor tasa de lectura y respuesta. Usar para 'cuál es el mejor horario para enviar', 'cuándo conviene mandar la campaña'. Puede devolver que no hay datos suficientes todavía.",
      parameters: { type: "object", properties: {} },
    },
  },
  // --- Herramientas de ACCIÓN ------------------------------------------
  // A diferencia de las de arriba (que devuelven datos y dejan que el
  // agente siga razonando), estas ENTREGAN el control a la máquina de
  // estados determinística: cortan el loop del agente y devuelven un
  // flowState con su UI de confirmación paso a paso. El agente nunca crea
  // ni envía nada por su cuenta — solo abre el flujo correspondiente, y el
  // usuario confirma en pantalla. Esto es deliberado: una alucinación del
  // modelo no puede terminar en una campaña enviada a contactos reales.
  {
    type: "function",
    function: {
      name: "crear_audiencia_con_estos_contactos",
      description:
        "Abre el flujo de creación de audiencia con contactos concretos. Hay dos formas de indicar los contactos, y conviene usar la que corresponda:\n- filtro_temperatura: la MÁS confiable. Resuelve los contactos en el momento contra la base (ej: el usuario pide una audiencia con 'los calientes' o 'los fríos'). Usala siempre que el grupo se pueda describir por temperatura.\n- contacto_ids: solo si los ids salen de un resultado de listar_contactos o buscar_en_conversaciones de ESTE MISMO turno. Los ids NO sobreviven entre mensajes: si el usuario se refiere a contactos de un mensaje anterior, volvé a consultarlos con la herramienta correspondiente antes de usar esta.",
      parameters: {
        type: "object",
        properties: {
          nombre: {
            type: "string",
            description: "Nombre sugerido para la audiencia. Si el usuario no dijo uno, proponé uno descriptivo y corto.",
          },
          filtro_temperatura: {
            type: "string",
            enum: ["caliente", "tibio", "frio"],
            description: "Incluye todos los contactos activos con esta temperatura, resueltos server-side.",
          },
          contacto_ids: {
            type: "array",
            items: { type: "string" },
            description: "IDs de contactos de una consulta hecha en este mismo turno. Omitir si usás filtro_temperatura.",
          },
        },
        required: ["nombre"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "abrir_flujo",
      description:
        "Abre uno de los asistentes guiados de la plataforma cuando el usuario pide hacer esa acción pero no hay contactos concretos ya identificados. 'crear_audiencia' para armar una lista (podés pasar un criterio en lenguaje natural), 'crear_template' para redactar un mensaje y mandarlo a aprobar a Meta, 'crear_campana' para armar un envío, 'importar_contactos' para sincronizar los contactos de WhatsApp.",
      parameters: {
        type: "object",
        properties: {
          flujo: {
            type: "string",
            enum: ["crear_audiencia", "crear_template", "crear_campana", "importar_contactos"],
            description: "Cuál asistente abrir.",
          },
          criterio: {
            type: "string",
            description: "Solo para 'crear_audiencia': criterio de selección en lenguaje natural, si el usuario dio uno (ej: 'los que preguntaron por departamentos').",
          },
        },
        required: ["flujo"],
      },
    },
  },
];

/** Resultado de ejecutar una herramienta: datos crudos para el modelo + tabla opcional para la UI. */
interface ResultadoHerramienta {
  datos: unknown;
  tabla?: { titulo: string; columnas: string[]; filas: string[][]; totalDisponible?: number };
  // Si viene, corta el loop del agente y esta respuesta se devuelve tal cual
  // al usuario. Lo usan las herramientas de ACCIÓN, que entregan el control
  // a la máquina de estados con su UI de confirmación.
  accion?: IAResponse;
}

function fechaCorta(v: string | null | undefined): string {
  if (!v) return "—";
  return new Date(v).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function pct(v: number | null | undefined): string {
  if (v == null) return "—";
  return `${(Number(v) * 100).toFixed(1)}%`;
}

/**
 * Ejecuta una herramienta del agente contra Supabase. Todas las funciones
 * son RPCs fijas con tenant_id resuelto server-side — el modelo solo elige
 * cuál llamar y con qué parámetros, nunca escribe SQL.
 */
async function ejecutarHerramientaAgente(
  nombre: string,
  args: Record<string, unknown>,
  tenantId: string,
): Promise<ResultadoHerramienta> {
  const supabase = await createClient();

  if (nombre === "listar_audiencias") {
    const { data, error } = await supabase.rpc("listar_audiencias", {
      p_tenant_id: tenantId,
      p_orden_por: typeof args.orden_por === "string" ? args.orden_por : "fecha",
      p_direccion: typeof args.direccion === "string" ? args.direccion : "desc",
      p_limite: typeof args.limite === "number" ? args.limite : 20,
    });
    if (error) return { datos: { error: error.message } };
    const filas = (data ?? []) as { nombre: string; contactos_count: number; status: string; created_at: string }[];
    return {
      datos: filas,
      tabla: filas.length
        ? {
            titulo: "Tus audiencias",
            columnas: ["Audiencia", "Contactos", "Creada"],
            filas: filas.slice(0, MAX_FILAS_TABLA).map((f) => [
              f.nombre,
              String(f.contactos_count ?? 0),
              fechaCorta(f.created_at),
            ]),
            totalDisponible: filas.length,
          }
        : undefined,
    };
  }

  if (nombre === "listar_contactos") {
    const { data, error } = await supabase.rpc("listar_contactos", {
      p_tenant_id: tenantId,
      p_temperatura: typeof args.temperatura === "string" ? args.temperatura : null,
      p_orden_por: typeof args.orden_por === "string" ? args.orden_por : "score",
      p_limite: typeof args.limite === "number" ? args.limite : 50,
    });
    if (error) return { datos: { error: error.message } };
    const filas = (data ?? []) as {
      nombre: string; telefono: string; temperatura: string; score_interes: number;
      producto_servicio: string | null; dias_inactivo: number | null;
    }[];
    return {
      datos: filas,
      tabla: filas.length
        ? {
            titulo:
              typeof args.temperatura === "string"
                ? `Contactos ${args.temperatura === "frio" ? "fríos" : args.temperatura === "caliente" ? "calientes" : "tibios"}`
                : "Tus contactos",
            columnas: ["Nombre", "Teléfono", "Temp."],
            filas: filas.slice(0, MAX_FILAS_TABLA).map((f) => [
              f.nombre,
              f.telefono,
              f.temperatura ?? "—",
            ]),
            totalDisponible: filas.length,
          }
        : undefined,
    };
  }

  if (nombre === "listar_templates") {
    const { data, error } = await supabase.rpc("listar_templates", {
      p_tenant_id: tenantId,
      p_status: typeof args.status === "string" ? args.status : null,
      p_limite: typeof args.limite === "number" ? args.limite : 30,
    });
    if (error) return { datos: { error: error.message } };
    const filas = (data ?? []) as {
      nombre: string; status: string; template_type: string | null;
      meta_rechazo_motivo: string | null; created_at: string;
    }[];
    return {
      datos: filas,
      tabla: filas.length
        ? {
            titulo: "Tus templates",
            columnas: ["Template", "Estado", "Creado"],
            filas: filas.slice(0, MAX_FILAS_TABLA).map((f) => [f.nombre, f.status ?? "—", fechaCorta(f.created_at)]),
            totalDisponible: filas.length,
          }
        : undefined,
    };
  }

  if (nombre === "listar_campanas") {
    const { data, error } = await supabase.rpc("listar_campanas", {
      p_tenant_id: tenantId,
      p_desde: typeof args.desde === "string" ? args.desde : null,
      p_hasta: typeof args.hasta === "string" ? args.hasta : null,
      p_orden_por: typeof args.orden_por === "string" ? args.orden_por : "fecha",
      p_direccion: typeof args.direccion === "string" ? args.direccion : "desc",
      p_limite: typeof args.limite === "number" ? args.limite : 20,
    });
    if (error) return { datos: { error: error.message } };
    const filas = (data ?? []) as {
      nombre: string; status: string; enviado_at: string; contactos_count: number;
      mensajes_ok: number; respondidos: number; tasa_respuesta: number; costo_usd: number | null;
    }[];
    return {
      datos: filas,
      tabla: filas.length
        ? {
            titulo: "Tus campañas",
            columnas: ["Campaña", "Enviada", "Mensajes", "Respuestas"],
            filas: filas.slice(0, MAX_FILAS_TABLA).map((f) => [
              f.nombre,
              fechaCorta(f.enviado_at),
              String(f.mensajes_ok ?? 0),
              `${f.respondidos ?? 0} (${pct(f.tasa_respuesta)})`,
            ]),
            totalDisponible: filas.length,
          }
        : undefined,
    };
  }

  if (nombre === "buscar_en_conversaciones") {
    const consulta = typeof args.consulta === "string" ? args.consulta : "";
    if (!consulta.trim()) return { datos: { error: "consulta vacía" } };
    const { data, error } = await supabase.rpc("buscar_mensajes_historico", {
      p_tenant_id: tenantId,
      p_consulta: consulta,
      p_limite: 15,
    });
    if (error) return { datos: { error: error.message } };
    const filas = (data ?? []) as { nombre: string; telefono: string; menciones: number; fragmento: string }[];
    return {
      datos: filas,
      tabla: filas.length
        ? {
            titulo: `Contactos que hablaron de "${consulta}"`,
            columnas: ["Nombre", "Teléfono", "Menciones"],
            filas: filas.slice(0, MAX_FILAS_TABLA).map((f) => [f.nombre, f.telefono, String(f.menciones)]),
            totalDisponible: filas.length,
          }
        : undefined,
    };
  }

  if (nombre === "metricas_periodo") {
    const { data, error } = await supabase
      .rpc("analytics_resumen_periodo", {
        p_tenant_id: tenantId,
        p_desde: typeof args.desde === "string" ? args.desde : new Date(Date.now() - 30 * 864e5).toISOString(),
        p_hasta: typeof args.hasta === "string" ? args.hasta : new Date().toISOString(),
      })
      .maybeSingle();
    if (error) return { datos: { error: error.message } };
    return { datos: data ?? {} };
  }

  if (nombre === "mejor_horario_envio") {
    const { data, error } = await supabase
      .rpc("analytics_mejor_horario_envio", { p_tenant_id: tenantId, p_minimo_muestras: 20 })
      .maybeSingle();
    if (error) return { datos: { error: error.message } };
    return { datos: data ?? {} };
  }

  if (nombre === "crear_audiencia_con_estos_contactos") {
    const nombreAudiencia =
      typeof args.nombre === "string" && args.nombre.trim()
        ? args.nombre.trim().slice(0, 120)
        : "Nueva audiencia";
    const idsPedidos = Array.isArray(args.contacto_ids)
      ? args.contacto_ids.filter((v): v is string => typeof v === "string")
      : [];
    const filtroTemp =
      typeof args.filtro_temperatura === "string" &&
      ["caliente", "tibio", "frio"].includes(args.filtro_temperatura)
        ? args.filtro_temperatura
        : null;

    // Camino robusto: si el agente indicó un filtro, resolvemos los
    // contactos acá contra la base. No depende de que el modelo acarree
    // ids entre turnos (cosa que no puede hacer: el historial que recibe
    // es solo texto, sin los resultados de herramientas de turnos
    // anteriores).
    let idsValidos: string[];

    if (filtroTemp) {
      const { data, error } = await supabase
        .from("yamas_send_leads")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("activo", true)
        .or(`temperatura_efectiva.eq.${filtroTemp},and(temperatura_efectiva.is.null,temperatura.eq.${filtroTemp})`)
        .limit(500);

      if (error) {
        return { datos: { error: "No se pudieron resolver los contactos por temperatura." } };
      }
      idsValidos = (data ?? []).map((r) => r.id as string);

      if (idsValidos.length === 0) {
        return {
          datos: { error: `No hay contactos con temperatura "${filtroTemp}" en la cuenta.` },
        };
      }
    } else {
      if (idsPedidos.length === 0) {
        return {
          datos: {
            error:
              "No indicaste contactos. Si el usuario se refiere a contactos de un mensaje anterior, volvé a consultarlos ahora con listar_contactos (o usá filtro_temperatura) y después llamá a esta herramienta.",
          },
        };
      }

      // Anti-alucinación: verificamos contra la base que TODOS los ids
      // existan y pertenezcan a este tenant, en vez de confiar en lo que
      // devolvió el modelo.
      const { data: existentes, error } = await supabase
        .from("yamas_send_leads")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("activo", true)
        .in("id", idsPedidos.slice(0, 500));

      if (error) {
        return { datos: { error: "No se pudieron validar los contactos." } };
      }

      idsValidos = (existentes ?? []).map((r) => r.id as string);

      if (idsValidos.length === 0) {
        return {
          datos: {
            error:
              "Esos ids no corresponden a contactos de la cuenta (los ids no sobreviven entre mensajes). Volvé a consultar los contactos ahora con listar_contactos — o usá filtro_temperatura si el grupo se puede describir por temperatura — y reintentá con los ids nuevos.",
          },
        };
      }
    }

    return {
      datos: { ok: true, contactos_incluidos: idsValidos.length },
      accion: {
        text: `Dale, armemos la audiencia "${nombreAudiencia}" con ${idsValidos.length} contacto${idsValidos.length === 1 ? "" : "s"}. Revisá la selección y confirmá.`,
        payload: {
          kind: "seleccionar_contactos",
          preselectedIds: idsValidos,
        },
        flowState: {
          kind: "crear_audiencia",
          step: "audiencia_esperando_contactos",
          draft: {
            nombre: nombreAudiencia,
            contactosIds: idsValidos,
            contactosIdsResueltos: true,
          },
        },
      },
    };
  }

  if (nombre === "abrir_flujo") {
    const flujo = typeof args.flujo === "string" ? args.flujo : "";
    const criterio =
      typeof args.criterio === "string" && args.criterio.trim() ? args.criterio.trim() : null;

    if (flujo === "crear_audiencia") {
      return { datos: { ok: true }, accion: await iniciarFlujoCrearAudiencia(criterio) };
    }
    if (flujo === "crear_template") {
      return { datos: { ok: true }, accion: iniciarFlujoCrearTemplate() };
    }
    if (flujo === "crear_campana") {
      return { datos: { ok: true }, accion: await iniciarFlujoCrearCampana() };
    }
    if (flujo === "importar_contactos") {
      return { datos: { ok: true }, accion: await iniciarFlujoImportarContactos() };
    }
    return { datos: { error: `Flujo desconocido: ${flujo}` } };
  }

  return { datos: { error: `Herramienta desconocida: ${nombre}` } };
}

/**
 * Punto de entrada del agente. Corre un loop de tool-calling: el modelo
 * pide datos, los recibe, y decide si necesita más o si ya puede responder.
 * Cubre TODO lo que no es un flujo de acción — desde "hola" hasta "cuál
 * audiencia tiene más contactos" — sin necesidad de clasificar la pregunta
 * de antemano en un casillero.
 */
async function responderConAgente(
  mensaje: string,
  history: IAHistoryTurn[],
  contexto: ContextoNegocio | null,
  tenantId: string | null,
): Promise<IAResponse> {
  const openai = getOpenAI();
  const hoy = new Date().toISOString().slice(0, 10);

  const lineasContexto = contexto
    ? [
        contexto.nombreUsuario && `El usuario se llama ${contexto.nombreUsuario}.`,
        contexto.nombreEmpresa && `Su empresa es "${contexto.nombreEmpresa}".`,
        contexto.rubro && `Rubro: ${contexto.rubro}.`,
        contexto.descripcionNegocio && `Descripción del negocio: ${contexto.descripcionNegocio}.`,
        contexto.publicoObjetivo && `Público objetivo: ${contexto.publicoObjetivo}.`,
        contexto.tonoComunicacion && `Tono que prefiere la marca: ${contexto.tonoComunicacion}.`,
        contexto.diferenciales && `Diferenciales del negocio: ${contexto.diferenciales}.`,
      ].filter(Boolean)
    : [];

  const systemPrompt = `Sos el asistente de YamaSend, una plataforma de mensajería masiva por WhatsApp. Estás charlando con el dueño o encargado de la cuenta, dentro del panel de la app. Hoy es ${hoy}.

CÓMO HABLAR
- Como una persona real: natural, cercano, español rioplatense (voseo: "vos", "tenés", "querés"). Nada de tono robótico ni de manual.
- Breve por defecto: 1-3 oraciones. Si mostrás datos, no repitas en el texto toda la tabla — resumí lo importante y dejá que la tabla hable.
- Usá el nombre del usuario solo cuando quede natural, no en cada mensaje.
${lineasContexto.length ? "\nDATOS REALES DE ESTA CUENTA\n" + lineasContexto.join("\n") : ""}

CÓMO RESPONDER PREGUNTAS SOBRE SUS DATOS
- Tenés herramientas para consultar los datos REALES de la cuenta. Usalas siempre que la pregunta sea sobre audiencias, contactos, templates, campañas, métricas o conversaciones.
- Elegí la herramienta y los parámetros que respondan EXACTAMENTE lo que se preguntó. Si preguntan "cuál audiencia tiene más contactos", ordená por contactos descendente. Si preguntan "la primera", ordená ascendente por fecha.
- Podés llamar varias herramientas si hace falta para responder bien.
- Después de recibir los datos, RESPONDÉ LA PREGUNTA CONCRETA que te hicieron. No vuelques todos los datos que trajiste si solo preguntaron un número.
- Si la herramienta devuelve una lista vacía, decilo con naturalidad — no inventes.

ACCIONES QUE PODÉS EJECUTAR
- Si el usuario pide armar una audiencia, usá crear_audiencia_con_estos_contactos.
- MUY IMPORTANTE: los resultados de las herramientas NO se guardan entre mensajes. Solo ves el texto de la conversación previa, no los datos que consultaste antes. Entonces, si el usuario dice "creá una audiencia con esos" refiriéndose a contactos de un mensaje anterior, PRIMERO volvé a consultarlos ahora (con listar_contactos o buscar_en_conversaciones) y recién después creá la audiencia. Si el grupo se puede describir por temperatura, es más simple y confiable usar el parámetro filtro_temperatura.
- Si una herramienta te devuelve un error, leelo y corregí en el mismo turno (por ejemplo, volviendo a consultar los datos). No le traslades el error al usuario si podés resolverlo vos.
- Si pide crear una audiencia/template/campaña o importar contactos sin referirse a contactos concretos, usá abrir_flujo.
- Estas acciones abren un asistente guiado donde el usuario confirma antes de que se cree nada. No prometas que ya lo hiciste: decí que se lo abrís para confirmar.
- Si el pedido es ambiguo (no sabés qué contactos incluir, o qué acción quiere), preguntá antes de abrir un flujo.

REGLAS ESTRICTAS
- NUNCA inventes números, nombres, fechas, IDs ni ningún dato de la cuenta. Todo dato concreto que digas tiene que venir de una herramienta que llamaste en este mismo turno.
- Si no tenés una herramienta que responda algo, decí con franqueza que ese dato todavía no lo podés consultar, en vez de responder con algo parecido pero distinto.`;

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...history.slice(-8).map((h) => ({
      role: h.role === "user" ? ("user" as const) : ("assistant" as const),
      content: h.text,
    })),
    { role: "user", content: mensaje },
  ];

  let ultimaTabla: ResultadoHerramienta["tabla"];

  for (let i = 0; i < MAX_ITERACIONES_AGENTE; i++) {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0.3,
      max_tokens: 500,
      // Sin tenant_id no podemos consultar nada: dejamos que responda solo
      // conversacionalmente en vez de fallar con un error técnico.
      tools: tenantId ? HERRAMIENTAS_AGENTE : undefined,
      messages,
    });

    const msg = completion.choices[0]?.message;
    if (!msg) break;

    const toolCalls = msg.tool_calls ?? [];

    if (toolCalls.length === 0) {
      const texto = msg.content?.trim();
      if (!texto) break;
      return {
        text: texto,
        payload: ultimaTabla ? { kind: "tabla_datos", ...ultimaTabla } : undefined,
        flowState: IA_FLOW_IDLE,
      };
    }

    messages.push(msg);

    for (const tc of toolCalls) {
      if (tc.type !== "function") continue;
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(tc.function.arguments || "{}");
      } catch {
        args = {};
      }

      let resultado: ResultadoHerramienta;
      try {
        resultado = await ejecutarHerramientaAgente(tc.function.name, args, tenantId as string);
      } catch (e) {
        console.error(`[IA] Error ejecutando herramienta ${tc.function.name}:`, e);
        resultado = { datos: { error: "No se pudo consultar ese dato." } };
      }

      // Herramienta de acción: cortamos el loop y entregamos el control a
      // la máquina de estados, que sigue desde acá con su UI de
      // confirmación paso a paso.
      if (resultado.accion) return resultado.accion;

      if (resultado.tabla) ultimaTabla = resultado.tabla;

      messages.push({
        role: "tool",
        tool_call_id: tc.id,
        content: JSON.stringify(resultado.datos).slice(0, 6000),
      });
    }
  }

  return {
    text: "Se me complicó procesar eso. ¿Me lo repetís de otra forma?",
    flowState: IA_FLOW_IDLE,
  };
}
