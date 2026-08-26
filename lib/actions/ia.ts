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
  | { tipo: "consulta_analitica"; pregunta: string }
  | { tipo: "charla"; mensaje: string }
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

{"tipo": "crear_audiencia" | "crear_template" | "crear_campana" | "importar_contactos" | "buscar_contactos" | "consulta_analitica" | "charla" | "otra", "consulta": string | null}

- "crear_audiencia": el usuario quiere armar/crear una lista o audiencia de contactos directamente (ej: "creame una audiencia con los que preguntaron por X", "quiero armar una audiencia nueva").
  - Si además especificó un criterio de selección en lenguaje natural, poné ese criterio tal cual en "consulta". Si no especificó ningún criterio, "consulta" debe ser null.
- "crear_template": el usuario quiere crear/redactar un template o mensaje para mandar a aprobar a Meta/WhatsApp.
- "crear_campana": el usuario quiere armar o enviar una campaña de mensajes.
- "importar_contactos": el usuario quiere importar, sincronizar o traer sus contactos de WhatsApp (ej: "importá mis contactos", "sincronizá mis chats", "traé mis contactos nuevos").
- "buscar_contactos": el usuario quiere VER o ENCONTRAR contactos según un tema que se haya hablado en las conversaciones, SIN pedir explícitamente crear una audiencia (ej: "mostrame los que hablamos de Coca-Cola", "quiénes preguntaron por el departamento de 3 ambientes", "buscá contactos que mencionaron descuentos"). La clave para diferenciarlo de "crear_audiencia": acá el usuario quiere VER/EXPLORAR resultados primero, no está pidiendo crear una audiencia de una.
  - En este caso, "consulta" es obligatorio: el tema o palabra clave que hay que buscar (ej: "coca cola", "departamento de 3 ambientes").
- "consulta_analitica": el usuario está preguntando por MÉTRICAS, DESEMPEÑO o HECHOS CONCRETOS sobre sus campañas/mensajes/gasto, incluyendo preguntas cronológicas (primera/última campaña), rankings de desempeño, conteos por tema, gasto en un período, o mejor horario de envío (ej: "cuál fue la primera campaña que envié", "cuál fue la campaña que mejor rindió este mes", "cuánto gasté la semana pasada", "a cuántos les mandé algo de la promo de verano", "cuál es el mejor horario para mandar campañas"). Si la pregunta es sobre SUS DATOS REALES en la plataforma (aunque no sepas si hay una función exacta para resolverla), preferí este tipo antes que "otra" — es mejor intentar buscar el dato real que asumir que no se puede.
  - En este caso, "consulta" es obligatorio: la pregunta del usuario tal cual la escribió (se usa después para extraer parámetros como fechas o temas).
- "charla": saludos, agradecimientos, despedidas, charla casual, preguntas sobre qué puede hacer el asistente, o cualquier mensaje conversacional que NO pide un dato concreto de la cuenta ni una acción del sistema (ej: "hola", "cómo andás", "gracias", "qué podés hacer", "buen día").
  - En este caso, "consulta" es obligatorio: el mensaje del usuario tal cual lo escribió.
- "otra": cualquier otra cosa que no encaje en ninguna de las anteriores.

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
    if (parsed.tipo === "consulta_analitica" && parsed.consulta) {
      return { tipo: "consulta_analitica", pregunta: String(parsed.consulta) };
    }
    if (parsed.tipo === "charla" && parsed.consulta) {
      return { tipo: "charla", mensaje: String(parsed.consulta) };
    }
    return { tipo: "otra" };
  } catch {
    return { tipo: "otra" };
  }
}

// -----------------------------------------------------------------------
// Flujo: charla
// Cubre saludos, charla casual, agradecimientos y cualquier mensaje que no
// pide una acción ni un dato concreto. A diferencia del resto del chat
// (máquina de estados determinística + RPCs), acá SÍ dejamos que el LLM
// redacte libremente el texto de respuesta — es la única rama donde eso es
// seguro, porque no hay ningún dato de negocio real que pueda inventarse:
// el prompt tiene una regla explícita para nunca afirmar un número, nombre
// de campaña, o hecho de la cuenta que no venga de una función anterior.
// Si el mensaje en realidad pedía un dato, ya no llega acá: lo intercepta
// "consulta_analitica" o "buscar_contactos" antes en el clasificador.
//
// gpt-4o-mini igual (mismo modelo barato que el resto del chat) — acá el
// costo es por redacción de tono, no por razonamiento complejo, así que no
// hace falta un modelo más caro.
// -----------------------------------------------------------------------
async function responderCharla(
  mensaje: string,
  history: IAHistoryTurn[],
  contexto: ContextoNegocio | null,
): Promise<IAResponse> {
  const openai = getOpenAI();

  const contextoHistorial = history
    .slice(-8)
    .map((h) => `${h.role === "user" ? "Usuario" : "Asistente"}: ${h.text}`)
    .join("\n");

  const lineasPersonalidad = contexto
    ? [
        contexto.nombreUsuario && `El usuario se llama ${contexto.nombreUsuario} — llamalo por su nombre de pila cuando quede natural, no en cada mensaje.`,
        contexto.nombreEmpresa && `Trabaja en/con la empresa "${contexto.nombreEmpresa}".`,
        contexto.rubro && `Rubro del negocio: ${contexto.rubro}.`,
        contexto.tonoComunicacion && `Tono de comunicación que prefiere la marca: ${contexto.tonoComunicacion}.`,
        contexto.diferenciales && `Diferenciales que destacan de su negocio: ${contexto.diferenciales}.`,
      ].filter(Boolean)
    : [];

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.6,
    max_tokens: 200,
    messages: [
      {
        role: "system",
        content: `Sos el asistente conversacional de YamaSend, una plataforma de mensajería masiva por WhatsApp. Estás charlando con el dueño o encargado de una cuenta de YamaSend, DENTRO del panel de la app.

Cómo hablar:
- Hablá como una persona real, natural y cercana, en español rioplatense (voseo: "vos", "tenés", "querés"). Nada de tono de manual ni de call center.
- Sé breve: 1-3 oraciones salvo que la situación pida más.
- No repitas el nombre del usuario en cada mensaje ni fuerces referencias a su negocio si no vienen a cuento — usalas solo cuando aporten calidez genuina.
${lineasPersonalidad.length ? "\nDatos reales de esta cuenta que podés usar para sonar más cercano (nunca inventes datos que no estén acá):\n" + lineasPersonalidad.join("\n") : ""}

Qué podés hacer (mencionalo SOLO si el usuario pregunta qué hacés o parece perdido, nunca como respuesta genérica a un saludo):
- Importar/sincronizar sus contactos de WhatsApp
- Crear audiencias, templates y campañas hablando en lenguaje natural
- Buscar contactos por tema en su historial de conversaciones
- Responder preguntas sobre el desempeño de sus campañas (mejor campaña, gasto, mejor horario para enviar, etc)

Reglas estrictas:
- NUNCA inventes ni afirmes un número, nombre de campaña, estadística o cualquier hecho concreto de la cuenta del usuario — no tenés acceso a esos datos acá. Si el usuario te pregunta algo así, decile amablemente que se lo buscás si te lo vuelve a pedir como pregunta (por ejemplo: "esa te la puedo averiguar, preguntame directamente por ese dato y te tiro los números reales").
- No prometas acciones que no podés cumplir vos mismo en este chat.`,
      },
      {
        role: "user",
        content: contextoHistorial
          ? `Historial reciente:\n${contextoHistorial}\n\nÚltimo mensaje del usuario: ${mensaje}`
          : mensaje,
      },
    ],
  });

  const texto =
    completion.choices[0]?.message?.content?.trim() ||
    "¡Hola! ¿En qué te ayudo hoy?";

  return { text: texto, flowState: IA_FLOW_IDLE };
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

  // ---- Sin flujo activo: clasificar intención --------------------------
  const contextoNegocioParaCharla = await resolverContextoNegocio();
  let intencion: Intencion;
  try {
    intencion = await clasificarIntencion(texto, history, contextoNegocioParaCharla);
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

  if (intencion.tipo === "consulta_analitica") {
    return responderConsultaAnalitica(intencion.pregunta);
  }

  if (intencion.tipo === "charla") {
    return responderCharla(intencion.mensaje, history, contextoNegocioParaCharla);
  }

  // "otra": red de seguridad para lo que ni siquiera "charla" pudo cubrir
  // (el clasificador no está seguro de qué es). Mismo tratamiento que
  // "charla" — nunca mostramos un manual de instrucciones frío acá tampoco,
  // pero sin el contexto conversacional adicional que sí usa "charla".
  return responderCharla(texto, history, contextoNegocioParaCharla);
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

// -----------------------------------------------------------------------
// Flujo: consulta_analitica
//
// Responde preguntas de negocio ("cuál campaña rindió mejor", "cuánto
// gasté", "a cuántos les mandé X", "mejor horario para enviar") llamando a
// una de 4 funciones SQL fijas (analytics_resumen_periodo,
// analytics_mejor_campana, analytics_mensajes_por_tema,
// analytics_mejor_horario_envio) — NUNCA generando SQL libre.
//
// El LLM solo elige CUÁL de las 4 llamar y con qué parámetros (function
// calling estructurado de OpenAI), igual que clasificarIntencion elige un
// tipo de intención. Nunca ve ni produce una sola línea de SQL. Esto es
// deliberado: es el patrón recomendado para NL-to-data en producción
// (separar decisión de ejecución, cero superficie de inyección) en vez de
// dejar que el modelo escriba queries contra la base real.
//
// Si el modelo no puede mapear la pregunta a ninguna de las 4 funciones
// (parámetros ambiguos, pregunta fuera de alcance), respondemos con lo más
// cercano que sabemos hacer en vez de inventar un número.
// -----------------------------------------------------------------------

type LlamadaAnalitica =
  | { funcion: "resumen_periodo"; desde: string; hasta: string }
  | { funcion: "mejor_campana"; desde: string; hasta: string; metrica: string }
  | { funcion: "primera_ultima_campana"; orden: "primera" | "ultima" }
  | { funcion: "mensajes_por_tema"; tema: string; dias: number }
  | { funcion: "mejor_horario_envio" };

const HERRAMIENTAS_ANALITICA: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "resumen_periodo",
      description:
        "Resumen agregado de mensajería en un rango de fechas: campañas enviadas, mensajes enviados/entregados/leídos/respondidos, tasas y gasto total. Usar para preguntas generales de desempeño en un período (\"cómo me fue este mes\", \"cuánto gasté la semana pasada\").",
      parameters: {
        type: "object",
        properties: {
          desde: { type: "string", description: "Fecha de inicio del período en formato ISO 8601 (YYYY-MM-DD)." },
          hasta: { type: "string", description: "Fecha de fin del período en formato ISO 8601 (YYYY-MM-DD), exclusiva." },
        },
        required: ["desde", "hasta"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "mejor_campana",
      description:
        "Ranking de campañas enviadas en un rango de fechas, ordenado por una métrica. Usar para \"cuál campaña rindió mejor\", \"qué campaña tuvo más respuestas\", \"cuál fue más barata por respuesta\".",
      parameters: {
        type: "object",
        properties: {
          desde: { type: "string", description: "Fecha de inicio en formato ISO 8601 (YYYY-MM-DD)." },
          hasta: { type: "string", description: "Fecha de fin en formato ISO 8601 (YYYY-MM-DD), exclusiva." },
          metrica: {
            type: "string",
            enum: ["tasa_respuesta", "tasa_lectura", "tasa_entrega", "costo_por_respuesta"],
            description: "Métrica para ordenar el ranking. Default tasa_respuesta si el usuario no especifica.",
          },
        },
        required: ["desde", "hasta", "metrica"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "primera_ultima_campana",
      description:
        "Devuelve la primera o la última campaña enviada, ORDENADA CRONOLÓGICAMENTE (por fecha de envío), sin importar su desempeño. Usar SIEMPRE que la pregunta sea sobre orden temporal y no sobre qué campaña rindió mejor (ej: \"cuál fue la primera campaña que envié\", \"cuál fue mi última campaña\", \"cuál fue la más reciente\"). No confundir con mejor_campana: esa ordena por métricas de desempeño, esta por fecha.",
      parameters: {
        type: "object",
        properties: {
          orden: {
            type: "string",
            enum: ["primera", "ultima"],
            description: "'primera' para la más antigua, 'ultima' para la más reciente.",
          },
        },
        required: ["orden"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "mensajes_por_tema",
      description:
        "Cuenta a cuántos contactos se les envió un mensaje sobre un tema puntual en los últimos N días. Usar para \"a cuántos les mandé algo sobre X\", \"cuántos contactos recibieron la promo de Y\".",
      parameters: {
        type: "object",
        properties: {
          tema: { type: "string", description: "El tema o palabra clave a buscar, tal cual lo mencionó el usuario." },
          dias: { type: "integer", description: "Cuántos días hacia atrás buscar. Default 7 si no se especifica." },
        },
        required: ["tema", "dias"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "mejor_horario_envio",
      description:
        "Analiza el histórico completo de envíos y sugiere la franja horaria con mejor tasa de lectura/respuesta. Usar para \"cuál es el mejor horario para enviar\", \"cuándo es mejor mandar mis campañas\". No requiere parámetros.",
      parameters: { type: "object", properties: {} },
    },
  },
];

async function elegirLlamadaAnalitica(
  pregunta: string,
): Promise<LlamadaAnalitica | null> {
  const openai = getOpenAI();
  const hoy = new Date().toISOString().slice(0, 10);

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0,
    tools: HERRAMIENTAS_ANALITICA,
    tool_choice: "auto",
    messages: [
      {
        role: "system",
        content: `Sos el módulo analítico del chat de IA de YamaSend. Tu única tarea es elegir cuál de las funciones disponibles responde mejor la pregunta del usuario y con qué parámetros, resolviendo fechas relativas ("este mes", "la semana pasada", "últimos 15 días") a fechas concretas ISO 8601. Hoy es ${hoy}. Si la pregunta menciona un período sin especificar, asumí el mes calendario en curso.

Importante: "primera"/"última" campaña (orden cronológico) usa primera_ultima_campana, NO mejor_campana (que ordena por desempeño) — son cosas distintas aunque suenen parecido.

Si NINGUNA de las funciones disponibles responde realmente lo que se pregunta, NO llames a ninguna — es preferible admitir que no tenés esa función a forzar la que más se parece. Nunca inventes datos: tu trabajo es solo elegir la función y los parámetros, no responder la pregunta vos mismo.`,
      },
      { role: "user", content: pregunta },
    ],
  });

  const toolCall = completion.choices[0]?.message?.tool_calls?.[0];
  if (!toolCall || toolCall.type !== "function") return null;

  let args: Record<string, unknown>;
  try {
    args = JSON.parse(toolCall.function.arguments);
  } catch {
    return null;
  }

  switch (toolCall.function.name) {
    case "resumen_periodo":
      if (typeof args.desde === "string" && typeof args.hasta === "string") {
        return { funcion: "resumen_periodo", desde: args.desde, hasta: args.hasta };
      }
      return null;
    case "mejor_campana":
      if (typeof args.desde === "string" && typeof args.hasta === "string") {
        return {
          funcion: "mejor_campana",
          desde: args.desde,
          hasta: args.hasta,
          metrica: typeof args.metrica === "string" ? args.metrica : "tasa_respuesta",
        };
      }
      return null;
    case "primera_ultima_campana":
      return {
        funcion: "primera_ultima_campana",
        orden: args.orden === "ultima" ? "ultima" : "primera",
      };
    case "mensajes_por_tema":
      if (typeof args.tema === "string" && args.tema.trim()) {
        return {
          funcion: "mensajes_por_tema",
          tema: args.tema,
          dias: typeof args.dias === "number" && args.dias > 0 ? Math.min(args.dias, 365) : 7,
        };
      }
      return null;
    case "mejor_horario_envio":
      return { funcion: "mejor_horario_envio" };
    default:
      return null;
  }
}

const FORMATO_PORCENTAJE = new Intl.NumberFormat("es-AR", {
  style: "percent",
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const FORMATO_USD = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
});

async function responderConsultaAnalitica(pregunta: string): Promise<IAResponse> {
  const tenantId = await resolverTenantId();
  if (!tenantId) {
    return {
      text: "No pude identificar tu cuenta. Probá recargar la página e intentar de nuevo.",
      flowState: IA_FLOW_IDLE,
    };
  }

  let llamada: LlamadaAnalitica | null;
  try {
    llamada = await elegirLlamadaAnalitica(pregunta);
  } catch (e) {
    console.error("[IA] Error en elegirLlamadaAnalitica:", e);
    return {
      text: "Tuve un problema para interpretar tu consulta. ¿Podés reformularla?",
      flowState: IA_FLOW_IDLE,
      error: e instanceof Error ? e.message : "Error desconocido",
    };
  }

  if (!llamada) {
    return {
      text: "Esa todavía no la sé responder con datos reales. Puedo contarte cosas como cuál fue tu primera o última campaña, cuál rindió mejor, cuánto gastaste en un período, a cuántos contactos les mandaste algo sobre un tema, o cuál es tu mejor horario para enviar — probá reformulando por ese lado.",
      flowState: IA_FLOW_IDLE,
    };
  }

  const supabase = await createClient();

  if (llamada.funcion === "resumen_periodo") {
    const { data: rawData, error } = await supabase
      .rpc("analytics_resumen_periodo", {
        p_tenant_id: tenantId,
        p_desde: llamada.desde,
        p_hasta: llamada.hasta,
      })
      .maybeSingle();

    if (error) {
      console.error("[IA] Error en analytics_resumen_periodo:", error);
      return {
        text: "Tuve un problema para calcular ese resumen. Probá de nuevo en un momento.",
        flowState: IA_FLOW_IDLE,
        error: error.message,
      };
    }

    // Cast manual: la función es nueva y no está reflejada en los tipos
    // generados de Supabase (mismo patrón que buscar_mensajes_historico
    // más arriba en este archivo).
    const data = rawData as {
      campanas_enviadas: number;
      mensajes_enviados: number;
      mensajes_entregados: number;
      mensajes_leidos: number;
      mensajes_respondidos: number;
      mensajes_error: number;
      costo_total_usd: number;
      tasa_entrega: number;
      tasa_lectura: number;
      tasa_respuesta: number;
    } | null;

    if (!data || data.mensajes_enviados === 0) {
      return {
        text: `No encontré mensajes enviados entre el ${llamada.desde} y el ${llamada.hasta}. Probá con otro período, o mandá tu primera campaña para empezar a ver datos acá.`,
        flowState: IA_FLOW_IDLE,
      };
    }

    return {
      text: `Así te fue entre el ${llamada.desde} y el ${llamada.hasta}:`,
      payload: {
        kind: "respuesta_analitica",
        titulo: "Resumen del período",
        filas: [
          { etiqueta: "Campañas enviadas", valor: String(data.campanas_enviadas) },
          { etiqueta: "Mensajes enviados", valor: String(data.mensajes_enviados) },
          { etiqueta: "Tasa de entrega", valor: FORMATO_PORCENTAJE.format(Number(data.tasa_entrega)) },
          { etiqueta: "Tasa de lectura", valor: FORMATO_PORCENTAJE.format(Number(data.tasa_lectura)) },
          { etiqueta: "Tasa de respuesta", valor: FORMATO_PORCENTAJE.format(Number(data.tasa_respuesta)) },
          { etiqueta: "Gasto total", valor: FORMATO_USD.format(Number(data.costo_total_usd)) },
        ],
      },
      flowState: IA_FLOW_IDLE,
    };
  }

  if (llamada.funcion === "mejor_campana") {
    const { data, error } = await supabase.rpc("analytics_mejor_campana", {
      p_tenant_id: tenantId,
      p_desde: llamada.desde,
      p_hasta: llamada.hasta,
      p_metrica: llamada.metrica,
      p_limite: 3,
    });

    if (error) {
      console.error("[IA] Error en analytics_mejor_campana:", error);
      return {
        text: "Tuve un problema para armar ese ranking. Probá de nuevo en un momento.",
        flowState: IA_FLOW_IDLE,
        error: error.message,
      };
    }

    const filas = (data ?? []) as {
      nombre: string;
      tasa_respuesta: number;
      tasa_lectura: number;
      tasa_entrega: number;
      costo_por_respuesta: number | null;
      mensajes_ok: number;
    }[];

    if (filas.length === 0) {
      return {
        text: `No encontré campañas enviadas entre el ${llamada.desde} y el ${llamada.hasta}. Probá con otro período.`,
        flowState: IA_FLOW_IDLE,
      };
    }

    const mejor = filas[0];
    const etiquetaMetrica =
      llamada.metrica === "costo_por_respuesta"
        ? "Costo por respuesta"
        : llamada.metrica === "tasa_lectura"
          ? "Tasa de lectura"
          : llamada.metrica === "tasa_entrega"
            ? "Tasa de entrega"
            : "Tasa de respuesta";
    const valorMetrica =
      llamada.metrica === "costo_por_respuesta"
        ? mejor.costo_por_respuesta != null
          ? FORMATO_USD.format(mejor.costo_por_respuesta)
          : "Sin respuestas aún"
        : FORMATO_PORCENTAJE.format(
            Number(
              llamada.metrica === "tasa_lectura"
                ? mejor.tasa_lectura
                : llamada.metrica === "tasa_entrega"
                  ? mejor.tasa_entrega
                  : mejor.tasa_respuesta,
            ),
          );

    return {
      text: `La campaña que mejor rindió (${etiquetaMetrica.toLowerCase()}) entre el ${llamada.desde} y el ${llamada.hasta} fue "${mejor.nombre}".`,
      payload: {
        kind: "respuesta_analitica",
        titulo: `Mejor campaña — ${etiquetaMetrica}`,
        filas: [
          { etiqueta: "Campaña", valor: mejor.nombre },
          { etiqueta: etiquetaMetrica, valor: valorMetrica },
          { etiqueta: "Mensajes enviados", valor: String(mejor.mensajes_ok) },
          ...(filas.length > 1
            ? [{ etiqueta: "Otras campañas del período", valor: filas.slice(1).map((f) => f.nombre).join(", ") }]
            : []),
        ],
      },
      flowState: IA_FLOW_IDLE,
    };
  }

  if (llamada.funcion === "primera_ultima_campana") {
    const { data: rawData, error } = await supabase
      .rpc("analytics_primera_ultima_campana", {
        p_tenant_id: tenantId,
        p_orden: llamada.orden,
      })
      .maybeSingle();

    if (error) {
      console.error("[IA] Error en analytics_primera_ultima_campana:", error);
      return {
        text: "Tuve un problema para buscar esa campaña. Probá de nuevo en un momento.",
        flowState: IA_FLOW_IDLE,
        error: error.message,
      };
    }

    const data = rawData as {
      campana_id: string;
      nombre: string;
      enviado_at: string;
      status: string;
      contactos_count: number;
      mensajes_ok: number;
      mensajes_error: number;
      costo_usd: number | null;
    } | null;

    if (!data) {
      return {
        text: "Todavía no encontré ninguna campaña enviada en tu cuenta.",
        flowState: IA_FLOW_IDLE,
      };
    }

    const etiquetaOrden = llamada.orden === "ultima" ? "última" : "primera";
    const fecha = new Date(data.enviado_at).toLocaleDateString("es-AR", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });

    return {
      text: `Tu ${etiquetaOrden} campaña enviada fue "${data.nombre}", el ${fecha}.`,
      payload: {
        kind: "respuesta_analitica",
        titulo: `Tu ${etiquetaOrden} campaña`,
        filas: [
          { etiqueta: "Campaña", valor: data.nombre },
          { etiqueta: "Fecha de envío", valor: fecha },
          { etiqueta: "Contactos", valor: String(data.contactos_count) },
          { etiqueta: "Mensajes enviados", valor: String(data.mensajes_ok) },
        ],
      },
      flowState: IA_FLOW_IDLE,
    };
  }

  if (llamada.funcion === "mensajes_por_tema") {
    const { data: rawData, error } = await supabase
      .rpc("analytics_mensajes_por_tema", {
        p_tenant_id: tenantId,
        p_tema: llamada.tema,
        p_dias: llamada.dias,
      })
      .maybeSingle();

    if (error) {
      console.error("[IA] Error en analytics_mensajes_por_tema:", error);
      return {
        text: "Tuve un problema buscando ese dato. Probá de nuevo en un momento.",
        flowState: IA_FLOW_IDLE,
        error: error.message,
      };
    }

    const data = rawData as {
      contactos_alcanzados: number;
      menciones_totales: number;
      contactos: unknown;
    } | null;

    const contactosAlcanzados = data?.contactos_alcanzados ?? 0;

    if (contactosAlcanzados === 0) {
      return {
        text: `No encontré mensajes enviados sobre "${llamada.tema}" en los últimos ${llamada.dias} días.`,
        flowState: IA_FLOW_IDLE,
      };
    }

    return {
      text: `En los últimos ${llamada.dias} días le mandaste algo sobre "${llamada.tema}" a ${contactosAlcanzados} contacto${contactosAlcanzados === 1 ? "" : "s"}.`,
      payload: {
        kind: "respuesta_analitica",
        titulo: `Mensajes sobre "${llamada.tema}"`,
        filas: [
          { etiqueta: "Contactos alcanzados", valor: String(contactosAlcanzados) },
          { etiqueta: "Menciones totales", valor: String(data?.menciones_totales ?? 0) },
          { etiqueta: "Período", valor: `Últimos ${llamada.dias} días` },
        ],
      },
      flowState: IA_FLOW_IDLE,
    };
  }

  // mejor_horario_envio
  const { data: rawData, error } = await supabase
    .rpc("analytics_mejor_horario_envio", { p_tenant_id: tenantId, p_minimo_muestras: 20 })
    .maybeSingle();

  if (error) {
    console.error("[IA] Error en analytics_mejor_horario_envio:", error);
    return {
      text: "Tuve un problema para calcular el mejor horario. Probá de nuevo en un momento.",
      flowState: IA_FLOW_IDLE,
      error: error.message,
    };
  }

  const data = rawData as {
    minimo_alcanzado: boolean;
    total_mensajes_analizados: number;
    mejor_hora_inicio: number | null;
    mejor_hora_fin: number | null;
    detalle_por_hora: unknown;
  } | null;

  if (!data?.minimo_alcanzado) {
    return {
      text: `Todavía no tengo suficiente historial de envíos para sugerirte un horario con confianza (llevás ${data?.total_mensajes_analizados ?? 0} mensajes enviados). Segui enviando campañas y en un tiempo voy a poder decirte cuál es tu mejor franja horaria.`,
      flowState: IA_FLOW_IDLE,
    };
  }

  return {
    text: `Según tu historial de envíos, tu mejor franja horaria es entre las ${data.mejor_hora_inicio}:00 y las ${data.mejor_hora_fin}:00 — es cuando mejor tasa de lectura y respuesta tenés.`,
    payload: {
      kind: "respuesta_analitica",
      titulo: "Mejor horario para enviar",
      filas: [
        { etiqueta: "Franja recomendada", valor: `${data.mejor_hora_inicio}:00 – ${data.mejor_hora_fin}:00` },
        { etiqueta: "Mensajes analizados", valor: String(data.total_mensajes_analizados) },
      ],
    },
    flowState: IA_FLOW_IDLE,
  };
}
