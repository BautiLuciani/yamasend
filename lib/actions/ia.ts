"use server";

import OpenAI from "openai";
import { createClient } from "@/lib/supabase/server";
import { assertPermiso, getCurrentMembership } from "@/lib/auth/permisos";
import {
  syncAndAnalyzeAction,
  generarTemplateConIAAction,
  isWahaConectadaAction,
  setTemperaturaManualAction,
} from "@/lib/actions/sync";
import {
  saveListAction,
  saveTemplateDraftAction,
  sendTemplateToMetaAction,
  saveCampaignAction,
  sendCampaignAction,
  renameListAction,
  renameCampaignAction,
  updateCampaignTemplateAction,
  updateCampaignAudienceAction,
  rescheduleCampaignAction,
} from "@/lib/actions/write";
import {
  getListsForTenant,
  getTemplatesForTenant,
  getCampaignsForTenant,
} from "@/lib/actions/campaigns";
import { getSugerenciaHorarioAction } from "@/lib/actions/horarios";
import {
  generarEmbeddingConsulta,
  sincronizarEmbeddingsLeads,
  sincronizarEmbeddingsMensajes,
} from "@/lib/embeddings";
import type {
  ChatPayload,
  Contact,
  IAFlowState,
  IAHistoryTurn,
  Producto,
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
  /**
   * Catálogo cargado en "Datos de la empresa". Se formatea como lista de
   * texto antes de entrar al prompt: el modelo razona mejor sobre una lista
   * legible que sobre JSON crudo.
   */
  productos: Producto[];
}

async function resolverContextoNegocio(): Promise<ContextoNegocio | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // Vía RPC y no un select directo: un empleado con organización tiene que
  // heredar el contexto de LA EMPRESA (yamas_send_organizaciones), no el
  // propio de yamas_inmo_clientes. La decisión de cuál de las dos fuentes usar
  // vive en Postgres (yamas_send_contexto_negocio), no acá, para que la IA y
  // la sección "Datos de la empresa" del perfil nunca puedan divergir.
  const { data, error } = await supabase.rpc("yamas_send_contexto_negocio");
  if (error || !data) return null;

  const r = data as Record<string, string | Producto[] | null>;
  return {
    nombreUsuario: (r.nombreUsuario as string) ?? null,
    nombreEmpresa: (r.nombreEmpresa as string) ?? null,
    rubro: (r.rubro as string) ?? "",
    descripcionNegocio: (r.descripcionNegocio as string) ?? "",
    publicoObjetivo: (r.publicoObjetivo as string) ?? "",
    tonoComunicacion: (r.tonoComunicacion as string) ?? "",
    diferenciales: (r.diferenciales as string) ?? "",
    productos: Array.isArray(r.productos) ? (r.productos as Producto[]) : [],
  };
}

/**
 * Convierte el catálogo en una lista de texto para meter en un prompt.
 * Se corta en 40 ítems: un catálogo enorme se comería el context window y
 * los primeros productos suelen ser los representativos del negocio.
 */
function formatearProductos(productos: Producto[]): string {
  if (!productos.length) return "";
  const lineas = productos.slice(0, 40).map((p) => {
    const partes = [p.nombre];
    if (p.precio) partes.push(p.precio);
    if (p.descripcion) partes.push(p.descripcion);
    return `- ${partes.join(" — ")}`;
  });
  const resto =
    productos.length > 40 ? `\n- (y ${productos.length - 40} más)` : "";
  return lineas.join("\n") + resto;
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

/**
 * Resuelve "armá una audiencia con ese contacto / con esos / con los que me
 * mostraste" usando los resultados de la última búsqueda guardados en el
 * draft, en vez de depender de que el modelo recuerde los ids.
 *
 * Por qué existe: los resultados de las herramientas no viajan en el
 * historial — el modelo solo ve el texto de los turnos anteriores. Cuando el
 * usuario decía "quiero armar una audiencia con ese contacto", el modelo no
 * tenía el id delante y terminaba llamando a la herramienta sin ids (o con
 * ids inventados), que respondía con un error y el usuario veía "hubo un
 * problema al crear la audiencia".
 *
 * Pide DOS condiciones para activarse, así no se come pedidos que no
 * corresponden: que el mensaje hable de armar una audiencia, y que use un
 * demostrativo o una referencia a lo que se acaba de mostrar. Un "creá una
 * audiencia con los calientes" sin referencia sigue de largo al agente.
 */
// Se testean contra el texto ya normalizado (sin acentos): en JavaScript
// \b es ASCII, así que "creá" no matchearía \bcrea\b — el acento cuenta
// como carácter no-palabra y rompe el límite. Los otros detectores del
// archivo normalizan por el mismo motivo.
const REGEX_ARMAR_AUDIENCIA =
  /\b(arm(a|ar|ame|emos)|cre(a|ar|ame|emos)|hac(e|er|eme|emos)|gener(a|ar)|nueva|nuevo|mete|pone)\b[^.]{0,40}\b(audiencia|lista|grupo)\b|\b(audiencia|lista|grupo)\b[^.]{0,20}\b(nueva|nuevo)\b/i;
const REGEX_REFERENCIA_RESULTADOS =
  /\b(ese|esa|eso|esos|esas|este|esta|estos|estas|dicho|mismo|misma)\b|\bmostrast|\bmostrado|\bencontrast|\baparec|\bresultados?\b|\bde (arriba|ahi)\b/i;
// Verbos que NO son crear: si el pedido es borrar o renombrar algo existente,
// esta rama no tiene que meterse — eso va por abrir_flujo / editar_recurso.
const REGEX_NO_ES_CREACION = /\b(borr|elimin|renombr|cambi|edit|modific|actualiz)/i;

function intentaAudienciaDesdeUltimaBusqueda(
  texto: string,
  flowState: IAFlowState,
): IAResponse | null {
  const busqueda = flowState.draft.ultimaBusqueda;
  if (!busqueda || busqueda.contactos.length === 0) return null;

  const t = texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  if (REGEX_NO_ES_CREACION.test(t)) return null;
  if (!REGEX_ARMAR_AUDIENCIA.test(t)) return null;
  if (!REGEX_REFERENCIA_RESULTADOS.test(t)) return null;

  // Si además nombran una temperatura, se filtra sobre los resultados.
  const filtroTemp = detectarFiltroTemperatura(texto);
  const seleccionados = filtroTemp
    ? busqueda.contactos.filter((c) => c.temperatura === filtroTemp)
    : busqueda.contactos;

  if (seleccionados.length === 0) return null;

  const cuantos =
    seleccionados.length === 1
      ? `${seleccionados[0].nombre}`
      : `los ${seleccionados.length} contactos de la búsqueda`;

  return {
    text: `Dale, armemos una audiencia con ${cuantos}. ¿Cómo querés que se llame?`,
    flowState: {
      kind: "crear_audiencia",
      step: "audiencia_esperando_nombre",
      draft: {
        contactosIds: seleccionados.map((c) => c.contactoId),
        contactosIdsResueltos: true,
        consultaUsada: busqueda.consulta,
        // Se conserva para que el usuario pueda encadenar otro pedido sobre
        // la misma búsqueda después de terminar este flujo.
        ultimaBusqueda: busqueda,
      },
    },
  };
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

/**
 * Se llama cuando el usuario confirma explícitamente una propuesta de
 * contactos que trajo el Motor de Decisión (motor_oportunidades /
 * motor_prioridad_contactos) mientras está en medio de crear_campana,
 * esperando audiencia. Abre el flujo EXISTENTE de crear_audiencia con esos
 * contactos preseleccionados (mismo mecanismo que "armá una audiencia con
 * estos contactos"), y guarda el draft de campaña pendiente para retomarlo
 * automáticamente apenas la audiencia quede creada (ver
 * confirmarCreacionAudienciaAction). No crea ninguna audiencia acá: solo
 * abre el flujo, igual que el resto de los "iniciar" de esta zona.
 */
async function iniciarAudienciaDesdePropuestaMotor(
  flowState: IAFlowState,
): Promise<IAResponse> {
  const propuesta = flowState.draft.propuestaMotor;
  if (!propuesta || propuesta.contactos.length === 0) {
    return {
      text: "No tengo contactos recientes de una consulta al Motor para armar la audiencia. Elegí una audiencia desde las opciones de arriba, o volvé a preguntarle al Motor.",
      payload: await payloadElegirAudienciaCampana(),
      flowState,
    };
  }

  const resolubles = propuesta.contactos.filter((c) => c.contactoId);
  const noResolubles = propuesta.contactos.filter((c) => !c.contactoId);

  const total = propuesta.contactos.length;
  const nombres = (lista: typeof propuesta.contactos) => lista.map((c) => c.nombre || c.telefono).join(", ");

  if (resolubles.length === 0) {
    return {
      text: `Encontré ${total} contacto${total === 1 ? "" : "s"} (${nombres(propuesta.contactos)}), pero ninguno está disponible todavía como contacto de audiencia — no creo audiencias ni contactos nuevos automáticamente. Elegí una audiencia desde las opciones de arriba.`,
      payload: await payloadElegirAudienciaCampana(),
      flowState,
    };
  }

  const avisoExcluidos = noResolubles.length
    ? ` ${nombres(noResolubles)} todavía no ${noResolubles.length === 1 ? "está disponible" : "están disponibles"} como contacto${noResolubles.length === 1 ? "" : "s"} de audiencia.`
    : "";

  // El draft de campaña actual (nombre, y lo que ya se haya cargado) queda
  // guardado tal cual para retomarlo después — sin la propuesta ya usada,
  // para no arrastrarla al subflujo de audiencia.
  const { propuestaMotor: _propuestaUsada, ...campanaDraftPendiente } = flowState.draft;

  const mensajeDisponibilidad =
    resolubles.length === total
      ? `Encontré ${total} contacto${total === 1 ? "" : "s"} (${nombres(resolubles)}), y ${total === 1 ? "está disponible" : "todos están disponibles"} como contacto${total === 1 ? "" : "s"} de audiencia.`
      : `Encontré ${total} oportunidad${total === 1 ? "" : "es"}, pero actualmente solo ${resolubles.length} de ${total} ${resolubles.length === 1 ? "está disponible" : "están disponibles"} como contacto de audiencia (${nombres(resolubles)}).${avisoExcluidos}`;

  return {
    text: `${mensajeDisponibilidad} Armemos una audiencia con ${resolubles.length === total ? "ellos" : "los disponibles"}. ¿Cómo querés que se llame?`,
    flowState: {
      kind: "crear_audiencia",
      step: "audiencia_esperando_nombre",
      draft: {
        contactosIds: resolubles.map((c) => c.contactoId as string),
        contactosIdsResueltos: true,
        // PRODUCT-AI-MOTOR-1.5: esta campaña se arma a partir de una
        // recomendación del Motor (WHO/WHEN), no de una elección manual del
        // usuario -- confirmarCreacionCampanaAction corta acá el camino
        // legacy antes de crear ninguna fila. Ver comentario del campo en
        // lib/types.ts.
        campanaPendiente:
          flowState.kind === "crear_campana"
            ? { ...campanaDraftPendiente, origenRecomendacion: "motor" }
            : undefined,
      },
    },
  };
}

// -----------------------------------------------------------------------
// Punto de entrada único del chat de IA. Recibe el mensaje del usuario, el
// historial corto (para el clasificador) y el estado de flujo actual.
// Devuelve el próximo mensaje del bot + el nuevo estado de flujo.
// -----------------------------------------------------------------------
// -----------------------------------------------------------------------
// Intérprete de desvíos dentro de un flujo guiado.
//
// Los handlers de cada flujo son máquinas de estados rígidas: esperan un
// input puntual por paso y todo lo demás rebota con "confirmá desde la
// tarjeta o escribí cancelar". Eso hacía que pedidos razonables a mitad de
// camino ("mejor llamala Contactos Calientes", "che, cuántos calientes
// tengo?") se chocaran contra una pared.
//
// Esta función corre ANTES del handler y clasifica el mensaje en:
// - continuar: es el input que el paso esperaba -> sigue el handler normal
// - modificar: corrige un dato ya cargado -> se aplica al draft
// - pregunta: algo al margen del flujo -> lo responde el agente SIN perder
//   el flujo (flowState se conserva intacto)
// - cancelar: abandona el flujo
//
// Se usa gpt-4o-mini: es una decisión de 4 opciones con el contexto del
// paso actual, no necesita el modelo grande.
// -----------------------------------------------------------------------
type CampoCorregible = "nombre" | "fecha" | "audiencia" | "template" | "categoria" | "contenido";

type DesvioFlujo =
  | { tipo: "continuar" }
  | { tipo: "modificar"; campo: CampoCorregible; valor: string }
  | { tipo: "pregunta" }
  | { tipo: "cancelar" }
  | { tipo: "aceptar_propuesta_motor" };

function describirPasoActual(flowState: IAFlowState): string {
  const { kind, step, draft } = flowState;
  const partes: string[] = [`Flujo activo: ${kind}.`, `Paso actual: ${step}.`];
  if (draft.nombre) partes.push(`Nombre cargado: "${draft.nombre}".`);
  if (draft.contactosIds?.length) partes.push(`Contactos seleccionados: ${draft.contactosIds.length}.`);
  if (draft.categoria) partes.push(`Categoría: ${draft.categoria}.`);
  return partes.join(" ");
}

/** Qué espera cada paso, en lenguaje natural, para que el modelo sepa qué es "continuar". */
const QUE_ESPERA_EL_PASO: Record<string, string> = {
  audiencia_esperando_nombre: "el nombre para la audiencia",
  audiencia_esperando_contactos: "que el usuario elija contactos desde una tarjeta (no por texto)",
  audiencia_esperando_confirmacion: "que el usuario confirme desde una tarjeta (no por texto)",
  template_esperando_nombre: "el nombre para el template",
  template_esperando_categoria: "que elija una categoría desde una tarjeta",
  template_esperando_descripcion: "una descripción de lo que quiere comunicar en el mensaje",
  template_esperando_confirmacion: "que confirme desde una tarjeta",
  campana_esperando_nombre: "el nombre para la campaña",
  campana_esperando_audiencia: "que elija una audiencia desde una tarjeta",
  campana_esperando_template: "que elija un template desde una tarjeta",
  campana_esperando_momento: "que elija enviar ahora o programar, desde una tarjeta",
  campana_esperando_fecha: "una fecha/hora para programar el envío",
  campana_esperando_confirmacion: "que confirme desde una tarjeta",
  importar_esperando_confirmacion: "que confirme la importación desde una tarjeta",
};

async function interpretarDesvioEnFlujo(
  mensaje: string,
  flowState: IAFlowState,
): Promise<DesvioFlujo> {
  const openai = getOpenAI();
  const espera = flowState.step ? QUE_ESPERA_EL_PASO[flowState.step] ?? "un dato del flujo" : "un dato del flujo";

  const propuestaMotor = flowState.draft.propuestaMotor;
  const bloquePropuestaMotor = propuestaMotor?.contactos.length
    ? `\n\nADEMÁS: hace poco una herramienta del Motor de Decisión propuso estos contactos: ${propuestaMotor.contactos.map((c) => c.nombre || c.telefono).join(", ")}. Si el usuario ahora confirma que quiere usarlos para armar algo (ej: "sí, a esos tres", "usá esos contactos", "armá la audiencia con ellos", "dale, con esos", "incluilos"), clasificá "aceptar_propuesta_motor" en vez de "continuar" o "modificar".`
    : "";

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `Estás ayudando a un asistente que está en medio de un flujo guiado con el usuario.

${describirPasoActual(flowState)}
En este paso el asistente espera: ${espera}.${bloquePropuestaMotor}

Clasificá el último mensaje del usuario y devolvé SOLO un JSON con esta forma:
{"tipo": "continuar" | "modificar" | "pregunta" | "cancelar" | "aceptar_propuesta_motor", "campo": "nombre" | "fecha" | "audiencia" | "template" | "categoria" | "contenido" | null, "valor": string | null}

- "continuar": el mensaje ES lo que el paso esperaba (ej: si espera un nombre, el usuario escribió un nombre).
- "modificar": el usuario quiere CORREGIR o CAMBIAR un dato ya cargado. Indicá qué campo y el valor nuevo:
  - campo "nombre": "mejor llamala X", "cambiale el nombre a X"
  - campo "fecha": "mejor mandala el viernes a las 10", "cambiala para mañana a la tarde". valor = lo que dijo el usuario sobre cuándo, tal cual.
  - campo "audiencia": "mejor mandasela a los calientes", "cambiá la audiencia". valor = cómo describió la audiencia (o vacío si solo dijo "cambiá la audiencia").
  - campo "template": "usá el otro template", "cambiá el mensaje". valor = cómo lo describió, o vacío.
  - campo "categoria": "que sea de marketing", "cambiá la categoría".
  - campo "contenido": "cambiá el texto del mensaje", "reescribilo diciendo que...". valor = lo que pide.
- "pregunta": el usuario pregunta o comenta algo al margen del flujo (ej: "cuántos contactos calientes tengo?", "qué es un template?", "cuánto me sale esto?").
- "cancelar": el usuario quiere abandonar el flujo (ej: "cancelá", "dejalo", "olvidate", "mejor no").
- "aceptar_propuesta_motor": SOLO si el bloque de arriba menciona una propuesta pendiente del Motor Y el usuario la está confirmando explícitamente.

Reglas importantes:
- Si el paso espera un dato y el usuario simplemente lo escribe, eso es "continuar", NO "modificar". Solo es "modificar" si está corrigiendo algo ya cargado, con lenguaje de corrección ("mejor", "cambiá", "no, ponele").
- Si el paso espera una fecha y el usuario escribe una fecha, es "continuar".
No agregues texto fuera del JSON.`,
      },
      { role: "user", content: mensaje },
    ],
  });

  try {
    const parsed = JSON.parse(completion.choices[0]?.message?.content ?? "{}");
    if (parsed.tipo === "cancelar") return { tipo: "cancelar" };
    if (parsed.tipo === "pregunta") return { tipo: "pregunta" };
    if (parsed.tipo === "aceptar_propuesta_motor" && propuestaMotor?.contactos.length) {
      return { tipo: "aceptar_propuesta_motor" };
    }
    if (parsed.tipo === "modificar") {
      const campos: CampoCorregible[] = ["nombre", "fecha", "audiencia", "template", "categoria", "contenido"];
      const campo = campos.find((c) => c === parsed.campo);
      if (campo) {
        return { tipo: "modificar", campo, valor: String(parsed.valor ?? "").slice(0, 300) };
      }
    }
    return { tipo: "continuar" };
  } catch {
    return { tipo: "continuar" };
  }
}

/**
 * Aplica una corrección al draft y re-renderiza la tarjeta del paso
 * correspondiente, para que el usuario vea el cambio reflejado sin perder
 * el progreso ni tener que rehacer el flujo.
 *
 * Para los campos que se eligen desde una tarjeta (audiencia, template,
 * categoría) no intentamos adivinar cuál quiso: volvemos a mostrar el
 * selector correspondiente, que es más rápido y no puede equivocarse.
 */
async function aplicarCorreccionEnFlujo(
  campo: CampoCorregible,
  valor: string,
  flowState: IAFlowState,
): Promise<IAResponse> {
  const draft = { ...flowState.draft };

  // ---- Nombre --------------------------------------------------------
  if (campo === "nombre") {
    if (!valor.trim()) {
      return { text: "¿Cómo querés que se llame?", flowState };
    }
    draft.nombre = valor.trim();
    const nuevoFlowState: IAFlowState = { ...flowState, draft };

    if (flowState.kind === "crear_audiencia" && flowState.step === "audiencia_esperando_confirmacion") {
      const ids = draft.contactosIds ?? [];
      return {
        text: `Listo, la llamo "${draft.nombre}". Confirmame: creamos la audiencia con ${ids.length} contacto${ids.length === 1 ? "" : "s"}.`,
        payload: { kind: "confirmar_audiencia", nombre: draft.nombre, contactosIds: ids },
        flowState: nuevoFlowState,
      };
    }

    if (flowState.kind === "crear_audiencia" && flowState.step === "audiencia_esperando_contactos") {
      return {
        text: `Dale, la llamo "${draft.nombre}". Seguí eligiendo los contactos desde la tarjeta.`,
        payload: {
          kind: "seleccionar_contactos",
          preselectedIds: draft.contactosIds ?? [],
          consultaUsada: draft.consultaUsada,
        },
        flowState: nuevoFlowState,
      };
    }

    if (flowState.kind === "crear_template" && flowState.step === "template_esperando_confirmacion") {
      return {
        text: `Listo, lo llamo "${draft.nombre}".`,
        payload: {
          kind: "confirmar_template",
          nombre: draft.nombre,
          contenido: draft.contenido ?? "",
          categoria: draft.categoria ?? "",
        },
        flowState: nuevoFlowState,
      };
    }

    if (flowState.kind === "crear_campana" && flowState.step === "campana_esperando_confirmacion") {
      return mostrarConfirmacionCampana(draft);
    }

    return {
      text: `Listo, anoté el nombre "${draft.nombre}". Seguimos donde estábamos.`,
      flowState: nuevoFlowState,
    };
  }

  // ---- Fecha (solo aplica a campañas) --------------------------------
  if (campo === "fecha") {
    if (flowState.kind !== "crear_campana") {
      return {
        text: "La fecha solo se elige cuando estás armando una campaña. Seguimos donde estábamos.",
        flowState,
      };
    }
    // No parseamos la fecha en lenguaje natural acá: volvemos a mostrar el
    // selector de fecha, que ya valida que no sea pasada y evita
    // interpretar mal cosas como "el viernes".
    draft.momento = "programar";
    return {
      text: "Dale, cambiemos cuándo se envía. Elegí la nueva fecha y hora.",
      payload: { kind: "elegir_fecha_campana" },
      flowState: { kind: "crear_campana", step: "campana_esperando_fecha", draft },
    };
  }

  // ---- Audiencia (solo campañas) -------------------------------------
  if (campo === "audiencia") {
    if (flowState.kind !== "crear_campana") {
      return {
        text: "La audiencia se elige cuando armás una campaña. Seguimos donde estábamos.",
        flowState,
      };
    }
    return {
      text: "Dale, elegí a qué audiencia se la mandamos.",
      payload: await payloadElegirAudienciaCampana(),
      flowState: { kind: "crear_campana", step: "campana_esperando_audiencia", draft },
    };
  }

  // ---- Template (solo campañas) --------------------------------------
  if (campo === "template") {
    if (flowState.kind !== "crear_campana") {
      return {
        text: "El template se elige cuando armás una campaña. Seguimos donde estábamos.",
        flowState,
      };
    }
    return {
      text: "Dale, elegí qué template querés usar.",
      payload: await payloadElegirTemplateCampana(),
      flowState: { kind: "crear_campana", step: "campana_esperando_template", draft },
    };
  }

  // ---- Categoría (solo templates) ------------------------------------
  if (campo === "categoria") {
    if (flowState.kind !== "crear_template") {
      return {
        text: "La categoría se elige cuando creás un template. Seguimos donde estábamos.",
        flowState,
      };
    }
    return {
      text: "Dale, elegí la categoría del template.",
      payload: { kind: "elegir_categoria_template" },
      flowState: { kind: "crear_template", step: "template_esperando_categoria", draft },
    };
  }

  // ---- Contenido (solo templates) ------------------------------------
  // Volvemos al paso de descripción para que la IA regenere el texto con
  // el pedido nuevo, en vez de editar el contenido a ciegas.
  if (flowState.kind !== "crear_template") {
    return {
      text: "El contenido se edita cuando estás creando un template. Seguimos donde estábamos.",
      flowState,
    };
  }
  if (valor.trim()) {
    return handleCrearTemplateStep(valor.trim(), {
      kind: "crear_template",
      step: "template_esperando_descripcion",
      draft,
    });
  }
  return {
    text: "Contame qué querés que diga el mensaje y lo reescribo.",
    flowState: { kind: "crear_template", step: "template_esperando_descripcion", draft },
  };
}

/**
 * Detecta pedidos de edición explícitos sin pasar por el LLM.
 *
 * Solo matchea cuando hay un verbo de MODIFICACIÓN junto al recurso, así
 * que "creá una campaña" o "armá una audiencia" no se ven afectados y
 * siguen su curso normal hacia el agente.
 */
function detectarPedidoEdicion(texto: string): "audiencia" | "campana" | "contacto" | null {
  const t = texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  // Prefijos en vez de palabras completas: así "cambiarle", "cambiarla",
  // "renombrarla" o "ponele" matchean igual que "cambiar" o "renombrar".
  const verboEdicion = /\b(cambi|modific|edit|renombr|actualiz|pon|reprogram|reagend)/.test(t);
  if (!verboEdicion) return null;

  // La temperatura solo aplica a contactos, así que alcanza con nombrarla.
  if (/temperatura/.test(t)) return "contacto";

  // Para campañas se puede editar nombre, template, audiencia y fecha, así
  // que cualquiera de esos cuatro campos habilita el flujo. Antes se exigía
  // que el pedido mencionara el nombre, y "cambiá el template de la campaña"
  // caía al agente, que abría el flujo de edición y terminaba preguntando
  // por un nombre nuevo — el usuario pedía una cosa y recibía otra.
  // "renombrá la audiencia" ya dice qué se cambia en el propio verbo, así
  // que no tiene sentido exigir además la palabra "nombre" — antes ese
  // pedido no matcheaba y caía al agente.
  const mencionaNombre = /nombre|titulo|llamar|llama/.test(t) || /\brenombr/.test(t);
  // Reprogramar habla de la fecha aunque no la nombre.
  const pideReprogramar = /\b(reprogram|reagend)/.test(t);
  const mencionaCampoCampana =
    /template|plantilla|audiencia|lista|grupo|fecha|horario|programacion|programada/.test(t) ||
    pideReprogramar;

  if (/campan/.test(t)) {
    if (mencionaNombre || mencionaCampoCampana) return "campana";
    return null;
  }

  // Reprogramar sin decir "campaña" igual se refiere a una campaña: es lo
  // único que se programa en el producto.
  if (pideReprogramar && /fecha|envio|horario/.test(t)) return "campana";

  // Las audiencias solo cambian de nombre.
  if (mencionaNombre && /audiencia|lista|grupo/.test(t)) return "audiencia";

  return null;
}

/**
 * Detecta pedidos de importación/sincronización de contactos sin pasar por
 * el LLM.
 *
 * Mismo motivo que detectarPedidoEdicion: el modelo narraba "te abro el
 * asistente para que importes tus contactos" y se quedaba ahí, sin llamar a
 * abrir_flujo, así que el usuario leía la promesa pero nunca aparecía la
 * tarjeta. Estos pedidos son inequívocos y no necesitan criterio del modelo.
 *
 * Exige un verbo de acción junto al objeto para no capturar preguntas como
 * "¿cuántos contactos tengo?" o "¿cómo importo contactos?", que sí tienen
 * que seguir al agente.
 */
function detectarPedidoImportacion(texto: string): boolean {
  const t = texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  // Las preguntas informativas van al agente, no abren el asistente.
  if (/^(que|como|cuando|cuanto|cuantos|donde|por que|porque|para que)\b/.test(t.trim())) {
    return false;
  }

  const verbo = /\b(import|sincroniz|traer|trae|traeme|cargar|carga|cargame|analiz)/.test(t);
  if (!verbo) return false;

  return /\bcontactos?\b|\bleads?\b|\bchats?\b|\bconversaciones?\b|\bwhatsapp\b|\bagenda\b/.test(t);
}

/**
 * Detecta pedidos de creación "en seco" — "quiero crear una audiencia", "armá
 * un template nuevo" — y abre el asistente correspondiente sin pasar por el
 * LLM.
 *
 * Tercera vez que aparece el mismo patrón (edición, importación y ahora
 * creación): el modelo respondía "te abro el asistente para que puedas crear
 * la audiencia" y se quedaba ahí, sin llamar a abrir_flujo, así que el
 * usuario leía la promesa y nunca veía la tarjeta.
 *
 * Solo dispara cuando el pedido NO trae criterio. Si el usuario dice "creá
 * una audiencia con los contactos calientes" o "con los que hablaron de X",
 * eso tiene que seguir yendo al agente, que sabe resolver el filtro y armar
 * la audiencia ya poblada — abrir el asistente en blanco sería un downgrade.
 */
function detectarPedidoCreacionSimple(
  texto: string,
): "audiencia" | "template" | "campana" | null {
  const t = texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

  // Preguntas informativas siguen al agente.
  if (/^(que|como|cuando|cuanto|cuantos|cuantas|donde|por que|porque|para que|cual)\b/.test(t)) {
    return null;
  }

  const verboCrear = /\b(cre(a|ar|ame|emos|o)|arm(a|ar|ame|emos|o)|hac(e|er|eme|emos|go)|gener(a|ar)|nuev[ao])\b/;
  if (!verboCrear.test(t)) return null;

  // Si viene con criterio, filtro o referencia, es trabajo del agente.
  const tieneCriterio =
    /\bcon\b|\bde los\b|\bque hablaron\b|\bque hablo\b|\bpara los\b|\bcalient|\btibi|\bfrio|\binteresad|\bese\b|\besos\b|\bestos\b|\beste\b|\besa\b|\besas\b|\bmostrast|\bencontrast/.test(
      t,
    );
  if (tieneCriterio) return null;

  if (/\b(audiencia|lista|grupo)\b/.test(t)) return "audiencia";
  if (/\b(template|plantilla)\b/.test(t)) return "template";
  if (/\bcampanas?\b|\bcampanias?\b/.test(t)) return "campana";

  return null;
}

export async function sendIAMessageAction(
  userMessage: string,
  history: IAHistoryTurn[],
  flowState: IAFlowState,
): Promise<IAResponse> {
  // Gate de permisos. Se responde dentro del chat y se resetea el flujo:
  // dejar el flowState a medias haría que el próximo mensaje del usuario
  // cayera en un paso que ya no puede completar.
  const gate = await assertPermiso("usar_ia");
  if (!gate.ok) {
    return { text: gate.error ?? "No tenés permiso para hacer eso.", flowState: IA_FLOW_IDLE };
  }

  const texto = userMessage.trim();
  if (!texto) {
    return {
      text: "Contame qué necesitás.",
      flowState,
    };
  }

  // ---- Flujo activo: interpretar antes de pasar al handler rígido ------
  //
  // Los handlers esperan un input puntual por paso. Sin este chequeo,
  // cualquier otra cosa que escriba el usuario (una corrección, una
  // pregunta al margen) rebota con un mensaje del tipo "confirmá desde la
  // tarjeta o escribí cancelar", que es justo lo que hacía sentir rígido
  // al asistente.
  if (flowState.kind) {
    let desvio: DesvioFlujo;
    try {
      desvio = await interpretarDesvioEnFlujo(texto, flowState);
    } catch (e) {
      // Si el intérprete falla, seguimos con el comportamiento de siempre.
      console.error("[IA] Error en interpretarDesvioEnFlujo:", e);
      desvio = { tipo: "continuar" };
    }

    if (desvio.tipo === "cancelar") {
      return {
        text: "Listo, lo dejamos acá. ¿En qué más te ayudo?",
        flowState: IA_FLOW_IDLE,
      };
    }

    if (desvio.tipo === "modificar") {
      return aplicarCorreccionEnFlujo(desvio.campo, desvio.valor, flowState);
    }

    if (desvio.tipo === "pregunta") {
      // Respondemos con el agente pero CONSERVAMOS el flowState (kind/step),
      // así el flujo queda esperando donde estaba y el usuario puede
      // retomarlo. Antes esto pisaba flowState entero con el original y
      // tiraba la memoria que la herramienta pudo haber dejado (ej:
      // propuestaMotor, ultimaBusqueda) — ahora se mergea el draft.
      const contextoNegocioFlujo = await resolverContextoNegocio();
      const tenantIdFlujo = await resolverTenantId();
      try {
        const respuesta = await responderConAgente(
          texto,
          history,
          contextoNegocioFlujo,
          tenantIdFlujo,
        );
        return {
          ...respuesta,
          flowState: {
            ...flowState,
            draft: { ...flowState.draft, ...respuesta.flowState.draft },
          },
        };
      } catch (e) {
        console.error("[IA] Error respondiendo pregunta dentro de flujo:", e);
        return {
          text: "No pude buscar eso ahora. Seguimos donde estábamos cuando quieras.",
          flowState,
        };
      }
    }

    if (desvio.tipo === "aceptar_propuesta_motor") {
      return iniciarAudienciaDesdePropuestaMotor(flowState);
    }
    // "continuar": cae a los handlers de abajo, comportamiento de siempre.
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

  // ---- Flujo activo: editar_recurso ------------------------------------
  if (flowState.kind === "editar_recurso") {
    return handleEditarRecursoStep(texto, flowState);
  }

  // ---- Sin flujo activo, pero con una importación reciente disponible ---
  // (ver comentario de intentaAudienciaDesdeUltimaImportacion más arriba)
  if (!flowState.kind) {
    const respuestaImportacion = intentaAudienciaDesdeUltimaImportacion(texto, flowState);
    if (respuestaImportacion) return respuestaImportacion;

    const respuestaBusqueda = intentaAudienciaDesdeUltimaBusqueda(texto, flowState);
    if (respuestaBusqueda) return respuestaBusqueda;
  }

  // ---- Atajo determinístico para pedidos de edición explícitos ---------
  //
  // Estos pedidos son inequívocos y no necesitan criterio del modelo. Se
  // resuelven acá para que no dependan de que el agente elija bien la
  // herramienta: hubo casos donde el modelo narraba "te abro el asistente"
  // sin llegar a llamarla, y el usuario se quedaba mirando un mensaje sin
  // tarjeta. Si no matchea ninguno de estos patrones, sigue al agente.
  if (!flowState.kind) {
    const atajo = detectarPedidoEdicion(texto);
    if (atajo) return iniciarFlujoEditarRecurso(atajo);

    if (detectarPedidoImportacion(texto)) {
      return iniciarFlujoImportarContactos();
    }

    const creacion = detectarPedidoCreacionSimple(texto);
    if (creacion === "audiencia") return await iniciarFlujoCrearAudiencia(null);
    if (creacion === "template") return iniciarFlujoCrearTemplate();
    if (creacion === "campana") return await iniciarFlujoCrearCampana();
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
    // En vez de derivar al usuario a otra sección y cortar la conversación,
    // le ofrecemos resolverlo acá mismo. El flujo queda esperando un sí/no
    // en importar_ofrecido, que es un paso previo a la tarjeta de
    // confirmación de siempre — no cambia nada de lo que venía después.
    return {
      text: "Todavía no tenés contactos sincronizados, así que no puedo armar una audiencia. ¿Querés que importemos tus contactos de WhatsApp ahora?",
      flowState: {
        kind: "importar_contactos",
        step: "importar_ofrecido",
        draft: {},
      },
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
  // Gate de permisos. Se responde dentro del chat y se resetea el flujo:
  // dejar el flowState a medias haría que el próximo mensaje del usuario
  // cayera en un paso que ya no puede completar.
  const gate = await assertPermiso("crear_audiencias");
  if (!gate.ok) {
    return { text: gate.error ?? "No tenés permiso para hacer eso.", flowState: IA_FLOW_IDLE };
  }

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

  const mensajeAudienciaCreada = `Listo, creé la audiencia "${nombre}" con ${contactosIds.length} contacto${contactosIds.length === 1 ? "" : "s"}.`;

  // Si esta audiencia se armó desde una propuesta del Motor en medio de una
  // campaña (ver iniciarAudienciaDesdePropuestaMotor), volvemos automática-
  // mente al wizard de campaña con esta audiencia ya seleccionada — mismo
  // mecanismo que si el usuario la hubiese elegido desde la tarjeta normal,
  // sin saltear ningún paso ni confirmación que ese flujo ya tenga.
  if (flowState.draft.campanaPendiente) {
    const siguiente = await seleccionarAudienciaCampanaAction(
      { kind: "crear_campana", step: "campana_esperando_audiencia", draft: flowState.draft.campanaPendiente },
      result.id,
    );
    return {
      ...siguiente,
      text: `${mensajeAudienciaCreada} ${siguiente.text}`,
    };
  }

  return {
    text: `${mensajeAudienciaCreada} ¿Qué más necesitás?`,
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
  // Gate de permisos. Se responde dentro del chat y se resetea el flujo:
  // dejar el flowState a medias haría que el próximo mensaje del usuario
  // cayera en un paso que ya no puede completar.
  const gate = await assertPermiso("crear_templates");
  if (!gate.ok) {
    return { text: gate.error ?? "No tenés permiso para hacer eso.", flowState: IA_FLOW_IDLE };
  }

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
  /**
   * Conversación desde la que se está enviando. Se guarda junto al template
   * para que el aviso de Meta vuelva a ESTE chat, aunque cuando responda el
   * usuario esté en otro lado. Puede ser null si la conversación todavía no
   * se persistió.
   */
  iaConversacionId?: string | null,
): Promise<IAResponse> {
  // Gate de permisos. Se responde dentro del chat y se resetea el flujo:
  // dejar el flowState a medias haría que el próximo mensaje del usuario
  // cayera en un paso que ya no puede completar.
  const gate = await assertPermiso("enviar_templates_meta");
  if (!gate.ok) {
    return { text: gate.error ?? "No tenés permiso para hacer eso.", flowState: IA_FLOW_IDLE };
  }

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
  const result = await sendTemplateToMetaAction(nombre, contenido, categoria, iaConversacionId);

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
  // La misma tarjeta se usa para crear una campaña y para cambiarle la
  // audiencia a una existente. Si venimos del flujo de edición, aplicamos el
  // cambio y terminamos, en vez de seguir armando una campaña nueva.
  if (flowState.kind === "editar_recurso" && flowState.draft.editarTipo === "campana") {
    return aplicarEdicionCampana(flowState, { audienciaId });
  }

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

  const draftActualizado = { ...flowState.draft, audienciaId };

  // Si el template ya estaba elegido (típicamente porque el usuario volvió
  // acá para CAMBIAR la audiencia a mitad del flujo), no lo volvemos a
  // pedir: saltamos al siguiente dato que falte. Antes se re-preguntaba
  // siempre y se perdía la selección previa.
  if (draftActualizado.templateId) {
    if (draftActualizado.momento) {
      return mostrarConfirmacionCampana(draftActualizado);
    }
    return {
      text: `Listo, se la mandamos a "${audiencia.nombre}" (${audiencia.contactosIds.length} contactos). ¿Cuándo la enviamos?`,
      payload: { kind: "elegir_momento_campana" },
      flowState: {
        kind: "crear_campana",
        step: "campana_esperando_momento",
        draft: draftActualizado,
      },
    };
  }

  return {
    text: `"${audiencia.nombre}" (${audiencia.contactosIds.length} contactos). Ahora elegí qué template querés enviar — solo se muestran los ya aprobados por Meta.`,
    payload: await payloadElegirTemplateCampana(),
    flowState: {
      kind: "crear_campana",
      step: "campana_esperando_template",
      draft: draftActualizado,
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
  if (flowState.kind === "editar_recurso" && flowState.draft.editarTipo === "campana") {
    return aplicarEdicionCampana(flowState, { templateId });
  }

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

  const draftActualizado = { ...flowState.draft, templateId };

  // Si el momento de envío ya estaba definido (el usuario volvió acá solo
  // para cambiar el template), no lo volvemos a preguntar.
  if (draftActualizado.momento) {
    return mostrarConfirmacionCampana(draftActualizado);
  }

  return {
    text: `"${template.nombre}", listo. ¿Cuándo la enviamos?`,
    payload: { kind: "elegir_momento_campana" },
    flowState: {
      kind: "crear_campana",
      step: "campana_esperando_momento",
      draft: draftActualizado,
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
    // Misma proactividad que el wizard manual: si hay evidencia real, se
    // ofrece la franja en la que más responden en vez de dejar al usuario
    // eligiendo a ciegas. Si no hay datos suficientes, la acción devuelve
    // null y el paso queda exactamente como estaba antes.
    const sugerencia = await getSugerenciaHorarioAction();
    const texto = sugerencia
      ? `Elegí la fecha y hora de envío. Un dato: tus contactos responden más entre las ${String(
          sugerencia.horaInicio,
        ).padStart(2, "0")}:00 y las ${String(sugerencia.horaFin).padStart(2, "0")}:00 (${Math.round(
          sugerencia.tasaRespuesta * 100,
        )}% de respuesta sobre ${sugerencia.enviados} envíos en esa franja).`
      : "Elegí la fecha y hora de envío.";

    return {
      text: texto,
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
  if (flowState.kind === "editar_recurso" && flowState.draft.editarTipo === "campana") {
    return aplicarEdicionCampana(flowState, { fechaProgramada: fechaProgramadaIso });
  }

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

  // El costo en dólares que nos cobra Meta es un dato interno — el mismo que
  // ya se sacó del wizard manual y del detalle de campaña. Acá se muestra en
  // créditos, que es la unidad que el cliente compró y entiende, contra el
  // saldo real de la cuenta (RPC, nunca calculado en el cliente).
  const [{ data: saldoData }, membership] = await Promise.all([
    createClient().then((supabase) => supabase.rpc("yamas_send_mi_saldo")),
    getCurrentMembership(),
  ]);
  const saldo = (saldoData ?? {}) as { aplica?: boolean; saldo?: number };
  const creditosAplican = Boolean(saldo.aplica);
  const creditosDisponibles = saldo.saldo ?? 0;

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
      creditosDisponibles,
      creditosAplican,
      tieneEmpresa: Boolean(membership?.orgId),
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
  // Gate de permisos. Se responde dentro del chat y se resetea el flujo:
  // dejar el flowState a medias haría que el próximo mensaje del usuario
  // cayera en un paso que ya no puede completar.
  const gate = await assertPermiso("crear_campanas");
  if (!gate.ok) {
    return { text: gate.error ?? "No tenés permiso para hacer eso.", flowState: IA_FLOW_IDLE };
  }

  // PRODUCT-AI-MOTOR-1.5 — frontera Motor -> legacy. Si este draft de
  // campaña se originó al aceptar una propuesta del Motor
  // (iniciarAudienciaDesdePropuestaMotor), cortamos ACÁ, antes de llamar a
  // saveCampaignAction: ni se crea la fila, ni se reservan créditos legacy,
  // ni hay nada que sendCampaignAction tenga que bloquear después. El
  // guard de sendCampaignAction (yamas_send_campanas.origen +
  // yamas_send_es_campana_motor) sigue existiendo como defensa en
  // profundidad para el otro caller (el wizard manual de AppShell), no
  // como la única barrera acá.
  if (flowState.draft.origenRecomendacion === "motor") {
    return {
      text: "Esta campaña fue preparada a partir de recomendaciones inteligentes y todavía no se puede enviar desde el chat: va a seguir el flujo de aprobación de YamaSend IA.",
      flowState: IA_FLOW_IDLE,
    };
  }

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
    // Esto normalmente no debería pasar: la tarjeta de confirmación ya
    // bloquea el botón cuando el saldo no alcanza. Pero el saldo mostrado ahí
    // es una foto del momento en que se armó la tarjeta, y entre eso y que la
    // persona confirma puede haber pasado tiempo (otra campaña que consumió
    // el mismo cupo, por ejemplo). Acá está el gate real: la reserva atómica
    // en Postgres, que es la que de verdad no deja pasar el envío.
    //
    // "Reintentar" no aplica a un problema de créditos — hay que comprar o
    // achicar la audiencia, no repetir la misma acción. Y a diferencia del
    // resto de errores, acá no se conserva flowState: seguir en el paso de
    // confirmación con la misma audiencia solo llevaría al mismo rechazo.
    const esFaltaDeCreditos = saveResult.error?.includes("crédito");
    return {
      text: esFaltaDeCreditos
        ? saveResult.error!
        : `No pude crear la campaña: ${saveResult.error ?? "error desconocido"}. ¿Querés reintentar?`,
      flowState: esFaltaDeCreditos ? IA_FLOW_IDLE : flowState,
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

  // Paso previo: le ofrecimos importar porque la cuenta está vacía y está
  // contestando si quiere o no. Recién con el sí abrimos el asistente.
  if (flowState.step === "importar_ofrecido") {
    const t = texto
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();

    const dijoQueNo = /^(no|nop|ahora no|despues|mas tarde|luego|no gracias|paso)\b/.test(t);
    if (dijoQueNo) {
      return {
        text: "Dale, cuando quieras me pedís que los importe. ¿Te ayudo con otra cosa?",
        flowState: IA_FLOW_IDLE,
      };
    }

    const dijoQueSi =
      /^(si|s|dale|ok|oka|okey|bueno|listo|obvio|claro|sip|sisi|va|vamos|de una|hagamoslo|por favor|porfa|quiero|importa|importalos|adelante)\b/.test(
        t,
      ) || detectarPedidoImportacion(texto);

    if (dijoQueSi) {
      return iniciarFlujoImportarContactos();
    }

    // Cualquier otra cosa: no adivinamos. Repreguntamos manteniendo el paso.
    return {
      text: "¿Querés que importe tus contactos de WhatsApp? Decime que sí y te abro el asistente.",
      flowState,
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
  // Gate de permisos. Se responde dentro del chat y se resetea el flujo:
  // dejar el flowState a medias haría que el próximo mensaje del usuario
  // cayera en un paso que ya no puede completar.
  const gate = await assertPermiso("importar_contactos");
  if (!gate.ok) {
    return { text: gate.error ?? "No tenés permiso para hacer eso.", flowState: IA_FLOW_IDLE };
  }

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
  // Gate de permisos. Se responde dentro del chat y se resetea el flujo:
  // dejar el flowState a medias haría que el próximo mensaje del usuario
  // cayera en un paso que ya no puede completar.
  const gate = await assertPermiso("crear_audiencias");
  if (!gate.ok) {
    return { text: gate.error ?? "No tenés permiso para hacer eso.", flowState: IA_FLOW_IDLE };
  }

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
// buscar_contactos (que usa yamas_send_buscar_contactos_hibrido, la cual
// conserva adentro la misma rama de texto completo que usaba esta),
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
  // Gate de permisos. Se responde dentro del chat y se resetea el flujo:
  // dejar el flowState a medias haría que el próximo mensaje del usuario
  // cayera en un paso que ya no puede completar.
  const gate = await assertPermiso("crear_audiencias");
  if (!gate.ok) {
    return { text: gate.error ?? "No tenés permiso para hacer eso.", flowState: IA_FLOW_IDLE };
  }

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

/**
 * Umbrales de similitud de coseno para las dos ramas semánticas. Una
 * búsqueda vectorial SIEMPRE tiene un vecino más cercano, así que sin
 * umbral cualquier consulta "encontraría" a toda la cuenta ordenada por
 * parecido y el agente lo reportaría como coincidencias reales.
 *
 * MENSAJE (0.42): compara la consulta contra lo que el contacto escribió de
 * verdad. Es la rama principal y la que mejor discrimina, porque cada
 * mensaje dice algo distinto.
 *
 * PERFIL (0.50): más exigente, y aún así es solo el PISO. La RPC le suma un
 * criterio relativo (media + 1.5 desvíos de la propia cuenta) por un motivo
 * medido: en una cuenta real los resúmenes que escribe el análisis de IA se
 * parecen entre sí 0.52-0.83, promedio 0.69. Son casi todos la misma frase
 * ("no se detecta interés comercial, conversación personal"), así que forman
 * un bloque que ningún umbral absoluto separa — subirlo solo haría que no
 * pase nadie. El criterio relativo deja pasar únicamente a los que se
 * despegan del bloque y se autocalibra por cuenta.
 *
 * Las ramas de texto completo no dependen de estos valores, así que tocarlos
 * no puede romper la búsqueda literal.
 */
const SIMILITUD_MINIMA_MENSAJE = 0.42;
const SIMILITUD_MINIMA_PERFIL = 0.5;

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
        "Lista los contactos/leads de la cuenta, opcionalmente filtrados por temperatura (caliente/tibio/frio). Usar cuando el usuario pide por temperatura ('pasame los contactos fríos', 'cuáles son mis leads calientes') o quién está hace más tiempo inactivo (orden_por 'reciente'). NO usar para totales ('cuántos contactos tengo' → motor_resumen_cuenta), ni para intención de compra fuerte/leve (→ motor_resumen_cuenta), ni para buscar por tema (→ buscar_contactos o motor_demanda), ni para quién escribió en un período y quedó sin respuesta (→ conversaciones_pendientes).",
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
        "Lista campañas con sus métricas reales (enviados, entregados, leídos, respondidos, créditos usados, tasa de respuesta). Usar para 'cuál campaña rindió mejor', 'cuál fue la primera/última campaña', 'cuántas campañas tengo', 'listame las campañas de este mes'. Las fechas son opcionales: omitilas para buscar en todo el historial.",
      parameters: {
        type: "object",
        properties: {
          desde: { type: "string", description: "Fecha inicio YYYY-MM-DD (hora de Argentina). Omitir para no filtrar." },
          hasta: { type: "string", description: "Fecha fin YYYY-MM-DD (hora de Argentina), exclusiva. Omitir para no filtrar." },
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
      name: "buscar_contactos",
      description:
        "Busca contactos por TEMA, INTERÉS o NECESIDAD, descrito en lenguaje natural. Combina búsqueda semántica sobre el análisis de cada contacto con búsqueda de texto sobre el historial real de WhatsApp, así que entiende sinónimos y descripciones aproximadas: 'los que compran zapatillas' también encuentra a quien habló de calzado deportivo o de unas Nike. Usar para 'quiénes preguntaron por departamentos', 'contactos interesados en X', 'armame un grupo con los que compran Y'. NO usar cuando el pedido es solo por temperatura sin ningún tema ('pasame los fríos') — para eso está listar_contactos.",
      parameters: {
        type: "object",
        properties: {
          consulta: {
            type: "string",
            description:
              "Qué se busca, en lenguaje natural y con las palabras del usuario. Poné el interés o la necesidad, no la temperatura ni el presupuesto (esos van en sus propios parámetros). Ej: 'compran zapatillas', 'buscan departamento de 3 ambientes'.",
          },
          temperatura: {
            type: "string",
            enum: ["caliente", "tibio", "frio"],
            description: "Filtro opcional adicional por temperatura del lead. Omitir si el usuario no la mencionó.",
          },
          score_minimo: {
            type: "integer",
            description:
              "Filtro opcional: score de interés mínimo (0-100). Usalo solo si el usuario pidió explícitamente los de más interés.",
          },
          presupuesto_mensajes: {
            type: "integer",
            description:
              "Cantidad máxima de contactos que el usuario puede costear, cuando dio un presupuesto en MENSAJES o CRÉDITOS (1 crédito = 1 mensaje). Se devuelven los mejor rankeados hasta ese tope. Si el presupuesto vino en dinero (pesos, dólares u otra moneda), no lo conviertas: preguntale a cuántos créditos equivale.",
          },
          limite: { type: "integer", description: "Máximo de contactos a devolver (1-100). Por defecto 15." },
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
        "Métricas agregadas de mensajería en un rango de fechas: mensajes enviados/entregados/leídos/respondidos, tasas y créditos usados (1 crédito = 1 mensaje). Usar para 'cuánto gasté', 'cuántos créditos usé', 'cómo me fue este mes', 'cuál es mi tasa de respuesta'.",
      parameters: {
        type: "object",
        properties: {
          desde: { type: "string", description: "Fecha inicio YYYY-MM-DD (hora de Argentina)." },
          hasta: { type: "string", description: "Fecha fin YYYY-MM-DD (hora de Argentina), exclusiva." },
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
        "Mejor día y horario para escribirles a los clientes. Trae dos cosas: (1) 'por_envios': la franja con mejor tasa de respuesta según campañas ya enviadas (puede no tener datos suficientes todavía) y (2) 'actividad_de_clientes': en qué horarios y días de la semana los clientes escriben por su cuenta (hora de Argentina, últimos 90 días). Usar para 'cuál es el mejor horario para enviar', 'qué día conviene mandar', 'cuándo conviene mandar la campaña'.",
      parameters: { type: "object", properties: {} },
    },
  },
  // --- Herramientas del Motor (Fase 1 — solo lectura) -------------------
  // Consultan directamente lo que el Motor de Decisión ya procesó
  // (episodios, evidencia verificada, candidatos). Son RPCs de solo SELECT
  // (STABLE) con el mismo mecanismo de tenant isolation que usa el resto
  // del Motor (motor.assert_tenant contra auth.uid()). No pueden crear,
  // aprobar ni ejecutar nada — eso es Fase 3, todavía no existe.
  {
    type: "function",
    function: {
      name: "motor_oportunidades",
      description:
        "Trae evidencia comercial REAL y VERIFICADA que el Motor de Decisión extrajo de las conversaciones de WhatsApp: quién preguntó precio, quién mostró interés en un producto, consultas de disponibilidad o condiciones, etc. Cada resultado es una cita textual de un mensaje real, con quién la dijo y cuándo. Usar para ejemplos de un tipo de señal ('quién preguntó por precios', 'quién consultó stock') o para ver qué dijo un contacto puntual (filtro telefono). Para 'qué oportunidades tengo' usar motor_prioridad_contactos (prioriza), no esta (ordena por fecha). Si no hay resultados, decilo con franqueza: puede ser que el Motor todavía no haya encontrado evidencia comercial en las conversaciones de esta cuenta.",
      parameters: {
        type: "object",
        properties: {
          tipo: {
            type: "string",
            enum: [
              "consulta_precio", "interes_producto", "consulta_disponibilidad",
              "consulta_condiciones", "consulta_logistica", "especificacion_demanda",
              "intencion_compra", "datos_reserva", "descarte",
              "objecion_precio", "objecion_tiempo", "objecion_confianza",
              "restriccion_presupuesto", "comparando_competencia",
            ],
            description: "Filtro por tipo de evidencia. USALO SIEMPRE que la pregunta sea sobre un tipo concreto: 'quién preguntó precios' → consulta_precio; 'quién consultó stock/disponibilidad' → consulta_disponibilidad; 'quién dijo que quería comprar' → intencion_compra; 'envíos/retiro/entregas' → consulta_logistica; 'cuotas/medios de pago/descuentos' → consulta_condiciones. Omitir solo para 'qué oportunidades detectaste' en general.",
          },
          telefono: {
            type: "string",
            description: "Filtro opcional: solo evidencia de un contacto puntual. Usar el teléfono que ya devolvió motor_prioridad_contactos, listar_contactos o buscar_contactos en esta conversación — no hace falta que sea del mismo turno: es la forma correcta de responder preguntas de seguimiento sobre un contacto ya identificado antes, como '¿por qué debería contactar a esa persona?', '¿qué dijo?', '¿qué evidencia hay?' o '¿por qué tiene esa prioridad?'.",
          },
          desde: { type: "string", description: "Fecha inicio YYYY-MM-DD (hora de Argentina). Omitir para no filtrar por fecha. NO lo uses cuando preguntan 'qué oportunidades tengo hoy' en el sentido de 'en este momento': solo si piden explícitamente un período ('las de hoy', 'esta semana', 'los últimos 7 días')." },
          hasta: { type: "string", description: "Fecha fin YYYY-MM-DD (hora de Argentina), exclusiva." },
          limite: { type: "integer", description: "Máximo de resultados (1-100). Por defecto 20." },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "motor_resumen_cuenta",
      description:
        "Panorama general y NÚMEROS TOTALES reales de la cuenta, calculados por el Motor: total de contactos, cuántas conversaciones se analizaron, cuántos contactos tienen intención de compra fuerte / moderada / débil / sin interés comercial, cuántas señales hay de cada tipo (consultas de precio, de disponibilidad, intenciones de compra, logística, etc.), cuántos contactos son prioritarios y cuántos se pueden contactar AHORA, y si hay catálogo verificado. Usala para 'cuántos contactos tengo', 'resumen del estado comercial', 'cuántos están listos para comprar', 'cuántos tienen intención fuerte/leve', 'qué es lo que más me consultan', 'cómo vienen mis oportunidades'. Es la ÚNICA fuente válida para totales: nunca cuentes filas de otra herramienta (vienen recortadas).",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "motor_demanda",
      description:
        "Qué piden concretamente los clientes, extraído por el Motor con cita textual: productos y marcas, variantes, cantidades/pesos, zonas o direcciones (lugar), modalidad (envío/retiro), presupuesto. Devuelve los términos más mencionados (con cuántos contactos distintos los mencionaron) y ejemplos reales. Usala para 'qué productos/marcas me piden más', 'alguien pidió cantidades grandes o por mayor' (atributo cantidad), 'de qué zonas me escriben' (atributo lugar), 'quién pidió envío o retiro' (atributo modalidad), 'quién busca X' cuando X es un producto o marca (atributo producto + texto).",
      parameters: {
        type: "object",
        properties: {
          atributo: {
            type: "string",
            enum: ["producto", "variante", "cantidad", "lugar", "modalidad", "presupuesto", "fecha", "perfil_grupo"],
            description: "Qué dimensión de la demanda traer. 'producto' para productos y marcas.",
          },
          texto: {
            type: "string",
            description: "Filtro opcional: palabra o marca a buscar dentro de lo pedido (ej: 'royal', 'gato', 'pipeta'). Una sola palabra o marca, sin frases largas.",
          },
        },
        required: ["atributo"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "motor_objeciones",
      description:
        "Objeciones, dudas y reclamos de los clientes: precio, demoras en la entrega, falta de stock, problemas con un producto o con la atención, desconfianza. Combina dos fuentes que NO hay que mezclar: 'motor_verificado' (objeciones que el Motor clasificó y verificó) y 'texto_posible' (mensajes reales de clientes que contienen palabras de reclamo o duda; son citas reales, pero la interpretación es aproximada). Usala para 'qué objeciones aparecen', 'de qué se quejan', 'qué dudas frenan la compra'.",
      parameters: {
        type: "object",
        properties: {
          dias: { type: "integer", description: "Cuántos días hacia atrás mirar (1-365). Por defecto 90." },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "conversaciones_pendientes",
      description:
        "Conversaciones que quedaron abiertas en un período, mirando el historial real: 'sin_responder' (el cliente escribió último y el negocio todavía no le contestó; se excluyen los simples 'gracias'/'ok') y 'esperando_al_cliente' (el negocio contestó último en una conversación con interés comercial real y el cliente no volvió a escribir). Cada fila trae la intención comercial del contacto. Usala para 'quiénes me escribieron y quedaron sin respuesta', 'qué conversaciones quedaron sin cerrar', 'a quién no le contesté'.",
      parameters: {
        type: "object",
        properties: {
          desde: { type: "string", description: "Fecha inicio YYYY-MM-DD (hora de Argentina). Por defecto, hace 7 días." },
          hasta: { type: "string", description: "Fecha fin YYYY-MM-DD (hora de Argentina), exclusiva. Omitir para hasta ahora." },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "motor_prioridad_contactos",
      description:
        "Trae la priorización que calculó el Motor de Decisión, con dos cosas DISTINTAS por contacto: 'elegible' (si el Motor lo considera comercialmente prioritario, en base a evidencia verificada) y 'contactable' (si AHORA MISMO conviene escribirle, según el análisis de momento/supresiones — puede ser false aunque elegible sea true, por ejemplo si escribió hace poco y conviene esperar). NUNCA trates 'elegible' como sinónimo de 'contactar ahora': un contacto puede ser elegible y no contactable todavía ('when_estado' trae por qué, y 'earliest_contact_at' desde cuándo sí). Si no hay ningún elegible, explicá el motivo real (ej. falta de evidencia comercial verificada) en vez de inventar una lista. Usar para 'quién mostró interés y no avanzó', 'qué clientes debería priorizar', 'a quién le escribo primero'.",
      parameters: {
        type: "object",
        properties: {
          limite: { type: "integer", description: "Máximo de contactos a traer (1-100). Por defecto 20." },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "motor_plan_preview",
      description:
        "Arma una propuesta de qué hacer con las oportunidades de la cuenta: prioridad (WHO), momento de contacto (WHEN) y, solo si el catálogo comercial está verificado, qué ofrecerle a cada uno (WHAT) y a quién seleccionar según presupuesto. Es de SOLO LECTURA: no crea ni envía nada, es una propuesta para conversar con el usuario. Usar cuando pida un plan de acción o una selección priorizada, no solo un listado — ej: '¿qué harías con mis oportunidades?', 'armame un plan', '¿qué debería hacer con estos leads?'. Para preguntas puramente informativas seguir usando motor_oportunidades o motor_prioridad_contactos.",
      parameters: {
        type: "object",
        properties: {
          presupuesto_creditos: {
            type: "integer",
            description: "Tope de créditos a considerar en la selección, SOLO si el usuario lo menciona explícitamente (ej: 'con máximo 20 créditos'). Omitir el campo por completo si no lo mencionó — no inventar ni asumir un presupuesto.",
          },
        },
        required: [],
      },
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
      name: "abrir_revision_motor",
      description:
        "Abre la pantalla de revisión humana del plan del Motor de Decisión (/panel/motor), donde el usuario revisa y aprueba paso a paso, con sus propios clicks, antes de que se cree o envíe absolutamente nada. Esta herramienta NUNCA crea, aprueba, reserva créditos ni ejecuta nada por sí misma — su único efecto es mostrarle al usuario un botón para ir a esa pantalla. Usala cuando, después de haber hablado de oportunidades, prioridad o el plan del Motor (motor_oportunidades, motor_prioridad_contactos, motor_plan_preview), el usuario exprese que quiere avanzar, revisar o aprobar ese plan — por ejemplo 'dale, revisemos el plan', 'quiero avanzar con esto', 'armemos esto', 'mostrame el plan para aprobarlo'. No la uses como respuesta a una pregunta puramente informativa: para eso seguí usando las herramientas de consulta del Motor. Esta herramienta no toma ningún parámetro: nunca inventes ni pases un tenant, un contacto, un plan, un presupuesto ni ningún otro dato — la pantalla resuelve todo eso por su cuenta. Después de llamarla, NUNCA digas que ya se creó, aprobó o envió algo: solo le abriste al usuario la pantalla donde puede decidir.",
      parameters: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "crear_audiencia_con_estos_contactos",
      description:
        "Abre el flujo de creación de audiencia con contactos concretos. Hay dos formas de indicar los contactos, y conviene usar la que corresponda:\n- filtro_temperatura: la MÁS confiable. Resuelve los contactos en el momento contra la base (ej: el usuario pide una audiencia con 'los calientes' o 'los fríos'). Usala siempre que el grupo se pueda describir por temperatura.\n- contacto_ids: solo si los ids salen de un resultado de listar_contactos o buscar_contactos de ESTE MISMO turno. Los ids NO sobreviven entre mensajes: si el usuario se refiere a contactos de un mensaje anterior, volvé a consultarlos con la herramienta correspondiente antes de usar esta.",
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
            description: "IDs de contactos de una consulta hecha en este mismo turno (listar_contactos/buscar_contactos). Omitir si usás filtro_temperatura o telefonos.",
          },
          telefonos: {
            type: "array",
            items: { type: "string" },
            description: "Teléfonos de los contactos, tal cual los devolvió una herramienta del Motor (motor_prioridad_contactos, motor_oportunidades, motor_demanda, conversaciones_pendientes) en este turno o en la conversación. Es la forma correcta de armar una audiencia con contactos del Motor: los teléfonos no cambian entre mensajes.",
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
        "Abre uno de los asistentes guiados de la plataforma. Para CREAR algo nuevo: 'crear_audiencia' (podés pasar un criterio en lenguaje natural), 'crear_template', 'crear_campana', 'importar_contactos'. Para MODIFICAR algo que ya existe: 'editar_audiencia' (renombrar), 'editar_campana' (cambiar nombre, template, audiencia o fecha de envío), 'editar_contacto' (cambiar temperatura). Usá los 'editar_*' cuando el usuario quiera cambiar algo existente, aunque no aclare cuál — el asistente le muestra la lista para que elija. Solo se pueden cambiar template, audiencia y fecha de campañas en borrador o programadas; si ya se envió, el asistente se lo explica al usuario.",
      parameters: {
        type: "object",
        properties: {
          flujo: {
            type: "string",
            enum: [
              "crear_audiencia", "crear_template", "crear_campana", "importar_contactos",
              "editar_audiencia", "editar_campana", "editar_contacto",
            ],
            description: "Cuál asistente abrir. Los 'editar_*' son para modificar algo que YA EXISTE: editar_audiencia sirve para renombrarla, editar_campana para cambiarle el nombre, el template, la audiencia o la fecha de envío, y editar_contacto para cambiarle la temperatura (caliente/tibio/frío). En esos casos se le muestra al usuario la lista para que elija cuál, así que NO hace falta que sepas de antemano a cuál se refiere.",
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
  // Datos que la herramienta quiere dejar disponibles para el PRÓXIMO turno.
  // Se mezclan en el draft del flowState que se devuelve. Existe porque los
  // resultados de herramientas no viajan en el historial: sin esto, una
  // referencia como "con ese contacto" no tiene contra qué resolverse.
  memoria?: IAFlowState["draft"];
}

/**
 * Zona horaria del negocio. Hoy todos los tenants son de Argentina; el
 * servidor (Vercel) corre en UTC, así que sin esto "hoy" pasaba a ser
 * "mañana" después de las 21 h y las fechas de las tablas salían corridas.
 * Argentina no tiene horario de verano desde 2009: el offset fijo es -03:00.
 */
const ZONA_HORARIA_NEGOCIO = "America/Argentina/Buenos_Aires";
const OFFSET_NEGOCIO = "-03:00";

function fechaCorta(v: string | null | undefined): string {
  if (!v) return "—";
  return new Date(v).toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: ZONA_HORARIA_NEGOCIO,
  });
}

/**
 * Convierte una fecha que manda el modelo ("2026-10-01") al instante en que
 * empieza ese día en hora de Argentina ("2026-10-01T00:00:00-03:00"). Antes
 * se mandaba tal cual y Postgres la interpretaba como medianoche UTC (21 h
 * del día anterior en Argentina). Si ya trae hora/zona, se respeta.
 */
function fechaLocalAInstante(v: unknown): string | null {
  if (typeof v !== "string" || !v.trim()) return null;
  const s = v.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return `${s}T00:00:00${OFFSET_NEGOCIO}`;
  // Fecha y hora sin zona → hora de Argentina.
  if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(s)) return `${s.replace(" ", "T")}${OFFSET_NEGOCIO}`;
  // ISO completo con zona: se respeta. Cualquier otra cosa ("hoy", "October 1")
  // se descarta en vez de mandarle a Postgres algo que no sabe leer.
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/.test(s)) return s;
  return null;
}

/**
 * Oculta datos sensibles que a veces aparecen en las citas textuales de los
 * clientes (CBU/CVU, alias bancario, tarjetas, DNI, CUIT, titular de una
 * cuenta). Se aplica a TODO texto libre que sale de las conversaciones hacia
 * el modelo o hacia una tabla: el chat no los necesita para responder nada y
 * no deben aparecer en pantalla. Nunca se aplica a los campos de teléfono.
 */
function enmascararDatosSensibles(texto: string | null | undefined): string {
  if (!texto) return texto ?? "";
  // Palabras de relleno que suelen ir entre la etiqueta y el dato
  // ("mi alias ES …", "alias DEL LOCAL: …", "el cbu es …").
  const relleno = String.raw`(?:\s+(?:es|son|del?|la|el|mi|local|cuenta|negocio|comercio))*\s*[:\-]?\s*`;
  const nombre = String.raw`[A-Za-zÁÉÍÓÚÜáéíóúüÑñ']+(?:\s+[A-Za-zÁÉÍÓÚÜáéíóúüÑñ']+){0,3}`;
  return texto
    .replace(/\b(?:\d[ -]?){21}\d\b/g, "[dato bancario oculto]")
    .replace(/\b(?:\d{4}[ -]?){3}\d{4}\b/g, "[tarjeta oculta]")
    .replace(new RegExp(String.raw`\b(cbu|cvu)${relleno}\d[\d -]{5,}\d`, "gi"), "$1 [oculto]")
    // Un alias bancario tiene forma de alias: palabras unidas por puntos
    // (juan.perez.mp) o un solo token de 6 a 20 caracteres. "pasame el
    // alias porfa" no se toca.
    .replace(
      new RegExp(String.raw`\b(alias(?:\s*(?:cbu|cvu))?)${relleno}([a-z0-9_-]+(?:\.[a-z0-9_-]+)+|[a-z0-9_-]{6,20}(?![a-z0-9_.-]))`, "gi"),
      (m, etiqueta: string, valor: string) =>
        /[.\d_-]/.test(valor) || valor.length >= 10 ? `${etiqueta} [oculto]` : m,
    )
    .replace(new RegExp(String.raw`\b(titular(?:\s+de\s+la\s+cuenta)?)${relleno}${nombre}`, "gi"), "$1: [oculto]")
    .replace(/\b(d\.?\s?n\.?\s?i\.?|documento)\s*(?:n[°º.]?|nro\.?|:)?\s*\d{1,2}\.?\d{3}\.?\d{3}\b/gi, "$1 [oculto]")
    .replace(/\b(cuit|cuil)\s*[:\-]?\s*\d{2}-?\d{8}-?\d\b/gi, "$1 [oculto]")
    .replace(/\b\d{2}-\d{8}-\d\b/g, "[CUIT/CUIL oculto]");
}

/** Estados del plan del Motor en lenguaje del usuario (nunca códigos internos en pantalla). */
const ETIQUETA_ESTADO_PLAN: Record<string, string> = {
  LISTO_AHORA: "Listo para escribirle",
  PROGRAMABLE: "Se puede programar",
  ESPERAR: "Conviene esperar",
  OFERTA_NO_VERIFICADA: "Falta cargar el catálogo",
  SIN_OFERTA: "Sin oferta que le sirva",
  FUERA_DE_PRESUPUESTO: "Fuera del presupuesto",
  EXCLUIDO: "No prioritario",
};

function ordenEstadoPlan(estado: string): number {
  const orden = ["LISTO_AHORA", "PROGRAMABLE", "FUERA_DE_PRESUPUESTO", "OFERTA_NO_VERIFICADA", "SIN_OFERTA", "ESPERAR", "EXCLUIDO"];
  const i = orden.indexOf(estado);
  return i === -1 ? orden.length : i;
}

const ETIQUETA_SENAL: Record<string, string> = {
  especificacion_demanda: "detallaron qué producto buscan (marca, tamaño, variedad, cantidad o zona)",
  consulta_precio: "preguntaron precios",
  consulta_disponibilidad: "preguntaron si hay stock o disponibilidad",
  intencion_compra: "dijeron que querían comprar",
  interes_producto: "mostraron interés en un producto sin dar detalles",
  consulta_condiciones: "preguntaron por medios de pago, cuotas o descuentos",
  consulta_logistica: "preguntaron por envíos, retiro o entregas",
  datos_reserva: "pasaron datos para concretar una compra o un pago",
  descarte: "dijeron que no les interesaba",
  objecion_precio: "objetaron el precio",
  objecion_tiempo: "objetaron los tiempos",
  objecion_confianza: "mostraron desconfianza",
};

const TITULO_DEMANDA: Record<string, string> = {
  producto: "Productos que piden",
  variante: "Variantes que piden",
  cantidad: "Cantidades pedidas",
  lugar: "Zonas y direcciones",
  modalidad: "Envío, retiro y entrega",
  presupuesto: "Presupuestos mencionados",
  fecha: "Fechas mencionadas",
  perfil_grupo: "Tipo de cliente",
};

const ETIQUETA_OBJECION: Record<string, string> = {
  objecion_precio: "Precio",
  objecion_tiempo: "Tiempos",
  objecion_confianza: "Confianza",
  restriccion_presupuesto: "Presupuesto",
  descarte: "Descartó",
  comparando_competencia: "Competencia",
  precio: "Precio (posible)",
  compra_en_otro_lado: "Compra en otro lado (posible)",
  demora_entrega: "Entrega (posible)",
  atencion: "Atención (posible)",
  stock: "Stock (posible)",
  duda_confianza: "Duda (posible)",
  reclamo_producto: "Reclamo (posible)",
};

const PALABRAS_VACIAS = new Set([
  "de", "del", "para", "la", "el", "los", "las", "un", "una", "unos", "unas", "y", "o", "con", "en",
  "x", "kg", "kgs", "kilo", "kilos", "k", "gr", "grs", "por", "que", "al", "sin", "a", "mas", "muy",
  "tenes", "tienen", "hay", "me", "mi", "lo", "le", "se", "es", "si", "no", "the", "and",
  "bolsa", "bolsas", "alimento", "alimentos", "comida",
]);

/** Palabras que en una dirección no indican la zona ("Sucursal San Miguel" → "san miguel"). */
const PALABRAS_VACIAS_LUGAR = new Set([
  "sucursal", "calle", "av", "avenida", "timbre", "piso", "depto", "dpto", "entre", "esquina",
  "local", "casa", "barrio", "zona", "provincia", "pcia", "prov", "nro", "numero", "altura",
]);

/** Palabras que describen el producto pero no son una marca ni un producto ("adulto", "perro"…). */
const PALABRAS_GENERICAS_PRODUCTO = new Set([
  "adulto", "adultos", "adulta", "cachorro", "cachorros", "puppy", "senior", "perro", "perros", "perra",
  "gato", "gatos", "gata", "raza", "razas", "pequena", "pequenas", "pequeno", "mediana", "mediano",
  "grande", "grandes", "chica", "chico", "mini", "medium", "seco", "humedo", "balanceado", "kilo",
]);

/** Cuántos contactos buscan cosas para perro y cuántos para gato. */
function contarPorEspecie(filas: { valor: string; cita: string; telefono: string }[]) {
  const perro = new Set<string>();
  const gato = new Set<string>();
  for (const f of filas) {
    const t = `${f.valor} ${f.cita}`.toLowerCase();
    if (/\b(perr[oa]s?|cachorr[oa]s?|puppy|dog)\b/.test(t)) perro.add(f.telefono);
    if (/\b(gat[oa]s?|felin[oa]s?|cat)\b/.test(t)) gato.add(f.telefono);
  }
  return { perro: perro.size, gato: gato.size };
}

/** Cuántas unidades pide un texto ("10 bolsas de 20k" → 10; "una bolsa de 15 kg" → 0). */
function unidadesPedidas(texto: string): number {
  let max = 0;
  const re = /(\d+)\s*(bolsas?|bolsones?|unidades|u\.|cajas?|bultos?|packs?|paquetes?|latas?|pipetas?|cajones?)/gi;
  for (const m of texto.matchAll(re)) max = Math.max(max, Number(m[1]));
  return max;
}

/**
 * Cuenta qué términos (palabras sueltas y pares de palabras, ej. "royal
 * canin", "pro plan") aparecen en lo que piden los clientes, por cantidad de
 * CONTACTOS distintos — no por menciones, para que un cliente insistente no
 * infle un producto. Sirve para "qué marcas/productos me piden más".
 */
function terminosMasMencionados(filas: { valor: string; telefono: string }[], extraVacias?: Set<string>) {
  const vacia = (t: string) => PALABRAS_VACIAS.has(t) || !!extraVacias?.has(t);
  const porTermino = new Map<string, Set<string>>();
  const sumar = (t: string, quien: string) => {
    if (!porTermino.has(t)) porTermino.set(t, new Set());
    porTermino.get(t)!.add(quien);
  };
  filas.forEach((f, i) => {
    const quien = f.telefono || `sin-telefono-${i}`;
    // Sin acentos (la "ñ" queda como "n" tras quitar las marcas combinadas).
    const tokens = (f.valor ?? "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9 ]+/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 1);
    for (const t of new Set(tokens)) {
      if (!vacia(t) && !/^\d+$/.test(t)) sumar(t, quien);
    }
    // Pares solo de palabras realmente contiguas ("pro plan", "royal canin");
    // un número o una palabra vacía en el medio corta el par.
    for (let j = 0; j < tokens.length - 1; j++) {
      const a = tokens[j];
      const b = tokens[j + 1];
      if (vacia(a) || vacia(b) || /^\d+$/.test(a) || /^\d+$/.test(b)) continue;
      sumar(`${a} ${b}`, quien);
    }
  });
  const lista = [...porTermino.entries()]
    .map(([termino, quienes]) => ({ termino, contactos: quienes.size }))
    .filter((t) => t.contactos >= 2);
  // Si "royal canin" tiene los mismos contactos que "royal", la palabra
  // suelta no agrega nada: se descarta para no gastar lugares del top.
  const pares = lista.filter((t) => t.termino.includes(" "));
  // Si un par ("royal canin", 21) cubre casi todas las menciones de una
  // palabra suelta ("royal", 25), la palabra suelta no agrega nada.
  return lista
    .filter((t) => t.termino.includes(" ") ||
      !pares.some((p) => p.contactos >= 0.7 * t.contactos && p.termino.split(" ").includes(t.termino)))
    .sort((x, y) => y.contactos - x.contactos || y.termino.length - x.termino.length)
    .slice(0, 25);
}

/** Texto amable para el momento de contacto que calculó WHEN. */
function momentoContacto(f: {
  contactable: boolean | null;
  when_estado: string | null;
  earliest_contact_at?: string | null;
}): string {
  if (estaContactableAhora(f)) return "Sí, ahora";
  if (f.when_estado === "ESPERAR_HASTA") {
    return f.earliest_contact_at ? `Esperar (desde ${fechaHoraCorta(f.earliest_contact_at)})` : "Esperar";
  }
  if (f.when_estado === "NO_CONTACTAR") return "No por ahora";
  return "Sin dato";
}

/**
 * WHEN se calcula en un momento dado y queda guardado: una espera "hasta las
 * 10:49 de hoy" sigue figurando como no contactable aunque ya hayan pasado.
 * Si la espera ya venció, se puede escribir ahora.
 */
function estaContactableAhora(f: {
  contactable: boolean | null;
  when_estado: string | null;
  earliest_contact_at?: string | null;
}): boolean {
  if (f.contactable) return true;
  return f.when_estado === "ESPERAR_HASTA" && !!f.earliest_contact_at &&
    Date.parse(f.earliest_contact_at) <= Date.now();
}

function fechaHoraCorta(v: string): string {
  return new Date(v).toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: ZONA_HORARIA_NEGOCIO,
  }) + " h";
}

/** Por qué el Motor dice que conviene esperar o no escribirle (códigos de WHEN/WHO). */
const MOTIVO_MOMENTO: Record<string, string> = {
  S_CONVERSACION_ACTIVA: "tuvo una conversación con el negocio hace muy poco (menos de 48 h): conviene no interrumpirla",
  S_SIN_RESPUESTA_REITERADA: "no respondió a los últimos mensajes del negocio (varios turnos seguidos sin respuesta)",
  S_CAMPANA_RECIENTE: "recibió una campaña hace pocos días",
  S_DESCARTE_RECIENTE: "dijo hace poco que no le interesaba",
  S_PREFERENCIA_CANAL_DECLARADA: "pidió que lo contacten por otro medio",
};

function pct(v: number | null | undefined): string {
  if (v == null) return "—";
  return `${(Number(v) * 100).toFixed(1)}%`;
}

/**
 * Resuelve teléfonos al ID de yamas_send_leads (id + nombre) — el espacio de
 * IDs que realmente usan audiencias y campañas (yamas_send_listas.contactos_ids,
 * el selector de contactos, el detalle de audiencia). NO usar
 * yamas_send_contactos.id acá: es una tabla distinta, con su propio id, y
 * usarla producía audiencias con contactos_ids "válidos" pero que no
 * correspondían a ningún lead real (bug encontrado en la prueba manual de G4).
 * Un teléfono sin fila en yamas_send_leads simplemente no aparece en el mapa
 * devuelto — no se crea ningún lead ni se inventa ningún id.
 */
async function resolverContactoIdsPorTelefono(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tenantId: string,
  telefonos: string[],
): Promise<Map<string, { id: string; nombre: string | null }>> {
  const mapa = new Map<string, { id: string; nombre: string | null }>();
  if (telefonos.length === 0) return mapa;
  const { data, error } = await supabase
    .from("yamas_send_leads")
    .select("id, telefono, nombre")
    .eq("tenant_id", tenantId)
    .eq("activo", true)
    .in("telefono", telefonos);
  if (error) {
    console.error("[IA] Error resolviendo teléfonos a leads:", error);
    return mapa;
  }
  for (const fila of data ?? []) {
    if (fila.telefono) mapa.set(fila.telefono, { id: fila.id, nombre: fila.nombre });
  }
  return mapa;
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
      p_desde: fechaLocalAInstante(args.desde),
      p_hasta: fechaLocalAInstante(args.hasta),
      p_orden_por: typeof args.orden_por === "string" ? args.orden_por : "fecha",
      p_direccion: typeof args.direccion === "string" ? args.direccion : "desc",
      p_limite: typeof args.limite === "number" ? args.limite : 20,
    });
    if (error) return { datos: { error: error.message } };
    const filas = (data ?? []) as {
      nombre: string; status: string; enviado_at: string; contactos_count: number;
      mensajes_ok: number; leidos: number; respondidos: number; tasa_respuesta: number; costo_usd: number | null;
    }[];

    // costo_usd es el costo real que nos cobra Meta por campaña — dato
    // interno, nunca al modelo. Cada fila que ve el modelo lleva
    // creditos_usados en su lugar (mensajes_ok ya representa exactamente eso:
    // 1 crédito por cada mensaje efectivamente enviado).
    const filasParaModelo = filas.map((f) => ({
      nombre: f.nombre,
      status: f.status,
      enviado_at: f.enviado_at,
      contactos_count: f.contactos_count,
      mensajes_ok: f.mensajes_ok,
      leidos: f.leidos,
      respondidos: f.respondidos,
      tasa_respuesta: f.tasa_respuesta,
      creditos_usados: f.mensajes_ok,
    }));

    return {
      datos: filasParaModelo,
      tabla: filas.length
        ? {
            titulo: "Tus campañas",
            columnas: ["Campaña", "Enviada", "Mensajes", "Leídos"],
            filas: filas.slice(0, MAX_FILAS_TABLA).map((f) => {
              const enviados = Number(f.mensajes_ok ?? 0);
              const leidos = Number(f.leidos ?? 0);
              return [
                f.nombre,
                fechaCorta(f.enviado_at),
                String(enviados),
                `${leidos} (${pct(enviados > 0 ? leidos / enviados : 0)})`,
              ];
            }),
            totalDisponible: filas.length,
          }
        : undefined,
    };
  }

  if (nombre === "motor_oportunidades") {
    const { data, error } = await supabase.rpc("chat_oportunidades", {
      p_tenant_id: tenantId,
      p_tipo: typeof args.tipo === "string" ? args.tipo : null,
      p_telefono: typeof args.telefono === "string" ? args.telefono : null,
      p_desde: fechaLocalAInstante(args.desde),
      p_hasta: fechaLocalAInstante(args.hasta),
      p_limite: typeof args.limite === "number" ? args.limite : 20,
    });
    if (error) return { datos: { error: error.message } };
    const filas = ((data ?? []) as {
      contacto_nombre: string; telefono: string; tipo: string; cita: string;
      fecha: string; episodio_id: string; mensaje_id: string;
    }[]).map((f) => ({ ...f, cita: enmascararDatosSensibles(f.cita) }));
    const telefonosUnicos = Array.from(new Set(filas.map((f) => f.telefono)));
    const mapaContactos = await resolverContactoIdsPorTelefono(supabase, tenantId, telefonosUnicos);
    return {
      datos: filas,
      tabla: filas.length
        ? {
            titulo: "Oportunidades detectadas por el Motor",
            columnas: ["Contacto", "Qué dijo", "Cuándo"],
            filas: filas.slice(0, MAX_FILAS_TABLA).map((f) => [
              f.contacto_nombre,
              f.cita,
              fechaCorta(f.fecha),
            ]),
            totalDisponible: filas.length,
          }
        : undefined,
      // Igual que ultimaBusqueda: se guarda para que "sí, a esos" en el
      // turno siguiente se resuelva contra la base, no contra lo que el
      // modelo "se acuerde". contactoId queda null cuando el teléfono no
      // tiene un contacto activo asociado (no se inventa ningún id).
      memoria: telefonosUnicos.length
        ? {
            propuestaMotor: {
              contactos: telefonosUnicos.map((tel) => ({
                telefono: tel,
                nombre: filas.find((f) => f.telefono === tel)?.contacto_nombre || tel,
                contactoId: mapaContactos.get(tel)?.id ?? null,
              })),
            },
          }
        : undefined,
    };
  }

  if (nombre === "motor_prioridad_contactos") {
    const { data, error } = await supabase.rpc("chat_prioridad_contactos", {
      p_tenant_id: tenantId,
      p_limite: typeof args.limite === "number" ? args.limite : 20,
    });
    if (error) return { datos: { error: error.message } };
    const filas = ((data ?? []) as {
      contacto_nombre: string; telefono: string; elegible: boolean;
      score_normalizado: number | null; motivos_exclusion: unknown;
      evidencias_utilizadas: { id?: string; tipo?: string; cita?: string }[] | null;
      suprimido_ahora: boolean | null; when_estado: string | null;
      contactable: boolean | null; earliest_contact_at: string | null;
      calculado_at: string;
    }[]).map((f) => ({
      ...f,
      // Hasta 4 evidencias por contacto, citas cortas: con limite alto la
      // lista completa pasaba el tope de caracteres y se cortaba a la mitad.
      evidencias_utilizadas: (f.evidencias_utilizadas ?? []).slice(0, 4).map((e) => ({
        tipo: e.tipo,
        cita: enmascararDatosSensibles(e.cita).slice(0, 180),
      })),
      // Mismo texto que ve el usuario en la tabla, para que la respuesta
      // escrita y la tabla nunca se contradigan.
      momento: momentoContacto(f),
    }));
    // Totales reales (la lista viene recortada por "limite"): sin esto el
    // modelo contaba filas y decía cosas como "ninguno se puede contactar"
    // mientras la tabla mostraba varios "Sí".
    const [{ data: resumenCuenta }, { data: motivosEspera }, { data: enEspera }] = await Promise.all([
      supabase.rpc("chat_resumen_cuenta", { p_tenant_id: tenantId }),
      supabase.rpc("chat_motivos_espera", { p_tenant_id: tenantId }),
      supabase.rpc("chat_prioritarios_en_espera", { p_tenant_id: tenantId }),
    ]);
    // TODOS los prioritarios a los que hoy no conviene escribir (la lista de
    // arriba viene recortada por score y dejaba afuera a varios).
    const prioritariosEnEspera = ((enEspera ?? []) as {
      contacto_nombre: string; telefono: string; score: number | null; when_estado: string | null;
      earliest_contact_at: string | null; motivos: string[] | null;
    }[]).map((e) => ({
      contacto: e.contacto_nombre,
      telefono: e.telefono,
      score: e.score,
      momento: momentoContacto({ contactable: false, when_estado: e.when_estado, earliest_contact_at: e.earliest_contact_at }),
      motivo: (e.motivos ?? []).map((c) => MOTIVO_MOMENTO[c]).filter(Boolean).join("; ") || "regla de momento del Motor",
    }));
    const resumenPrioridad =
      (resumenCuenta as { prioridad?: Record<string, number> } | null)?.prioridad ?? null;
    // Por qué conviene esperar / no escribirle, en palabras (antes el modelo
    // lo deducía de las citas y llegó a inventar "por un error de transferencia").
    const motivoPorTelefono = new Map<string, string>();
    for (const m of (motivosEspera ?? []) as { telefono: string; motivos: string[] | null }[]) {
      const textos = (m.motivos ?? []).map((c) => MOTIVO_MOMENTO[c]).filter(Boolean);
      if (textos.length) motivoPorTelefono.set(m.telefono, textos.join("; "));
    }
    for (const f of filas) {
      (f as typeof f & { motivo_momento?: string }).motivo_momento =
        estaContactableAhora(f) ? undefined : motivoPorTelefono.get(f.telefono);
    }
    const elegibles = filas.filter((f) => f.elegible);
    // Solo tiene sentido proponer para audiencia a los elegibles (los
    // excluidos ya se explican con su motivo, no son una selección válida).
    const telefonosElegibles = Array.from(new Set(elegibles.map((f) => f.telefono)));
    const mapaContactos = await resolverContactoIdsPorTelefono(supabase, tenantId, telefonosElegibles);
    return {
      // El modelo ve todo (elegibles y no-elegibles con su motivo) para
      // poder explicar honestamente por qué alguien no entra en la
      // priorización, en vez de mostrar una lista vacía sin contexto.
      // Incluye contactable/when_estado/earliest_contact_at para que el
      // modelo pueda distinguir "elegible" (WHO) de "conviene escribirle
      // ahora" (WHEN) — nunca son lo mismo.
      datos: {
        totales_de_la_cuenta: resumenPrioridad,
        prioritarios_a_los_que_hoy_no_conviene_escribir: prioritariosEnEspera,
        contactos: filas.slice(0, 40).map((f) => ({
          contacto_nombre: f.contacto_nombre,
          telefono: f.telefono,
          elegible: f.elegible,
          score_normalizado: f.score_normalizado,
          motivos_exclusion: f.elegible ? undefined : f.motivos_exclusion,
          evidencias_utilizadas: f.evidencias_utilizadas,
          contactable_ahora: estaContactableAhora(f),
          momento: f.momento,
          motivo_momento: (f as typeof f & { motivo_momento?: string }).motivo_momento,
        })),
      },
      tabla: elegibles.length
        ? {
            titulo: "Prioridad de contacto (Motor)",
            columnas: ["Contacto", "Score", "¿Escribirle ahora?"],
            filas: elegibles.slice(0, MAX_FILAS_TABLA).map((f) => [
              f.contacto_nombre,
              String(f.score_normalizado ?? "—"),
              f.momento,
            ]),
            totalDisponible: resumenPrioridad?.prioritarios ?? elegibles.length,
          }
        : undefined,
      memoria: telefonosElegibles.length
        ? {
            propuestaMotor: {
              contactos: telefonosElegibles.map((tel) => ({
                telefono: tel,
                nombre: elegibles.find((f) => f.telefono === tel)?.contacto_nombre || tel,
                contactoId: mapaContactos.get(tel)?.id ?? null,
              })),
            },
          }
        : undefined,
    };
  }

  if (nombre === "motor_plan_preview") {
    // Fase 2.2: RPC de SOLO LECTURA (motor.calcular_plan_preview vía el
    // wrapper public.chat_plan_preview). No persiste ningún plan, no crea
    // drafts, no reserva créditos ni crea execution intents — es un cálculo
    // en memoria sobre lo que el Motor ya analizó (WHO/WHEN/WHAT). Mismo
    // patrón de tenant_id resuelto server-side que el resto de las
    // herramientas del Motor.
    const presupuestoCreditos =
      typeof args.presupuesto_creditos === "number" ? args.presupuesto_creditos : null;
    const { data, error } = await supabase.rpc("chat_plan_preview", {
      p_tenant_id: tenantId,
      p_presupuesto_creditos: presupuestoCreditos,
    });
    if (error) return { datos: { error: error.message } };
    const filas = (data ?? []) as {
      plan_estado: string; plan_candidatos_evaluados: number; plan_n_seleccionados: number;
      plan_n_futuros: number; plan_n_excluidos: number; plan_costo_estimado_creditos: number | null;
      plan_catalogo_verificado_count: number;
      contacto_key: string; contacto_nombre: string; estado_candidato: string;
      seleccionado: boolean; orden: number | null;
      who_score: number | null; who_elegible: boolean; who_suprimido: boolean;
      when_estado: string | null; when_nivel_evidencia: string | null; contactable: boolean | null;
      earliest_contact_at: string | null;
      what_oferta_nombre: string | null; what_match: number | null; what_cobertura: number | null;
      what_ambiguedad: boolean;
      bucket_calidad: string | null;
      costo_creditos: number | null; costo_estado: string | null;
      motivo: unknown; snapshot_who: unknown; snapshot_when: unknown;
    }[];
    // No se propone contactoId/memoria para audiencia todavía: esta tool
    // es narración de una propuesta, no el punto de entrada a crear una
    // campaña. Eso queda para cuando conectemos plan -> draft (Fase 3).
    //
    // "datos" NO manda las filas crudas de la RPC: cada fila trae
    // snapshot_who/snapshot_when (volcados internos de motor.candidatos/
    // when_resultados, ~2KB cada uno) que el propio prompt ya le prohíbe
    // mostrar al usuario, y repite los campos de nivel-plan en cada fila.
    // Con un tenant de 20+ contactos eso arma un JSON de 80K+ caracteres
    // que superaba el límite de truncamiento del loop del agente — el
    // modelo terminaba viendo un fragmento invalido de los primeros 1-2
    // contactos y nunca los que en realidad hacían falta para responder.
    // Acá se manda un resumen de plan (una vez) + un objeto compacto por
    // candidato con solo los campos que la narración necesita — "motivo"
    // sigue trayendo el detalle estructurado (who/match/cobertura/bucket/
    // when) que reemplaza a los snapshots para explicar el "por qué".
    // A quién se le puede escribir AHORA no depende del catálogo: se agrega
    // el total real para que el modelo no lo invente ni cuente filas cuando
    // el plan está bloqueado por falta de catálogo.
    const { data: resumenCuentaPlan } = await supabase.rpc("chat_resumen_cuenta", { p_tenant_id: tenantId });
    const prioridadCuenta =
      (resumenCuentaPlan as { prioridad?: Record<string, number> } | null)?.prioridad ?? null;
    const resumenPlan = filas[0]
      ? {
          contactos_para_escribir_ahora: prioridadCuenta?.contactables_ahora ?? null,
          contactos_prioritarios: prioridadCuenta?.prioritarios ?? null,
          plan_estado: filas[0].plan_estado,
          plan_catalogo_verificado_count: filas[0].plan_catalogo_verificado_count,
          plan_candidatos_evaluados: filas[0].plan_candidatos_evaluados,
          plan_n_seleccionados: filas[0].plan_n_seleccionados,
          plan_n_futuros: filas[0].plan_n_futuros,
          plan_n_excluidos: filas[0].plan_n_excluidos,
          plan_costo_estimado_creditos: filas[0].plan_costo_estimado_creditos,
        }
      : {
          plan_estado: null,
          plan_catalogo_verificado_count: 0,
          contactos_para_escribir_ahora: prioridadCuenta?.contactables_ahora ?? null,
          contactos_prioritarios: prioridadCuenta?.prioritarios ?? null,
        };
    const candidatos = filas.map((f) => ({
      contacto_nombre: f.contacto_nombre,
      estado_candidato: f.estado_candidato,
      seleccionado: f.seleccionado,
      who_score: f.who_score,
      who_elegible: f.who_elegible,
      who_suprimido: f.who_suprimido,
      when_estado: f.when_estado,
      when_nivel_evidencia: f.when_nivel_evidencia,
      contactable: f.contactable,
      earliest_contact_at: f.earliest_contact_at,
      what_oferta_nombre: f.what_oferta_nombre,
      what_match: f.what_match,
      what_cobertura: f.what_cobertura,
      what_ambiguedad: f.what_ambiguedad,
      bucket_calidad: f.bucket_calidad,
      costo_creditos: f.costo_creditos,
      motivo: f.motivo,
    }));
    // Con cientos de contactos evaluados, mandar todos los candidatos pasaba
    // el límite de caracteres del loop y el modelo veía solo los primeros
    // (casi siempre EXCLUIDOS). Se mandan completos los que tienen algo para
    // hacer y, de los excluidos, solo la cantidad y algunos ejemplos.
    // ~450 caracteres por candidato: 30 entran holgados en el tope del loop.
    const accionables = candidatos
      .filter((c) => c.estado_candidato !== "EXCLUIDO")
      .sort((a, b) => ordenEstadoPlan(a.estado_candidato) - ordenEstadoPlan(b.estado_candidato)
        || (b.who_score ?? -1) - (a.who_score ?? -1));
    const excluidos = candidatos.filter((c) => c.estado_candidato === "EXCLUIDO");
    return {
      datos: {
        resumen_plan: resumenPlan,
        candidatos_con_oportunidad: accionables.slice(0, 30),
        candidatos_con_oportunidad_total: accionables.length,
        excluidos: { cantidad: excluidos.length, ejemplos: excluidos.slice(0, 5) },
      },
      tabla: filas.length
        ? {
            titulo: "Propuesta del Motor",
            columnas: ["Contacto", "Situación", "Score", "¿Escribirle ahora?"],
            // Primero los que tienen algo para hacer y al final los excluidos:
            // antes la tabla abría con filas "EXCLUIDO" que no aportaban nada.
            filas: [...filas]
              .sort((a, b) => ordenEstadoPlan(a.estado_candidato) - ordenEstadoPlan(b.estado_candidato)
                || (b.who_score ?? -1) - (a.who_score ?? -1))
              .slice(0, MAX_FILAS_TABLA)
              .map((f) => [
                f.contacto_nombre,
                ETIQUETA_ESTADO_PLAN[f.estado_candidato] ?? "—",
                String(f.who_score ?? "—"),
                momentoContacto({
                  contactable: f.contactable,
                  when_estado: f.when_estado,
                  earliest_contact_at: f.earliest_contact_at,
                }),
              ]),
            totalDisponible: filas.length,
          }
        : undefined,
      // No es dato de la tabla en sí, pero el modelo lo necesita para saber
      // si puede hablar de "a quién ofrecerle qué" (WHAT) o solo de
      // prioridad/momento (WHO/WHEN). Nunca elige una oferta si esto es
      // false, ni completa una moneda faltante.
      memoria: undefined,
    };
  }

  if (nombre === "buscar_contactos") {
    const consulta = typeof args.consulta === "string" ? args.consulta : "";
    if (!consulta.trim()) return { datos: { error: "consulta vacía" } };

    // 1. Poner al día los embeddings que falten. Es incremental (solo los
    //    leads cuyo análisis cambió) y nunca lanza: si OpenAI no responde,
    //    la búsqueda sigue igual apoyada en las ramas de texto completo,
    //    que es exactamente lo que hacía antes de existir la semántica.
    let embeddingConsulta: { perfil: string; mensaje: string } | null = null;
    try {
      const openai = getOpenAI();
      await Promise.all([
        sincronizarEmbeddingsLeads(openai, supabase, tenantId),
        sincronizarEmbeddingsMensajes(openai, supabase, tenantId),
      ]);
      embeddingConsulta = await generarEmbeddingConsulta(openai, consulta);
    } catch (e) {
      console.error("[IA] Capa semántica no disponible, sigo con texto completo:", e);
    }

    const temperatura =
      typeof args.temperatura === "string" && ["caliente", "tibio", "frio"].includes(args.temperatura)
        ? args.temperatura
        : null;
    const scoreMinimo =
      typeof args.score_minimo === "number" && Number.isFinite(args.score_minimo)
        ? Math.max(0, Math.min(100, Math.round(args.score_minimo)))
        : null;
    const limitePedido =
      typeof args.limite === "number" && Number.isFinite(args.limite)
        ? Math.max(1, Math.min(100, Math.round(args.limite)))
        : 15;

    // 2. Corte por presupuesto. Se calcula en CRÉDITOS (1 crédito = 1
    //    mensaje), la única unidad que el usuario compra y ve. El costo real
    //    en dólares que nos cobra Meta es un dato interno que nunca debe
    //    llegar a esta herramienta ni al mensaje que arma el modelo.
    const cupoPresupuesto =
      typeof args.presupuesto_mensajes === "number" && args.presupuesto_mensajes > 0
        ? Math.floor(args.presupuesto_mensajes)
        : null;

    if (cupoPresupuesto != null && cupoPresupuesto < 1) {
      return {
        datos: {
          error: "Ese presupuesto no alcanza ni para un mensaje.",
        },
      };
    }

    // Cuando hay corte por presupuesto se pide bastante de más a la base:
    // el recorte se aplica acá, y así se puede decir con precisión cuántos
    // contactos quedaron afuera por plata en vez de solo cuántos entraron.
    const filasAPedir = cupoPresupuesto != null ? 100 : limitePedido;

    const { data, error } = await supabase.rpc("yamas_send_buscar_contactos_hibrido", {
      p_tenant_id: tenantId,
      p_consulta: consulta,
      p_embedding: embeddingConsulta?.perfil ?? null,
      p_embedding_msg: embeddingConsulta?.mensaje ?? null,
      p_limite: filasAPedir,
      p_temperatura: temperatura,
      p_score_min: scoreMinimo,
      p_similitud_min_msg: SIMILITUD_MINIMA_MENSAJE,
      p_similitud_min_perfil: SIMILITUD_MINIMA_PERFIL,
    });

    if (error) return { datos: { error: error.message } };

    const encontrados = (data ?? []) as {
      contacto_id: string | null;
      nombre: string;
      telefono: string;
      temperatura: string | null;
      score_interes: number | null;
      producto_servicio: string | null;
      menciones: number;
      motivo: string;
      evidencia_fecha: string | null;
      similitud: number;
      relevancia: number;
      fuentes: string[];
    }[];

    const tope = Math.min(limitePedido, cupoPresupuesto ?? limitePedido);
    const filas = encontrados.slice(0, tope);
    const recortadosPorPresupuesto =
      cupoPresupuesto != null ? Math.max(0, encontrados.length - tope) : 0;

    return {
      datos: {
        contactos: filas.map((f) => ({
          contacto_id: f.contacto_id,
          nombre: f.nombre,
          telefono: f.telefono,
          temperatura: f.temperatura,
          score_interes: f.score_interes,
          motivo: enmascararDatosSensibles(f.motivo),
          evidencia_fecha: f.evidencia_fecha,
          // Distingue las coincidencias RESPALDADAS POR UN MENSAJE REAL de
          // las que solo salen del análisis del lead. Es la diferencia entre
          // "este contacto escribió esto" (verificable) y "el resumen de este
          // contacto se parece" (que sobre resúmenes casi idénticos entre sí
          // es una señal floja). El prompt le pide al modelo que no presente
          // las segundas como si el contacto hubiera dicho algo.
          respaldado_por_mensaje:
            f.fuentes?.some((x) => x === "mensaje_semantico" || x === "conversacion") ?? false,
        })),
        total_encontrados: encontrados.length,
        mostrados: filas.length,
        recortados_por_presupuesto: recortadosPorPresupuesto,
        cupo_presupuesto: cupoPresupuesto,
        busqueda_semantica_activa: embeddingConsulta != null,
      },
      tabla: filas.length
        ? {
            titulo:
              cupoPresupuesto != null
                ? `Mejores ${filas.length} para "${consulta}" (tu presupuesto)`
                : `Contactos que coinciden con "${consulta}"`,
            columnas: ["Nombre", "Teléfono", "Temperatura", "Por qué"],
            filas: filas.slice(0, MAX_FILAS_TABLA).map((f) => [
              f.nombre,
              f.telefono,
              f.temperatura ?? "—",
              enmascararDatosSensibles((f.motivo ?? "").replace(/\*\*/g, "").trim()) || "—",
            ]),
            totalDisponible: filas.length,
          }
        : undefined,
      // Se guardan los contactos encontrados para que en el turno siguiente
      // "armá una audiencia con esos" se resuelva contra la base, sin
      // depender de que el modelo recuerde ids que ya no tiene delante.
      memoria: filas.some((f) => f.contacto_id)
        ? {
            ultimaBusqueda: {
              consulta,
              contactos: filas
                .filter((f) => f.contacto_id)
                .map((f) => ({
                  contactoId: f.contacto_id as string,
                  nombre: f.nombre,
                  telefono: f.telefono,
                  temperatura: f.temperatura,
                })),
            },
          }
        : undefined,
    };
  }

  if (nombre === "metricas_periodo") {
    const { data, error } = await supabase
      .rpc("analytics_resumen_periodo", {
        p_tenant_id: tenantId,
        p_desde: fechaLocalAInstante(args.desde) ?? new Date(Date.now() - 30 * 864e5).toISOString(),
        p_hasta: fechaLocalAInstante(args.hasta) ?? new Date().toISOString(),
      })
      .maybeSingle();
    if (error) return { datos: { error: error.message } };

    // analytics_resumen_periodo trae costo_total_usd (el costo real que nos
    // cobra Meta) para uso interno. Nunca se lo pasamos al modelo: se arma un
    // objeto nuevo con solo lo que corresponde ver, más creditos_usados, que
    // es la unidad que el cliente entiende (1 crédito = 1 mensaje, y cada
    // mensaje insertado en yamas_send_mensajes ya consumió exactamente uno).
    const metricas = (data ?? {}) as {
      campanas_enviadas?: number;
      mensajes_enviados?: number;
      mensajes_entregados?: number;
      mensajes_leidos?: number;
      mensajes_respondidos?: number;
      mensajes_error?: number;
      tasa_entrega?: number;
      tasa_lectura?: number;
      tasa_respuesta?: number;
    };

    return {
      datos: {
        campanas_enviadas: metricas.campanas_enviadas ?? 0,
        mensajes_enviados: metricas.mensajes_enviados ?? 0,
        mensajes_entregados: metricas.mensajes_entregados ?? 0,
        mensajes_leidos: metricas.mensajes_leidos ?? 0,
        mensajes_respondidos: metricas.mensajes_respondidos ?? 0,
        mensajes_error: metricas.mensajes_error ?? 0,
        tasa_entrega: metricas.tasa_entrega ?? 0,
        tasa_lectura: metricas.tasa_lectura ?? 0,
        tasa_respuesta: metricas.tasa_respuesta ?? 0,
        creditos_usados: metricas.mensajes_enviados ?? 0,
      },
    };
  }

  if (nombre === "mejor_horario_envio") {
    const { data, error } = await supabase
      .rpc("analytics_mejor_horario_envio", {
        p_tenant_id: tenantId,
        p_minimo_muestras: 20,
        p_minimo_por_hora: 5,
      })
      .maybeSingle();
    if (error) return { datos: { error: error.message } };

    // Complemento cuando todavía no hay envíos suficientes: cuándo escriben
    // los clientes por su cuenta (hora de Argentina). No es una tasa de
    // respuesta a campañas, y el prompt le pide al modelo aclararlo.
    const { data: actividad } = await supabase.rpc("chat_actividad_horaria", {
      p_tenant_id: tenantId,
      p_dias: 90,
      p_timezone: ZONA_HORARIA_NEGOCIO,
    });
    const act = actividad as {
      por_hora?: { hora: number; mensajes: number; clientes: number }[];
      por_dia_semana?: { dia: string; mensajes: number; clientes: number }[];
      clientes_distintos?: number;
      mensajes_de_clientes?: number;
      error?: string;
    } | null;
    let actividadDeClientes: unknown = null;
    if (act && !act.error && (act.mensajes_de_clientes ?? 0) > 0) {
      // Franjas de 2 horas ordenadas por cantidad de clientes distintos
      // (no por mensajes: una sola charla larga no debe inflar una franja).
      const porHora = new Map((act.por_hora ?? []).map((h) => [h.hora, h]));
      const franjas = Array.from({ length: 12 }, (_, i) => {
        const a = porHora.get(i * 2);
        const b = porHora.get(i * 2 + 1);
        return {
          franja: `${String(i * 2).padStart(2, "0")}:00 a ${String(i * 2 + 2).padStart(2, "0")}:00`,
          clientes: (a?.clientes ?? 0) + (b?.clientes ?? 0),
          mensajes: (a?.mensajes ?? 0) + (b?.mensajes ?? 0),
        };
      }).sort((x, y) => y.clientes - x.clientes);
      actividadDeClientes = {
        zona_horaria: "hora de Argentina",
        dias_analizados: 90,
        clientes_distintos: act.clientes_distintos,
        mensajes_de_clientes: act.mensajes_de_clientes,
        franjas_con_mas_clientes: franjas.slice(0, 4),
        dias_de_la_semana: [...(act.por_dia_semana ?? [])].sort((x, y) => y.clientes - x.clientes),
      };
    }
    return { datos: { por_envios: data ?? {}, actividad_de_clientes: actividadDeClientes } };
  }

  if (nombre === "motor_resumen_cuenta") {
    const { data, error } = await supabase.rpc("chat_resumen_cuenta", { p_tenant_id: tenantId });
    if (error) return { datos: { error: error.message } };
    // Los tipos de señal van con su nombre en criollo: con el código interno
    // ("especificacion_demanda") el chat lo repetía tal cual al usuario.
    const resumen = (data ?? {}) as { senales_por_tipo?: { tipo: string; menciones: number; contactos: number }[] };
    return {
      datos: {
        ...resumen,
        senales_por_tipo: (resumen.senales_por_tipo ?? []).map((s) => ({
          que_hicieron: ETIQUETA_SENAL[s.tipo] ?? s.tipo,
          menciones: s.menciones,
          contactos: s.contactos,
        })),
      },
    };
  }

  if (nombre === "motor_demanda") {
    const atributo = typeof args.atributo === "string" ? args.atributo : "producto";
    const texto = typeof args.texto === "string" && args.texto.trim() ? args.texto.trim().slice(0, 60) : null;
    type FilaDemanda = {
      atributo: string; valor: string; rol: string | null; contacto_nombre: string;
      telefono: string; cita: string; fecha: string;
    };
    const traer = async (attr: string, txt: string | null) => {
      const { data, error } = await supabase.rpc("chat_demanda", {
        p_tenant_id: tenantId,
        p_atributo: attr,
        p_texto: txt,
        p_limite: 500,
      });
      if (error) throw new Error(error.message);
      return ((data ?? []) as FilaDemanda[]).map((f) => ({
        ...f,
        valor: enmascararDatosSensibles(f.valor).slice(0, 120),
        cita: enmascararDatosSensibles(f.cita).slice(0, 200),
      }));
    };
    let filas: FilaDemanda[];
    try {
      // Para "por mayor" siempre se miran TODAS las cantidades: un filtro de
      // texto ("mayor", "grande") dejaba la lista vacía y el chat decía que no
      // había pedidos grandes cuando sí los había.
      filas = await traer(atributo, atributo === "cantidad" ? null : texto);
    } catch (e) {
      return { datos: { error: (e as Error).message } };
    }
    const contactos = new Set(filas.map((f) => f.telefono).filter(Boolean));
    const ejemplo = (f: FilaDemanda) => ({
      contacto: f.contacto_nombre,
      telefono: f.telefono,
      valor: f.valor,
      cita: f.cita,
      fecha: fechaCorta(f.fecha),
    });
    const base = {
      atributo,
      filtro_texto: texto,
      menciones: filas.length,
      contactos_distintos: contactos.size,
      // La RPC trae hasta 500: si llegó al tope, los totales son una muestra.
      resultado_recortado: filas.length >= 500,
    };

    // "Qué productos/marcas/zonas piden más": la respuesta es un RANKING, y la
    // tabla también (antes mostraba las últimas filas, que no decían nada de
    // qué era lo más pedido).
    if (!texto && (atributo === "producto" || atributo === "variante" || atributo === "lugar")) {
      const ranking = terminosMasMencionados(
        filas,
        atributo === "lugar" ? PALABRAS_VACIAS_LUGAR : PALABRAS_GENERICAS_PRODUCTO,
      );
      const porEspecie = atributo === "producto" ? contarPorEspecie(filas) : undefined;
      return {
        datos: {
          ...base,
          ranking_por_contactos: ranking,
          contactos_por_tipo_de_mascota: porEspecie,
          ejemplos: filas.slice(0, 25).map(ejemplo),
        },
        tabla: ranking.length
          ? {
              titulo: TITULO_DEMANDA[atributo] ?? "Lo que piden tus clientes",
              columnas: [atributo === "lugar" ? "Zona o lugar" : "Producto o marca", "Contactos que lo mencionaron"],
              filas: ranking.slice(0, MAX_FILAS_TABLA).map((t) => [t.termino, String(t.contactos)]),
            }
          : undefined,
      };
    }

    // "¿Alguien pidió cantidades grandes o por mayor?": una bolsa de 15 o
    // 20 kg es el tamaño normal de venta, no una compra grande. Se marca como
    // posible compra por mayor solo cuando piden VARIAS unidades, o cuando el
    // cliente se presenta como comercio (perfil_grupo, ej. "pet shop").
    if (atributo === "cantidad") {
      let perfiles: FilaDemanda[] = [];
      try {
        perfiles = await traer("perfil_grupo", null);
      } catch {
        perfiles = [];
      }
      const porMayor = filas.filter((f) => unidadesPedidas(`${f.valor} ${f.cita}`) >= 3);
      const comercios = perfiles.filter((f) => /(shop|tienda|veterinari|local|comercio|negocio|revend|mayorista|distribu|petshop|forrajer)/i.test(f.valor));
      const destacadas = [...porMayor, ...comercios];
      return {
        datos: {
          ...base,
          posibles_compras_por_mayor: porMayor.map(ejemplo),
          clientes_que_se_presentan_como_comercio: comercios.map(ejemplo),
          criterio: "Se considera compra grande o por mayor pedir 3 o más unidades/bolsas, o presentarse como comercio. Una sola bolsa (aunque sea de 15 o 20 kg) es una compra normal.",
          otras_cantidades_mencionadas: filas.filter((f) => !porMayor.includes(f)).slice(0, 30).map((f) => ({
            contacto: f.contacto_nombre, valor: f.valor, fecha: fechaCorta(f.fecha),
          })),
        },
        tabla: destacadas.length
          ? {
              titulo: "Posibles compras por mayor",
              columnas: ["Contacto", "Pidió", "Qué dijo", "Cuándo"],
              filas: destacadas.slice(0, MAX_FILAS_TABLA).map((f) => [f.contacto_nombre, f.valor, f.cita, fechaCorta(f.fecha)]),
              totalDisponible: destacadas.length,
            }
          : undefined,
      };
    }

    return {
      datos: { ...base, ejemplos: filas.slice(0, 60).map(ejemplo) },
      tabla: filas.length
        ? {
            titulo: TITULO_DEMANDA[atributo] ?? "Lo que piden tus clientes",
            columnas: ["Contacto", "Pidió", "Qué dijo", "Cuándo"],
            filas: filas.slice(0, MAX_FILAS_TABLA).map((f) => [
              f.contacto_nombre,
              f.valor,
              f.cita,
              fechaCorta(f.fecha),
            ]),
            totalDisponible: filas.length,
          }
        : undefined,
    };
  }

  if (nombre === "motor_objeciones") {
    const dias =
      typeof args.dias === "number" && Number.isFinite(args.dias)
        ? Math.min(365, Math.max(1, Math.round(args.dias)))
        : 90;
    const { data, error } = await supabase.rpc("chat_objeciones", {
      p_tenant_id: tenantId,
      p_dias: dias,
      p_limite: 40,
    });
    if (error) return { datos: { error: error.message } };
    const filas = ((data ?? []) as {
      fuente: "motor_verificado" | "texto_posible"; categoria: string; contacto_nombre: string;
      telefono: string; cita: string; fecha: string;
    }[]).map((f) => ({ ...f, cita: enmascararDatosSensibles(f.cita).slice(0, 220) }));
    const verificadas = filas.filter((f) => f.fuente === "motor_verificado");
    const posibles = filas.filter((f) => f.fuente === "texto_posible");
    const porCategoria: Record<string, number> = {};
    for (const f of posibles) porCategoria[f.categoria] = (porCategoria[f.categoria] ?? 0) + 1;
    return {
      datos: {
        dias,
        objeciones_verificadas_por_el_motor: verificadas.map((f) => ({
          tipo: f.categoria, contacto: f.contacto_nombre, cita: f.cita, fecha: fechaCorta(f.fecha),
        })),
        posibles_reclamos_o_dudas_en_mensajes: {
          aclaracion: "Mensajes reales de clientes con palabras de reclamo o duda (los 40 más recientes como máximo). La categoría es aproximada: leé cada cita antes de afirmar qué le pasó al cliente.",
          cantidad_por_categoria_en_esta_muestra: porCategoria,
          muestra_recortada: posibles.length >= 40,
          mensajes: posibles.map((f) => ({
            categoria: f.categoria, contacto: f.contacto_nombre, cita: f.cita, fecha: fechaCorta(f.fecha),
          })),
        },
      },
      tabla: filas.length
        ? {
            titulo: "Objeciones y reclamos",
            columnas: ["Contacto", "Qué dijo", "Tema", "Cuándo"],
            filas: filas.slice(0, MAX_FILAS_TABLA).map((f) => [
              f.contacto_nombre,
              f.cita,
              ETIQUETA_OBJECION[f.categoria] ?? "Otro",
              fechaCorta(f.fecha),
            ]),
            totalDisponible: filas.length,
          }
        : undefined,
    };
  }

  if (nombre === "conversaciones_pendientes") {
    const hasta = fechaLocalAInstante(args.hasta);
    // Sin "desde": los 7 días anteriores a "hasta" (o a ahora).
    const desde =
      fechaLocalAInstante(args.desde) ??
      new Date((hasta ? Date.parse(hasta) : Date.now()) - 7 * 864e5).toISOString();
    const { data, error } = await supabase.rpc("chat_conversaciones_pendientes", {
      p_tenant_id: tenantId,
      p_desde: desde,
      p_hasta: hasta,
      p_limite: 50,
    });
    if (error) return { datos: { error: error.message } };
    const filas = ((data ?? []) as {
      estado: "sin_responder" | "esperando_al_cliente"; contacto_nombre: string; telefono: string;
      ultimo_mensaje: string; ultimo_mensaje_at: string; mensajes_cliente_sin_respuesta: number;
      intencion: string;
    }[]).map((f) => ({ ...f, ultimo_mensaje: enmascararDatosSensibles(f.ultimo_mensaje).slice(0, 200) }));
    return {
      datos: {
        desde: fechaCorta(desde),
        sin_responder: filas.filter((f) => f.estado === "sin_responder").map((f) => ({
          contacto: f.contacto_nombre, telefono: f.telefono, ultimo_mensaje_del_cliente: f.ultimo_mensaje,
          cuando: fechaCorta(f.ultimo_mensaje_at), mensajes_sin_respuesta: f.mensajes_cliente_sin_respuesta,
          intencion_comercial: f.intencion,
        })),
        esperando_al_cliente: filas.filter((f) => f.estado === "esperando_al_cliente").map((f) => ({
          contacto: f.contacto_nombre, telefono: f.telefono, ultimo_mensaje_del_negocio: f.ultimo_mensaje,
          cuando: fechaCorta(f.ultimo_mensaje_at), intencion_comercial: f.intencion,
        })),
      },
      tabla: filas.length
        ? {
            titulo: "Conversaciones abiertas",
            columnas: ["Contacto", "Situación", "Último mensaje", "Cuándo"],
            filas: filas.slice(0, MAX_FILAS_TABLA).map((f) => [
              f.contacto_nombre,
              f.estado === "sin_responder" ? "Falta responderle" : "Esperando al cliente",
              f.ultimo_mensaje,
              fechaCorta(f.ultimo_mensaje_at),
            ]),
            totalDisponible: filas.length,
          }
        : undefined,
    };
  }

  if (nombre === "abrir_revision_motor") {
    // AI-MOTOR-1.9 — handoff Chat IA -> revisión humana del Motor.
    //
    // Deliberadamente NO llama a ninguna Server Action ni RPC del Motor
    // (ni prepararPlanMotorAction, ni motor_plan_preview, nada que cree,
    // apruebe, reserve o ejecute). El único chequeo que hace es de
    // AUTORIZACIÓN — no de negocio: getCurrentMembership() está memoizado
    // con React cache() dentro de este mismo request (sendIAMessageAction
    // ya lo resolvió al validar assertPermiso("usar_ia")), así que esto no
    // agrega un round-trip nuevo. Es el mismo patrón de autorización que
    // usa el resto de la app, aplicado ANTES de ofrecer la tarjeta: si el
    // usuario no tiene "ver_motor", el agente ni siquiera abre el flowState
    // (evita el caso en que el chat prometa algo que /panel/motor después
    // le va a negar).
    const membership = await getCurrentMembership();
    if (!membership?.permisos.ver_motor) {
      return {
        datos: {
          error:
            "Este usuario no tiene permiso para revisar el Motor de Decisión todavía. No ofrezcas la revisión del plan; si preguntó por oportunidades o prioridad, seguí respondiendo con las herramientas de consulta del Motor.",
        },
      };
    }

    return {
      datos: { ok: true },
      accion: {
        text: "Dale, te dejo la revisión del plan lista para que la abras cuando quieras — ahí vas a poder aprobar o descartar paso a paso, no se creó ni se aprobó nada todavía.",
        payload: { kind: "revisar_motor" },
        // Sin flujo multi-turno: no hay ningún paso siguiente que
        // sendIAMessageAction deba manejar acá (a diferencia de
        // crear_audiencia/abrir_flujo). La única interacción restante es
        // el click humano en la tarjeta, que navega fuera del chat — por
        // eso el flowState vuelve a quedar en IA_FLOW_IDLE en vez de
        // inventar un IAFlowKind nuevo para un "flujo" que no tiene pasos.
        flowState: IA_FLOW_IDLE,
      },
    };
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
    const telefonosPedidos = Array.isArray(args.telefonos)
      ? args.telefonos.filter((v): v is string => typeof v === "string").map((t) => t.replace(/\D/g, "")).filter(Boolean)
      : [];

    if (telefonosPedidos.length && !filtroTemp && idsPedidos.length === 0) {
      // Contactos que vienen del Motor: se resuelven por teléfono contra la
      // base (los teléfonos sí sobreviven entre mensajes; los ids no).
      const mapa = await resolverContactoIdsPorTelefono(supabase, tenantId, telefonosPedidos.slice(0, 500));
      idsValidos = Array.from(new Set(Array.from(mapa.values()).map((v) => v.id)));
      if (idsValidos.length === 0) {
        return {
          datos: {
            error: "Ninguno de esos teléfonos corresponde a un contacto activo de la cuenta. Volvé a consultarlos con la herramienta del Motor y reintentá con los teléfonos que devuelva.",
          },
        };
      }
    } else if (filtroTemp) {
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
    const criterio =
      typeof args.criterio === "string" && args.criterio.trim() ? args.criterio.trim() : null;

    // Normalizamos el valor recibido en vez de exigir coincidencia exacta
    // con el enum. El modelo a veces manda variantes ("renombrar_campana",
    // "editar campaña", "cambiar_nombre_campana") y antes cualquiera de
    // esas caía en "Flujo desconocido", el agente no recibía la acción y
    // terminaba narrando que había abierto un asistente que nunca se abrió.
    const crudo = typeof args.flujo === "string" ? args.flujo : "";
    const norm = crudo
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[\s-]+/g, "_");

    const esEdicion = /edit|renombr|cambi|modific/.test(norm);
    const mencionaCampana = /campan/.test(norm);
    const mencionaAudiencia = /audiencia|lista|grupo/.test(norm);
    const mencionaContacto = /contacto|lead|temperatura/.test(norm);
    const mencionaTemplate = /template|plantilla|mensaje/.test(norm);

    if (esEdicion && mencionaCampana) {
      return { datos: { ok: true }, accion: await iniciarFlujoEditarRecurso("campana") };
    }
    if (esEdicion && mencionaAudiencia) {
      return { datos: { ok: true }, accion: await iniciarFlujoEditarRecurso("audiencia") };
    }
    if (esEdicion && mencionaContacto) {
      return { datos: { ok: true }, accion: await iniciarFlujoEditarRecurso("contacto") };
    }
    if (mencionaCampana) {
      return { datos: { ok: true }, accion: await iniciarFlujoCrearCampana() };
    }
    if (mencionaTemplate) {
      return { datos: { ok: true }, accion: iniciarFlujoCrearTemplate() };
    }
    if (mencionaAudiencia) {
      return { datos: { ok: true }, accion: await iniciarFlujoCrearAudiencia(criterio) };
    }
    if (/import|sincroniz/.test(norm)) {
      return { datos: { ok: true }, accion: await iniciarFlujoImportarContactos() };
    }

    return {
      datos: {
        error: `No reconocí el flujo "${crudo}". Valores válidos: crear_audiencia, crear_template, crear_campana, importar_contactos, editar_audiencia, editar_campana, editar_contacto. Reintentá con uno de esos exactamente.`,
      },
    };
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
  // "Hoy" en hora de Argentina, no en UTC: el servidor corre en UTC y después
  // de las 21 h el modelo creía que ya era el día siguiente (y filtraba
  // "oportunidades de hoy" por una fecha sin datos).
  const ahora = new Date();
  const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: ZONA_HORARIA_NEGOCIO }).format(ahora);
  const hoyLegible = new Intl.DateTimeFormat("es-AR", {
    timeZone: ZONA_HORARIA_NEGOCIO,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(ahora);
  const horaLocal = new Intl.DateTimeFormat("es-AR", {
    timeZone: ZONA_HORARIA_NEGOCIO,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(ahora);

  const lineasContexto = contexto
    ? [
        contexto.nombreUsuario && `El usuario se llama ${contexto.nombreUsuario}.`,
        contexto.nombreEmpresa && `Su empresa es "${contexto.nombreEmpresa}".`,
        contexto.rubro && `Rubro: ${contexto.rubro}.`,
        contexto.descripcionNegocio && `Descripción del negocio: ${contexto.descripcionNegocio}.`,
        contexto.publicoObjetivo && `Público objetivo: ${contexto.publicoObjetivo}.`,
        contexto.tonoComunicacion && `Tono que prefiere la marca: ${contexto.tonoComunicacion}.`,
        contexto.diferenciales && `Diferenciales del negocio: ${contexto.diferenciales}.`,
        contexto.productos.length &&
          `Productos y servicios que ofrece:\n${formatearProductos(contexto.productos)}`,
      ].filter(Boolean)
    : [];

  const systemPrompt = `Sos el asistente de YamaSend, una plataforma de mensajería masiva por WhatsApp. Estás charlando con el dueño o encargado de la cuenta, dentro del panel de la app. Hoy es ${hoyLegible} (${hoy}) y son las ${horaLocal}, hora de Argentina. Todas las fechas que les pases a las herramientas (YYYY-MM-DD) se interpretan en hora de Argentina.

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

BUSCAR CONTACTOS POR INTERÉS Y PRESUPUESTO
- buscar_contactos entiende el significado, no solo las palabras: si te piden "los que compran zapatillas", pasale eso tal cual, no lo traduzcas a palabras clave sueltas.
- Cada resultado trae un "motivo". Cuando respaldado_por_mensaje es true, ese motivo es un MENSAJE REAL que escribió el contacto y podés citarlo con confianza. Cuando es false, la coincidencia sale del análisis del contacto y es una señal más floja: en ese caso NO digas que el contacto dijo o mencionó algo, decí que por su perfil podría encajar.
- Si NINGÚN resultado tiene respaldado_por_mensaje en true, no presentes la lista como si hubieran hablado del tema: decí con franqueza que no encontraste a nadie que lo haya mencionado, y ofrecé los que podrían encajar por perfil como una segunda opción.
- Nunca hables de embeddings, vectores ni "búsqueda semántica". En criollo: "por lo que venía hablando".
- La plataforma cobra en CRÉDITOS: 1 crédito = 1 mensaje. Si el usuario da un presupuesto en cantidad de mensajes o créditos, pasalo en presupuesto_mensajes.
- Nunca hables de dólares, ni del costo real que nos cobra Meta por mensaje: eso es información interna, el usuario solo debe pensar en créditos. Si el presupuesto viene en pesos, en dólares o en cualquier otra moneda, NO lo conviertas ni lo estimes vos. Decile con franqueza que la plataforma trabaja en créditos (1 crédito = 1 mensaje) y preguntale a cuántos créditos equivale su presupuesto, y con esa respuesta hacé la búsqueda.
- Cuando recortaste por presupuesto, aclaralo: cuántos entran y cuántos quedaron afuera.

QUÉ HERRAMIENTA USAR (elegí la que responde exactamente lo que preguntan)
- Totales, panorama, "cuántos contactos tengo", "cuántos están listos para comprar", "cuántos tienen intención fuerte / interés leve" → motor_resumen_cuenta. "Qué es lo que más me consultan" → motor_resumen_cuenta (qué TIPO de consulta: precio, stock, envíos…) y además motor_demanda con atributo producto (QUÉ productos y marcas). Es la ÚNICA fuente para totales: el total de contactos es TOTAL_CONTACTOS_DE_LA_CUENTA (nunca sumes las intensidades para sacar el total, ni uses contactos_con_conversacion_analizada ni plan_candidatos_evaluados como total). Nunca cuentes las filas de otra herramienta (vienen recortadas).
- Ejemplos de un tipo de señal ("quién preguntó precios", "quién consultó stock", "quién dijo que quería comprar", "quién preguntó por envíos") → motor_oportunidades CON el filtro tipo que corresponda.
- Productos o marcas más pedidos, cantidades grandes o compras por mayor, zonas o direcciones, envío/retiro → motor_demanda con el atributo que corresponda. Para "más pedidos" o "de qué zonas" usá ranking_por_contactos (es lo que muestra la tabla). Para compras grandes usá posibles_compras_por_mayor y clientes_que_se_presentan_como_comercio: una sola bolsa de 15 o 20 kg es una compra normal, nunca la presentes como compra grande o por mayor; si esas listas están vacías, decí que no encontraste pedidos por mayor.
- Objeciones, reclamos, dudas, quejas → motor_objeciones.
- Quién escribió y quedó sin respuesta o sin cerrar en un período → conversaciones_pendientes.
- "Qué oportunidades de venta tengo (hoy)" → motor_prioridad_contactos (los mejores para escribir ahora, con su motivo) y, si sirve, motor_resumen_cuenta para el panorama. NO uses motor_oportunidades para esta pregunta: ordena por fecha, no por oportunidad.
- A quién contactar primero / prioridad → motor_prioridad_contactos. "¿A quién no conviene contactar?" → motor_prioridad_contactos y respondé con prioritarios_a_los_que_hoy_no_conviene_escribir (completa, con su motivo). Un plan de acción → motor_plan_preview.
- Mejor día y horario para escribir → mejor_horario_envio.
- Interés por un tema descrito libremente ("los que buscan alimento para gato") → buscar_contactos (o motor_demanda si es un producto o marca concreta).
- Si ninguna herramienta trae el dato que piden (facturación, ventas, ganancias, stock real del local, precios del catálogo, opiniones sobre la competencia que nadie expresó), decí con franqueza que ese dato no lo tenés y qué sí podés mostrar. No llames a una herramienta "por las dudas" para rellenar.

LAS TRES INTENSIDADES DE INTERÉS (motor_resumen_cuenta.intencion_de_compra)
- fuerte: el cliente expresó intención de compra concreta, pidió reservar o pasó datos para concretar (o dio 3+ datos concretos más una consulta comercial).
- moderada: consulta comercial clara (precio, stock, condiciones) o 1-2 datos concretos de lo que busca.
- débil: interés vago, un dato aislado o solo el saludo de un anuncio.
- sin_interes_comercial: charla personal, proveedores, mensajes automáticos.
- "Listos para comprar" ≈ fuerte; "solo consultaron" ≈ moderada + débil; "sin interés" = sin_interes_comercial. "Clientes potenciales" = clientes_potenciales_fuerte_moderada_o_debil. Aclará que es una clasificación por la conversación, no una venta confirmada, y que hay contactos_sin_conversacion_para_analizar que no entran en esa cuenta.

EL MOTOR DE DECISIÓN (oportunidades y prioridad)
- motor_oportunidades y motor_prioridad_contactos consultan lo que el Motor de Decisión ya analizó de las conversaciones reales. Son la fuente correcta para "quién preguntó por precios", "quién debería priorizar", "qué oportunidades tengo" (prioridad), "por qué contactar a este cliente".
- "¿Qué oportunidades tengo hoy?" significa "qué oportunidades tengo en este momento": NO filtres por la fecha de hoy salvo que pidan explícitamente las de un período ("las de hoy", "esta semana").
- Leé las citas antes de presentar algo como oportunidad: un pago o una transferencia hecha por error, un reclamo, una devolución o un problema con un pedido NO son una oportunidad de venta — presentalos como algo a resolver ("este cliente tiene un problema pendiente: …"), nunca como "listo para comprar".
- Cada resultado de motor_oportunidades es una cita textual real: cuando la uses, citá lo que la persona dijo. Si la ponés entre comillas, tiene que ser EXACTA, letra por letra (con sus errores de tipeo); si la parafraseás, sin comillas. Nunca le agregues un motivo o una intención que el cliente no dijo.
- Si motor_oportunidades o motor_prioridad_contactos devuelven vacío, o todos los contactos vienen sin elegible, NO digas "no tenés oportunidades" sin más: mirá el motivo que trae el dato (por ejemplo, falta de evidencia comercial verificada todavía) y contalo con naturalidad — es información real sobre el estado del análisis, no una falla.
- Estas dos herramientas son de solo consulta: nunca generan ni ejecutan ninguna campaña, audiencia ni envío por sí mismas.
- motor_prioridad_contactos trae "totales_de_la_cuenta" (prioritarios, contactables_ahora, conviene_esperar, no_contactar_por_ahora) y "contactos" (los primeros de la lista, cada uno con "momento", el mismo texto que ve el usuario en la tabla). Para cualquier número usá totales_de_la_cuenta. Lo que digas sobre si se le puede escribir ahora a alguien tiene que coincidir con su "momento": si la tabla dice "Sí, ahora", nunca digas que no se puede contactar.
- motor_prioridad_contactos trae DOS cosas que NUNCA hay que confundir: "elegible" (prioridad comercial, decidida por WHO) y "contactable" (si conviene escribirle AHORA, decidido por WHEN — puede ser distinto de elegible). Al recomendar a quién contactar primero, priorizá siempre "contactable_ahora": a un prioritario con contactable_ahora=false presentalo como "es prioritario, pero conviene esperar" y explicá el por qué ÚNICAMENTE con "motivo_momento" (y "momento" para decir desde cuándo). Nunca deduzcas el motivo de espera a partir de las citas del cliente (por ejemplo, un reclamo o una transferencia NO son el motivo de espera).
- Una recomendación de prioridad siempre tiene que poder respaldarse con evidencia verificable, nunca solo con el score: el score por sí solo no es una explicación. motor_prioridad_contactos ya trae evidencias_utilizadas con tipo y cita real por contacto — usalo para explicar el "por qué" si alcanza. Si necesitás más detalle o más contexto del que trae esa lista, llamá motor_oportunidades filtrando por ese mismo teléfono.

EL MOTOR DE DECISIÓN — PROPUESTA DE PLAN (motor_plan_preview)
- Usala cuando te pidan un plan de acción o una selección priorizada, no solo un listado: "¿qué harías con mis oportunidades?", "armame un plan", "¿qué debería hacer con estos leads?". Para preguntas puramente informativas seguí usando motor_oportunidades / motor_prioridad_contactos como hasta ahora.
- Es de SOLO LECTURA: no crea audiencias, campañas ni nada — es una propuesta calculada para que la charlemos con el usuario, nunca la presentes como una acción ya hecha.
- El plan responde QUÉ OFRECERLE a cada uno. Si está bloqueado porque falta el catálogo (plan_catalogo_verificado_count = 0), eso NO significa que no se le pueda escribir a nadie: a quién y cuándo escribir lo sigue diciendo motor_prioridad_contactos. Nunca digas "no hay contactos listos" solo porque el plan está bloqueado por catálogo; decí cuántos contactos hay para escribirles ahora (resumen_plan.contactos_para_escribir_ahora) y que, para recomendar qué ofrecerle a cada uno, falta cargar el catálogo.
- El resultado trae "resumen_plan" (una vez), "candidatos_con_oportunidad" (los que no quedaron excluidos) y "excluidos" (cantidad y ejemplos). Basate ÚNICAMENTE en esos campos. Nunca inventes una oferta, un costo, un timing, un score o un motivo que no esté ahí. No hay snapshots crudos que consultar: todo lo que necesitás para explicar el "por qué" ya está en "motivo" de cada candidato (trae el código y los valores — who/match/cobertura/bucket/when — que llevaron a esa clasificación).
- "resumen_plan.plan_catalogo_verificado_count" te dice CUÁNTAS ofertas verificadas hay ahora mismo, no es un valor fijo — puede ser 0 o puede no serlo, depende de la cuenta y el momento:
  - Si es 0: el catálogo comercial todavía no está verificado. Podés hablar de prioridad (WHO) y de cuándo conviene escribirle (WHEN), pero no de qué ofrecerle a cada uno. Nunca elijas vos una oferta ni completes una moneda faltante para simular que sí hay catálogo.
  - Si es mayor a 0: el catálogo YA está verificado. Nunca digas "el catálogo no está verificado" ni "todavía no se verificó el catálogo" en ese caso — sería directamente falso.
- El "estado_candidato" de cada contacto ya resume la razón real — nunca lo reinterpretes ni lo cambies por una explicación genérica de "falta evidencia":
  - EXCLUIDO: no es prioritario ahora. Explicá el motivo real que traiga "motivo" (por ejemplo, falta de evidencia comercial verificada, o una supresión) — no asumas que es siempre por lo mismo.
  - ESPERAR: SÍ hay una oportunidad real, pero el momento (WHEN) todavía no es el indicado — explicá que conviene esperar y, si "earliest_contact_at" trae una fecha, decila.
  - SIN_OFERTA: el contacto superó prioridad y momento, pero NINGUNA de las ofertas verificadas es compatible con lo que pidió. Esto es un resultado del catálogo, no una falta de evidencia — nunca lo redactes como "no hay evidencia comercial suficiente", porque si llegó hasta acá es porque esa evidencia existe.
  - OFERTA_NO_VERIFICADA: como SIN_OFERTA, pero porque el catálogo todavía no tiene ninguna oferta verificada (coherente con plan_catalogo_verificado_count=0) — ahí sí correspondía decir que falta verificar el catálogo.
  - FUERA_DE_PRESUPUESTO: había una oferta compatible, pero no entra dentro del tope de créditos pedido — explicalo como tema de presupuesto, no como que falte oferta o evidencia.
  - LISTO_AHORA / PROGRAMABLE con "seleccionado" en true: ahí sí hay una oferta real elegida por el Motor — nombrala usando "what_oferta_nombre" tal cual viene, sin agregar precio, condiciones ni ningún dato que el resultado no traiga.
- Si la cuenta tiene varios contactos con estados distintos, contalo así: quiénes están listos, quiénes conviene esperar, y para quiénes no hay oferta que les sirva — no lo aplanes todo a una sola frase genérica.
- No muestres el JSON crudo, los códigos internos (LISTO_AHORA, BAJO_CALIDAD_MINIMA, etc.) ni ningún id técnico al usuario: traducilo a lenguaje natural, cercano.
- Si el usuario menciona un tope de créditos explícito, pasalo en presupuesto_creditos. Si no lo menciona, no le pongas presupuesto vos.
- Si después de ver oportunidades, prioridad o el plan del Motor el usuario dice que quiere avanzar, revisar o aprobar eso (ej. "dale, revisemos el plan", "quiero avanzar con esto", "armemos esto", "mostrame el plan para aprobarlo"), usá abrir_revision_motor. Esta herramienta no toma ningún parámetro y NUNCA crea, aprueba, reserva créditos ni ejecuta nada — solo le muestra al usuario un botón para ir a la pantalla donde él mismo revisa y aprueba paso a paso. Después de usarla, NUNCA digas que ya se creó, aprobó o envió una campaña, un draft o un plan: lo único que pasó es que le abriste esa pantalla. Si la herramienta te devuelve un error de permiso, no insistas ni la reintentes: explicale con naturalidad que todavía no tiene ese permiso habilitado.

ACCIONES QUE PODÉS EJECUTAR
- Si el usuario pide armar una audiencia, usá crear_audiencia_con_estos_contactos.
- MUY IMPORTANTE: los resultados de las herramientas NO se guardan entre mensajes. Solo ves el texto de la conversación previa, no los datos que consultaste antes. Entonces, si el usuario dice "creá una audiencia con esos" refiriéndose a contactos de un mensaje anterior, PRIMERO volvé a consultarlos ahora (con listar_contactos o buscar_contactos) y recién después creá la audiencia. Si el grupo se puede describir por temperatura, es más simple y confiable usar el parámetro filtro_temperatura.
- Nunca llames a crear_audiencia_con_estos_contactos con ids que "te acordás" de un mensaje anterior: no sobreviven y la llamada va a fallar. Si el usuario se refiere a un contacto que apareció en una búsqueda previa, volvé a correr buscar_contactos con la MISMA consulta en este turno, tomá el contacto_id del resultado nuevo, y recién ahí armá la audiencia.
- Si una herramienta te devuelve un error, leelo y corregí en el mismo turno (por ejemplo, volviendo a consultar los datos). No le traslades el error al usuario si podés resolverlo vos.
- NUNCA digas que abriste un asistente, que creaste algo o que hiciste una acción si la herramienta correspondiente no te devolvió un resultado exitoso. Si falló, decí que no pudiste y ofrecé reintentar — nunca narres una acción que no ocurrió.
- Si pide crear una audiencia/template/campaña o importar contactos sin referirse a contactos concretos, usá abrir_flujo.
- Si pide MODIFICAR algo que ya existe (renombrar una audiencia o campaña, cambiarle la temperatura a un contacto), usá abrir_flujo con editar_audiencia / editar_campana / editar_contacto. No hace falta que sepas cuál: el asistente le muestra la lista para que elija. Nunca le digas que no podés hacer estos cambios.
- Estas acciones abren un asistente guiado donde el usuario confirma antes de que se cree nada. No prometas que ya lo hiciste: decí que se lo abrís para confirmar.
- Si el pedido es ambiguo (no sabés qué contactos incluir, o qué acción quiere), preguntá antes de abrir un flujo.

CONTACTOS DE UNA RESPUESTA ANTERIOR
- Si el usuario se refiere a una lista que le diste antes ("uno de los que me pasaste", "el primero", "ese contacto"), buscá esa lista en los mensajes anteriores de esta conversación y elegí un contacto de ESA lista (decí cuál elegiste). Después consultá sus datos con motor_oportunidades filtrando por su teléfono. Nunca elijas un contacto que no estaba en esa lista.

ENVIAR MENSAJES O PROMOS
- Desde el chat nunca se envía nada directamente. Si piden mandar un mensaje o una promo a ciertos contactos: explicá en una o dos líneas cómo es (se arma una audiencia con esos contactos, se elige un template aprobado por Meta y se crea la campaña, que el usuario confirma) y ofrecé armar la audiencia. Si dice que sí (o ya lo pidió directamente), usá crear_audiencia_con_estos_contactos con el parámetro telefonos (los teléfonos que te dio la herramienta del Motor), nunca con ids inventados.
- No digas que algo "falló" si la herramienta no devolvió un error; y si devolvió uno, leelo y corregilo en el mismo turno antes de responder.

OBJECIONES, PENDIENTES Y HORARIOS
- motor_objeciones separa "objeciones_verificadas_por_el_motor" de "posibles_reclamos_o_dudas_en_mensajes". Contalas por separado: las segundas son mensajes reales pero su categoría es aproximada, así que describí lo que dijo el cliente con sus palabras y presentalas como "posibles". Si no hay verificadas, decilo, pero no digas "no hay objeciones" si hay posibles.
- conversaciones_pendientes: "sin_responder" = el cliente escribió último y falta contestarle; "esperando_al_cliente" = el negocio contestó y el cliente no volvió. Respetá el período que pidieron (por defecto, últimos 7 días) y nunca muestres como "de los últimos 7 días" algo más viejo.
- mejor_horario_envio: si "por_envios" no alcanza el mínimo de datos, usá "actividad_de_clientes" y aclaralo: "todavía no hay campañas suficientes para medir respuestas; por ahora, tus clientes te escriben más entre tal y tal hora y los días X". Es una buena referencia, no una tasa de respuesta medida.

BORRADORES DE MENSAJES PARA CLIENTES
- Cuando te pidan qué escribirle a un cliente, armá el texto SOLO con lo que el cliente dijo (citas reales) y con los DATOS REALES DE ESTA CUENTA. Vos NO sabés si hay stock, cuánto cuesta algo, si se puede entregar en tal horario ni cuánto sale el envío: lo que dijo o preguntó el CLIENTE no es un dato confirmado por el negocio (si el cliente escribió un número, no es un precio).
- PROHIBIDO en el borrador: "tenemos disponible", "te confirmo", "hay stock", un precio con $, "podemos entregarlo antes de…", "el envío cuesta…", cualquier promoción o descuento. En su lugar poné corchetes: "[confirmar si hay stock]", "[precio]", "[costo de envío]", "[horario de entrega]". Ejemplo correcto: "Hola! Te escribo por el Royal Canin Urinary S/O de 1,5 kg que consultaste el 7/9. [Confirmar si hay stock] y el precio es [precio]. Para Salcedo 3823 el envío sale [costo de envío]. ¿Querés que lo avancemos?"
- Después del borrador, avisá en una línea qué tiene que completar antes de mandarlo.
- Si la conversación con ese cliente es de hace varios días, el borrador no puede sonar como si fuera de hoy ("te escribo por lo que consultaste el 7/9…").
- Es solo un texto sugerido: nunca digas que lo enviaste ni que lo vas a enviar.

DATOS QUE NO TENÉS
- No tenés datos de facturación, ventas, cobros ni ganancias. Si preguntan cuánto facturaron o vendieron, decí que ese dato no está en YamaSend. Los créditos son lo que la cuenta GASTA en mensajes, nunca lo que vende: no los ofrezcas como respuesta a una pregunta de facturación.
- Si en una cita aparece "[oculto]" o "[dato bancario oculto]", es un dato sensible que se ocultó a propósito: nunca intentes reconstruirlo ni lo menciones.

LA TABLA QUE SE MUESTRA DEBAJO DE TU RESPUESTA
- Debajo de tu respuesta se muestra automáticamente la tabla de la última herramienta que trajo datos. Si esa tabla NO sirve para la pregunta (por ejemplo, la herramienta no tenía lo que buscabas, o trajo cosas de otro tema), terminá tu respuesta con la marca [[sin_tabla]] y no se va a mostrar. Si la tabla sí sirve, no pongas la marca.

REGLAS ESTRICTAS
- NUNCA inventes números, nombres, fechas, IDs ni ningún dato de la cuenta. Todo dato concreto que digas tiene que venir de una herramienta que llamaste en este mismo turno.
- Si no tenés una herramienta que responda algo, decí con franqueza que ese dato todavía no lo podés consultar, en vez de responder con algo parecido pero distinto.
- Lo que digas en el texto y lo que muestra la tabla tienen que coincidir: mismos números, mismos contactos, mismo estado.`;

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    // 30 mensajes (15 idas y vueltas): con 8, una pregunta como "elegí uno de
    // los que me pasaste antes" ya no veía la lista a la que se refería.
    ...history.slice(-30).map((h) => ({
      role: h.role === "user" ? ("user" as const) : ("assistant" as const),
      content: (h.text ?? "").slice(0, 3000),
    })),
    { role: "user", content: mensaje },
  ];

  let ultimaTabla: ResultadoHerramienta["tabla"];
  // Memoria que dejan las herramientas para el turno siguiente (ver
  // ResultadoHerramienta.memoria). Se acumula acá y se adjunta al flowState
  // que se devuelve, aunque el flujo quede idle.
  let memoriaHerramientas: IAFlowState["draft"] = {};

  for (let i = 0; i < MAX_ITERACIONES_AGENTE; i++) {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0.3,
      // 500 cortaba las respuestas con listas (ej. "los 10 más prioritarios
      // con su motivo"). 900 alcanza para una lista de 10 con una línea cada uno.
      max_tokens: 900,
      // Sin tenant_id no podemos consultar nada: dejamos que responda solo
      // conversacionalmente en vez de fallar con un error técnico.
      tools: tenantId ? HERRAMIENTAS_AGENTE : undefined,
      messages,
    });

    const msg = completion.choices[0]?.message;
    if (!msg) break;

    const toolCalls = msg.tool_calls ?? [];

    if (toolCalls.length === 0) {
      const crudo = msg.content?.trim();
      if (!crudo) break;
      // El modelo marca con [[sin_tabla]] cuando la tabla de la última
      // herramienta no tiene que ver con lo que respondió (ej. "no encontré
      // nada de eso" con una tabla de otro tema debajo).
      // gpt-4o no siempre pone la marca, así que además se oculta la tabla
      // cuando la respuesta arranca diciendo que no encontró lo pedido.
      const ocultarTabla =
        /\[\[\s*sin_tabla\s*\]\]/i.test(crudo) ||
        (/^(no (encontr[eé]|tengo|hay|pude|se (encontr|registr|detect))|todav[ií]a no (hay|tengo))/i.test(crudo) &&
          !/\b(pero|sin embargo|aunque|en cambio)\b/i.test(crudo));
      const texto =
        crudo.replace(/\s*\[\[\s*sin_tabla\s*\]\]\s*/gi, " ").trim() ||
        "No encontré datos que respondan eso. ¿Me lo preguntás de otra forma?";
      return {
        text: texto,
        payload: ultimaTabla && !ocultarTabla ? { kind: "tabla_datos", ...ultimaTabla } : undefined,
        flowState: { ...IA_FLOW_IDLE, draft: memoriaHerramientas },
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
      if (resultado.memoria) {
        memoriaHerramientas = { ...memoriaHerramientas, ...resultado.memoria };
      }

      // Tope de caracteres por resultado (antes 6000 y luego 20000: el JSON
      // se cortaba a mitad de camino con cuentas de cientos de contactos y el
      // modelo veía un fragmento inválido). Las herramientas ya recortan su
      // propia salida (ver motor_* y conversaciones_pendientes); esto es
      // solo la red de seguridad.
      messages.push({
        role: "tool",
        tool_call_id: tc.id,
        content: JSON.stringify(resultado.datos).slice(0, 30000),
      });
    }
  }

  return {
    text: "Se me complicó procesar eso. ¿Me lo repetís de otra forma?",
    flowState: IA_FLOW_IDLE,
  };
}

// =======================================================================
// Flujo: editar_recurso
//
// Cubre la edición de cosas que YA EXISTEN (a diferencia de los flujos
// crear_*, que arman algo nuevo): renombrar una audiencia, renombrar una
// campaña, o cambiar la temperatura de un contacto.
//
// El patrón es el mismo para los tres: listar los recursos en una tarjeta
// para que el usuario elija cuál -> pedirle el valor nuevo -> aplicar.
// Elegir desde tarjeta en vez de por texto evita tener que adivinar a qué
// audiencia/contacto se refiere cuando hay nombres parecidos.
// =======================================================================

/** Arma la tarjeta de selección con los recursos existentes del tipo pedido. */
async function iniciarFlujoEditarRecurso(
  tipo: "audiencia" | "campana" | "contacto",
): Promise<IAResponse> {
  const tenantId = await resolverTenantId();
  if (!tenantId) {
    return {
      text: "No pude identificar tu cuenta. Probá recargar la página.",
      flowState: IA_FLOW_IDLE,
    };
  }

  const supabase = await createClient();
  let items: { id: string; nombre: string; detalle?: string }[] = [];

  // Usamos las mismas RPCs que ya usa el agente (SECURITY DEFINER, probadas)
  // en vez de consultas armadas a mano acá. Y capturamos el error en vez de
  // descartarlo: antes un fallo devolvía data=null, la lista salía vacía y
  // el flujo seguía como si el usuario no tuviera nada, sin avisar nada.
  if (tipo === "audiencia") {
    const lists = await getListsForTenant(tenantId);
    items = lists.map((l) => ({
      id: l.id,
      nombre: l.nombre,
      detalle: `${l.contactosIds.length} contacto${l.contactosIds.length === 1 ? "" : "s"}`,
    }));
  } else if (tipo === "campana") {
    // Usamos getCampaignsForTenant (la misma función que alimenta la
    // sección Campañas del panel) en vez de la RPC listar_campanas. Es el
    // análogo exacto de getListsForTenant, que es el camino que ya funciona
    // para audiencias — menos piezas intermedias, y probado en producción.
    const campanas = await getCampaignsForTenant(tenantId);
    items = campanas.map((c) => ({
      id: c.id,
      nombre: c.nombre || "Sin nombre",
      detalle: c.status ?? undefined,
    }));
  } else {
    const { data, error } = await supabase.rpc("listar_contactos", {
      p_tenant_id: tenantId,
      p_temperatura: null,
      p_orden_por: "reciente",
      p_limite: 200,
    });
    if (error) {
      console.error("[IA] Error listando contactos para editar:", error);
      return {
        text: "No pude traer tus contactos ahora. Probá de nuevo en un momento.",
        flowState: IA_FLOW_IDLE,
        error: error.message,
      };
    }
    items = (
      (data ?? []) as { contacto_id: string; nombre: string; telefono: string; temperatura: string }[]
    ).map((c) => ({
      id: c.contacto_id,
      nombre: c.nombre || c.telefono || "Sin nombre",
      detalle: c.temperatura ?? undefined,
    }));
  }

  const etiqueta = tipo === "audiencia" ? "audiencia" : tipo === "campana" ? "campaña" : "contacto";

  if (items.length === 0) {
    return {
      text: `Todavía no tenés ninguna ${etiqueta} para editar.`,
      flowState: IA_FLOW_IDLE,
    };
  }

  return {
    text: `Elegí qué ${etiqueta} querés modificar.`,
    payload: { kind: "elegir_recurso_editar", tipo, items },
    flowState: {
      kind: "editar_recurso",
      step: "editar_esperando_seleccion",
      draft: { editarTipo: tipo },
    },
  };
}

/**
 * Se llama cuando el usuario elige un recurso desde la tarjeta. Según el
 * tipo, pide el nombre nuevo (texto libre) o muestra el selector de
 * temperatura.
 */
export async function seleccionarRecursoEditarAction(
  flowState: IAFlowState,
  recursoId: string,
  recursoNombre: string,
): Promise<IAResponse> {
  if (flowState.kind !== "editar_recurso" || !flowState.draft.editarTipo) {
    return {
      text: "Se perdió el contexto de lo que estabas editando. Empecemos de nuevo.",
      flowState: IA_FLOW_IDLE,
    };
  }

  const draft = {
    ...flowState.draft,
    editarId: recursoId,
    editarNombreActual: recursoNombre,
  };

  if (flowState.draft.editarTipo === "contacto") {
    return {
      text: `Elegí la nueva temperatura para "${recursoNombre}".`,
      payload: { kind: "elegir_temperatura", contactoNombre: recursoNombre },
      flowState: { kind: "editar_recurso", step: "editar_esperando_valor", draft },
    };
  }

  // Las campañas tienen cuatro campos editables, pero no siempre los cuatro:
  // una campaña ya enviada solo admite cambiar el nombre. En vez de ofrecer
  // opciones que después van a fallar, se muestran únicamente las que el
  // estado permite, y se explica por qué faltan las otras.
  if (flowState.draft.editarTipo === "campana") {
    const tenantId = await resolverTenantId();
    const supabase = await createClient();
    const { data: campana } = tenantId
      ? await supabase
          .from("yamas_send_campanas")
          .select("status, template_nombre, lista_nombre, fecha_programada")
          .eq("id", recursoId)
          .eq("tenant_id", tenantId)
          .maybeSingle()
      : { data: null };

    const status = (campana?.status ?? "").toLowerCase();
    const editable = status === "borrador" || status === "programada";

    const draftCampana = { ...draft, editarCampanaStatus: campana?.status ?? undefined };

    const campos: {
      campo: "nombre" | "template" | "audiencia" | "fecha";
      etiqueta: string;
      detalle?: string;
    }[] = [{ campo: "nombre", etiqueta: "Nombre", detalle: recursoNombre }];

    if (editable) {
      campos.push(
        {
          campo: "template",
          etiqueta: "Template",
          detalle: campana?.template_nombre ?? "sin template",
        },
        {
          campo: "audiencia",
          etiqueta: "Audiencia",
          detalle: campana?.lista_nombre ?? "sin audiencia",
        },
        {
          campo: "fecha",
          etiqueta: "Fecha de envío",
          detalle: campana?.fecha_programada
            ? new Date(campana.fecha_programada).toLocaleString("es-AR", {
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })
            : "sin programar",
        },
      );
    }

    return {
      text: editable
        ? `¿Qué querés cambiar de "${recursoNombre}"?`
        : `"${recursoNombre}" ya se envió, así que solo se puede cambiar el nombre.`,
      payload: {
        kind: "elegir_campo_campana",
        campanaNombre: recursoNombre,
        campanaStatus: campana?.status ?? "desconocido",
        campos,
        nota: editable
          ? undefined
          : "El template y la audiencia no se pueden cambiar porque los mensajes ya salieron. Si querés mandar algo distinto, duplicá la campaña y editá la copia.",
      },
      flowState: { kind: "editar_recurso", step: "editar_esperando_campo", draft: draftCampana },
    };
  }

  const etiqueta = "la audiencia";
  return {
    text: `¿Con qué nombre querés reemplazar "${recursoNombre}"? Escribime el nombre nuevo para ${etiqueta}.`,
    flowState: {
      kind: "editar_recurso",
      step: "editar_esperando_valor",
      draft: { ...draft, editarCampo: "nombre" },
    },
  };
}

/**
 * Se llama cuando el usuario elige QUÉ campo de la campaña quiere cambiar.
 * Según el campo, pide texto libre (nombre) o muestra el selector
 * correspondiente reutilizando las mismas tarjetas del asistente de creación.
 */
export async function seleccionarCampoCampanaAction(
  flowState: IAFlowState,
  campo: "nombre" | "template" | "audiencia" | "fecha",
): Promise<IAResponse> {
  if (
    flowState.kind !== "editar_recurso" ||
    flowState.draft.editarTipo !== "campana" ||
    !flowState.draft.editarId
  ) {
    return {
      text: "Se perdió el contexto de la campaña que estabas editando. Empecemos de nuevo.",
      flowState: IA_FLOW_IDLE,
    };
  }

  const draft = { ...flowState.draft, editarCampo: campo };
  const nombreActual = flowState.draft.editarNombreActual ?? "la campaña";

  if (campo === "nombre") {
    return {
      text: `¿Con qué nombre querés reemplazar "${nombreActual}"?`,
      flowState: { kind: "editar_recurso", step: "editar_esperando_valor", draft },
    };
  }

  // Los tres campos restantes solo se pueden tocar si la campaña no salió.
  // Se revalida acá aunque la tarjeta ya haya filtrado las opciones, porque
  // el estado pudo cambiar entre que se pintó la tarjeta y que el usuario
  // hizo clic (por ejemplo, si el scheduler disparó la campaña mientras tanto).
  const status = (flowState.draft.editarCampanaStatus ?? "").toLowerCase();
  if (status !== "borrador" && status !== "programada") {
    return {
      text: `"${nombreActual}" ya no está en un estado editable, así que no puedo cambiar eso. Podés duplicarla y editar la copia.`,
      flowState: IA_FLOW_IDLE,
    };
  }

  if (campo === "template") {
    const payload = await payloadElegirTemplateCampana();
    return {
      text: "Elegí el template nuevo — solo se muestran los aprobados por Meta.",
      payload,
      flowState: { kind: "editar_recurso", step: "editar_esperando_template", draft },
    };
  }

  if (campo === "audiencia") {
    const payload = await payloadElegirAudienciaCampana();
    return {
      text: "Elegí la audiencia nueva.",
      payload,
      flowState: { kind: "editar_recurso", step: "editar_esperando_audiencia", draft },
    };
  }

  return {
    text: "Elegí la fecha y hora nuevas para el envío.",
    payload: { kind: "elegir_fecha_campana" },
    flowState: { kind: "editar_recurso", step: "editar_esperando_fecha", draft },
  };
}

/**
 * Aplica un cambio sobre una campaña existente y cierra el flujo de edición.
 *
 * Es el punto único por donde pasan los tres cambios profundos (template,
 * audiencia, fecha). Las server actions revalidan el estado de la campaña por
 * su cuenta, así que si algo cambió entre que se pintó la tarjeta y el clic,
 * el error vuelve acá con un motivo explicable en vez de romper.
 */
async function aplicarEdicionCampana(
  flowState: IAFlowState,
  cambio: { templateId?: string; audienciaId?: string; fechaProgramada?: string },
): Promise<IAResponse> {
  const campanaId = flowState.draft.editarId;
  const nombre = flowState.draft.editarNombreActual ?? "la campaña";

  if (!campanaId) {
    return {
      text: "Se perdió el contexto de la campaña que estabas editando. Empecemos de nuevo.",
      flowState: IA_FLOW_IDLE,
    };
  }

  let resultado: { error: string | null; motivo?: string };
  let confirmacion: string;

  if (cambio.templateId) {
    resultado = await updateCampaignTemplateAction(campanaId, cambio.templateId);
    const tenantId = await resolverTenantId();
    const templates = tenantId ? await getTemplatesForTenant(tenantId) : [];
    const nombreTemplate = templates.find((t) => t.id === cambio.templateId)?.nombre ?? "el nuevo template";
    confirmacion = `Listo, "${nombre}" ahora usa el template "${nombreTemplate}".`;
  } else if (cambio.audienciaId) {
    resultado = await updateCampaignAudienceAction(campanaId, cambio.audienciaId);
    const tenantId = await resolverTenantId();
    const lists = tenantId ? await getListsForTenant(tenantId) : [];
    const audiencia = lists.find((l) => l.id === cambio.audienciaId);
    confirmacion = audiencia
      ? `Listo, "${nombre}" ahora apunta a "${audiencia.nombre}" (${audiencia.contactosIds.length} contactos).`
      : `Listo, actualicé la audiencia de "${nombre}".`;
  } else if (cambio.fechaProgramada) {
    resultado = await rescheduleCampaignAction(campanaId, cambio.fechaProgramada);
    const cuando = new Date(cambio.fechaProgramada).toLocaleString("es-AR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
    confirmacion = `Listo, "${nombre}" queda programada para el ${cuando}.`;
  } else {
    return {
      text: "No entendí qué querías cambiar. Empecemos de nuevo.",
      flowState: IA_FLOW_IDLE,
    };
  }

  if (resultado.error) {
    // motivo trae la explicación pensada para el usuario (campaña ya enviada,
    // template sin aprobar, audiencia vacía). Si no hay motivo, es un error
    // técnico y mostramos algo genérico sin filtrar detalles internos.
    return {
      text: resultado.motivo ?? "No pude aplicar el cambio. Probá de nuevo en un momento.",
      flowState: IA_FLOW_IDLE,
      error: resultado.error,
    };
  }

  return { text: `${confirmacion} ¿Algo más?`, flowState: IA_FLOW_IDLE };
}

/** Aplica el cambio de temperatura elegido desde la tarjeta. */
export async function aplicarTemperaturaAction(
  flowState: IAFlowState,
  temperatura: "caliente" | "tibio" | "frio",
): Promise<IAResponse> {
  if (
    flowState.kind !== "editar_recurso" ||
    flowState.draft.editarTipo !== "contacto" ||
    !flowState.draft.editarId
  ) {
    return {
      text: "Se perdió el contexto del contacto que estabas editando. Empecemos de nuevo.",
      flowState: IA_FLOW_IDLE,
    };
  }

  const { error } = await setTemperaturaManualAction(flowState.draft.editarId, temperatura);

  if (error) {
    return {
      text: "No pude actualizar la temperatura. Probá de nuevo en un momento.",
      flowState: IA_FLOW_IDLE,
      error,
    };
  }

  return {
    text: `Listo, "${flowState.draft.editarNombreActual}" ahora figura como ${temperatura}. ¿Algo más?`,
    flowState: IA_FLOW_IDLE,
  };
}

/** Maneja el input de texto libre dentro del flujo de edición. */
async function handleEditarRecursoStep(
  texto: string,
  flowState: IAFlowState,
): Promise<IAResponse> {
  const { step, draft } = flowState;

  if (step === "editar_esperando_seleccion") {
    return {
      text: "Elegí una opción de la tarjeta de arriba para seguir.",
      flowState,
    };
  }

  if (step === "editar_esperando_campo") {
    return {
      text: "Elegí de la tarjeta de arriba qué querés cambiar.",
      flowState,
    };
  }

  if (
    step === "editar_esperando_template" ||
    step === "editar_esperando_audiencia" ||
    step === "editar_esperando_fecha"
  ) {
    const que =
      step === "editar_esperando_template"
        ? "el template"
        : step === "editar_esperando_audiencia"
          ? "la audiencia"
          : "la fecha";
    return {
      text: `Elegí ${que} desde la tarjeta de arriba para aplicar el cambio.`,
      flowState,
    };
  }

  if (step === "editar_esperando_valor") {
    if (draft.editarTipo === "contacto") {
      return {
        text: "Elegí la temperatura desde la tarjeta de arriba (caliente, tibio o frío).",
        flowState,
      };
    }

    const nombreNuevo = texto.trim().slice(0, 120);
    if (!nombreNuevo) {
      return { text: "Escribime el nombre nuevo.", flowState };
    }
    if (!draft.editarId) {
      return {
        text: "Se perdió el contexto de lo que estabas editando. Empecemos de nuevo.",
        flowState: IA_FLOW_IDLE,
      };
    }

    const { error } =
      draft.editarTipo === "audiencia"
        ? await renameListAction(draft.editarId, nombreNuevo)
        : await renameCampaignAction(draft.editarId, nombreNuevo);

    if (error) {
      return {
        text: "No pude guardar el nombre nuevo. Probá de nuevo en un momento.",
        flowState: IA_FLOW_IDLE,
        error,
      };
    }

    const etiqueta = draft.editarTipo === "audiencia" ? "La audiencia" : "La campaña";
    return {
      text: `Listo, ${etiqueta.toLowerCase()} "${draft.editarNombreActual}" ahora se llama "${nombreNuevo}". ¿Algo más?`,
      flowState: IA_FLOW_IDLE,
    };
  }

  return {
    text: "Se ve que algo se desconfiguró. Empecemos de nuevo: ¿qué necesitás?",
    flowState: IA_FLOW_IDLE,
  };
}
