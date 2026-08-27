export type ScoreTemp = "caliente" | "tibio" | "frio" | "";

export interface Contact {
  id: string;
  nombre: string;
  tel: string;
  score: ScoreTemp;
  scoreManual: ScoreTemp; // override del vendedor, "" si no hay override
  aiScore: number;
  etapa: string;
  mensajes: number;
  ultimo: string; // dd/mm
  bloqueado: boolean; // recibió marketing en últimas 24h
  en24h: boolean; // último mensaje en últimas 24h (ventana gratuita)
  enListaAI: boolean;
  // Campos del análisis de IA (yamas_send_leads) — opcionales porque un
  // contacto recién sincronizado (sin analizar) puede no tenerlos todavía.
  necesidad?: string;
  resumen?: string;
  productoServicio?: string;
  urgencia?: "baja" | "media" | "alta" | "";
  sentimiento?: "positivo" | "neutral" | "negativo" | "";
  keywords?: string[];
  diasInactivo?: number | null;
  consultaUsada?: string | null;
}

export type PlanKey = "starter" | "pro" | "uso";

// Valores reales de yamas_send_templates.status en Supabase (texto en español).
// "enviado" = mandado a Meta, esperando resolución del webhook de YCloud.
export type TemplateStatus =
  | "borrador"
  | "enviado"
  | "verificado"
  | "rechazado"
  | "error";

export interface Template {
  id: string;
  nombre: string;
  contenido: string;
  status: TemplateStatus;
  tipo?: string;
  precio?: string;
  rechazoMotivo?: string | null;
  templateLang?: string;
}

export interface ContactList {
  id: string;
  nombre: string;
  contactosIds: string[];
  createdAt: string | null;
  updatedAt: string | null;
}

// Valores reales de yamas_send_campanas.status en Supabase (constraint CHECK).
export type CampaignStatus =
  | "borrador"
  | "programada"
  | "enviando"
  | "enviado"
  | "error"
  | "cancelado";

export interface Campaign {
  id: string;
  nombre: string;
  listaId: string | null;
  templateId: string | null;
  listaNombre: string | null;
  templateNombre: string | null;
  status: CampaignStatus;
  contactosCount: number;
  fechaProgramada: string | null;
  enviadoAt: string | null;
  createdAt: string | null;
}

/**
 * Detalle ampliado de una campaña para el modal de "Recorrido de la
 * campaña". Se pide bajo demanda (al abrir el modal) en vez de traerse en
 * la carga inicial del panel, para que las métricas estén siempre frescas
 * mientras una campaña está "enviando".
 */
export interface CampaignDetail extends Campaign {
  mensajesOk: number;
  mensajesError: number;
  mensajesLeidos: number;
  costoUsd: number | null;
  duracionMin: number | null;
}

export interface AppUser {
  id: string;
  tenantId: string;
  contactoNombre: string;
  contactoEmail: string;
  ventasTel: string;
  plan: PlanKey;
  trialEnd: string; // ISO date
  credito?: number;
  nombreEmpresa: string;
  rubro: string;
  descripcionNegocio: string;
  publicoObjetivo: string;
  tonoComunicacion: string;
  zonaCobertura: string;
  diferenciales: string;
  reglasEvitar: string;
}

export type ChatMsgType = "user" | "bot" | "error";

/**
 * Payload opcional que acompaña un mensaje del bot y le dice a IA.tsx qué
 * tarjeta interactiva renderizar debajo del texto (espejo de los `hasX` del
 * prototipo de Claude Design: hasAudiencia, hasContactos, hasCampana, etc).
 * Cada variante trae solo los datos que esa tarjeta necesita para pintarse
 * y para poder ejecutar su acción de confirmación.
 */
export type ChatPayload =
  | {
      kind: "seleccionar_contactos";
      // Ids preseleccionados (ej: si el usuario pidió "los que preguntaron
      // por X" y ya corrimos el análisis de IA sobre esa consulta).
      preselectedIds: string[];
      // Si viene de una búsqueda por IA, mostramos de dónde salió el filtro.
      consultaUsada?: string | null;
    }
  | {
      kind: "confirmar_audiencia";
      nombre: string;
      contactosIds: string[];
    }
  | {
      kind: "audiencia_creada";
      audienciaId: string;
      nombre: string;
      totalContactos: number;
    }
  | {
      kind: "elegir_categoria_template";
    }
  | {
      kind: "sugerencia_template";
      sugerencia: string;
    }
  | {
      kind: "confirmar_template";
      nombre: string;
      contenido: string;
      categoria: string;
    }
  | {
      kind: "template_guardado";
      // "borrador": se guardó sin mandar a Meta. "enviado": se mandó a
      // aprobación y queda esperando el resultado (async, vía polling).
      resultado: "borrador" | "enviado";
      nombre: string;
    }
  | {
      kind: "elegir_audiencia_campana";
      audiencias: { id: string; nombre: string; totalContactos: number }[];
    }
  | {
      kind: "elegir_template_campana";
      templates: { id: string; nombre: string; contenido: string }[];
    }
  | {
      kind: "elegir_momento_campana";
    }
  | {
      kind: "elegir_fecha_campana";
    }
  | {
      kind: "confirmar_campana";
      nombre: string;
      audienciaNombre: string;
      totalContactos: number;
      templateNombre: string;
      momento: "ahora" | "programar";
      fechaProgramada: string | null;
      costoUsd: number;
    }
  | {
      kind: "campana_creada";
      campanaId: string;
      nombre: string;
      momento: "ahora" | "programar";
      fechaProgramada: string | null;
    }
  | {
      kind: "confirmar_importar_contactos";
      diasAnalisis: number;
      limiteContactos: number;
    }
  | {
      kind: "importacion_completada";
      contactosAnalizados: number;
      leadsIdentificados: number;
      contactosProcesados: number;
      // Detalle seleccionable de los contactos importados en esta corrida,
      // para la tarjeta de checkboxes que aparece debajo del resumen. Solo
      // incluye los que se pudieron resolver a un id real de yamas_send_leads
      // (necesario para poder usarlos en saveListAction más adelante).
      contactosImportados: {
        contactoId: string;
        nombre: string;
        telefono: string;
        temperatura: "caliente" | "tibio" | "frio";
      }[];
    }
  | {
      kind: "resultados_busqueda_contactos";
      consulta: string;
      resultados: {
        contactoId: string | null;
        nombre: string;
        telefono: string;
        menciones: number;
        fragmento: string;
      }[];
    }
  | {
      kind: "follow_ups";
      opciones: string[];
    }
  | {
      kind: "respuesta_analitica";
      // Título corto de la métrica respondida (ej: "Mejor campaña del mes").
      titulo: string;
      // Filas clave/valor para mostrar como lista simple debajo del texto.
      filas: { etiqueta: string; valor: string }[];
    }
  | {
      kind: "elegir_recurso_editar";
      // Lista de recursos existentes para que el usuario elija cuál editar.
      tipo: "audiencia" | "campana" | "contacto";
      items: { id: string; nombre: string; detalle?: string }[];
    }
  | {
      kind: "elegir_temperatura";
      contactoNombre: string;
      temperaturaActual?: string;
    }
  | {
      kind: "tabla_datos";
      // Tabla genérica que el agente de IA adjunta cuando consultó datos
      // reales y vale la pena mostrarlos además del texto. A diferencia de
      // "respuesta_analitica" (lista clave/valor de UN registro), esta
      // muestra N filas con columnas — se arma dinámicamente a partir de lo
      // que devolvió la herramienta que el agente eligió llamar, no de una
      // plantilla fija por tipo de pregunta.
      titulo: string;
      columnas: string[];
      filas: string[][];
      // Si la consulta devolvió más filas de las que se muestran.
      totalDisponible?: number;
    };

export interface ChatMessage {
  id: string;
  text: string;
  type: ChatMsgType;
  payload?: ChatPayload;
}

/** Flujos guiados que el agente de IA puede llevar adelante paso a paso. */
export type IAFlowKind =
  | "crear_audiencia"
  | "crear_template"
  | "crear_campana"
  | "importar_contactos"
  | "editar_recurso";

export type IAFlowStep =
  // crear_audiencia
  | "audiencia_esperando_nombre"
  | "audiencia_esperando_contactos"
  | "audiencia_esperando_confirmacion"
  // crear_template
  | "template_esperando_nombre"
  | "template_esperando_categoria"
  | "template_esperando_descripcion"
  | "template_esperando_confirmacion"
  // crear_campana
  | "campana_esperando_nombre"
  | "campana_esperando_audiencia"
  | "campana_esperando_template"
  | "campana_esperando_momento"
  | "campana_esperando_fecha"
  | "campana_esperando_confirmacion"
  // importar_contactos
  | "importar_ofrecido"
  | "importar_esperando_confirmacion"
  // editar_recurso (renombrar audiencia/campaña, cambiar temperatura)
  | "editar_esperando_seleccion"
  | "editar_esperando_valor";

export interface IAFlowState {
  kind: IAFlowKind | null;
  step: IAFlowStep | null;
  draft: {
    nombre?: string;
    contactosIds?: string[];
    consultaUsada?: string | null;
    // Cuando true, contactosIds ya viene resuelto (ej: desde resultados de
    // búsqueda de texto) y el flujo de crear_audiencia NO debe volver a correr
    // syncAndAnalyzeAction ni pisar la preselección con preseleccionarPorConsulta.
    contactosIdsResueltos?: boolean;
    categoria?: string;
    contenido?: string;
    audienciaId?: string;
    templateId?: string;
    momento?: "ahora" | "programar";
    fechaProgramada?: string | null;
    diasAnalisis?: number;
    limiteContactos?: number;
    // --- Flujo editar_recurso ---
    // Qué tipo de recurso se está editando y cuál se eligió. El flujo es
    // el mismo para los tres casos: listar -> seleccionar -> pedir valor
    // nuevo -> aplicar.
    editarTipo?: "audiencia" | "campana" | "contacto";
    editarId?: string;
    editarNombreActual?: string;
    // Último resultado de importación de contactos disponible en esta
    // conversación, para que el usuario pueda pedir por texto libre "armá
    // una audiencia con los calientes que acabás de importar" sin tener que
    // reescribir la lista. Se pisa cada vez que termina una importación y
    // persiste aunque el flujo vuelva a IA_FLOW_IDLE.
    ultimaImportacion?: {
      contactoId: string;
      nombre: string;
      telefono: string;
      temperatura: "caliente" | "tibio" | "frio";
    }[];
    // Último resultado de buscar_contactos disponible en esta conversación.
    // Mismo propósito que ultimaImportacion: los resultados de herramientas
    // NO viajan en el historial (el modelo solo ve texto), así que sin esto
    // un "armá una audiencia con ese contacto" obligaba al modelo a acordarse
    // de un id que ya no tiene delante — y terminaba mandando ids inventados
    // o ninguno. Guardado acá, la referencia se resuelve contra la base sin
    // depender del criterio del modelo. Persiste aunque el flujo esté idle.
    ultimaBusqueda?: {
      consulta: string;
      contactos: {
        contactoId: string;
        nombre: string;
        telefono: string;
        temperatura: string | null;
      }[];
    };
  };
}

export const IA_FLOW_IDLE: IAFlowState = {
  kind: null,
  step: null,
  draft: {},
};

/** Historial resumido que se le manda al clasificador de intención (LLM). */
export interface IAHistoryTurn {
  role: "user" | "assistant";
  text: string;
}

/**
 * Una conversación completa del chat de IA, tal como se persiste en
 * yamas_send_ia_conversaciones. `resumen` es solo para el listado del
 * historial (no incluye messages/flowState completos, para que listar
 * conversaciones sea liviano).
 */
export interface IAConversacionResumen {
  id: string;
  titulo: string;
  updatedAt: string;
}

export interface IAConversacion {
  id: string;
  titulo: string;
  messages: ChatMessage[];
  flowState: IAFlowState;
  updatedAt: string;
}

export type KpiFilterKey =
  | "cliente"
  | "ai"
  | "24h"
  | "caliente"
  | "tibio"
  | "frio";

/** Secciones de navegación del sidebar / drawer mobile (diseño Claude Design). */
export type AppSection =
  | "dashboard"
  | "contactos"
  | "grupos"
  | "templates"
  | "campanas"
  | "ia";

export type StatusState =
  | "idle"
  | "need-tpl"
  | "editing-tpl"
  | "approving"
  | "approving-check"
  | "ready"
  | "rejected";

export interface SyncConfig {
  diasAnalisis: number;
  limiteContactos: number;
  consulta: string;
}

export interface SyncResult {
  success: boolean;
  contactosProcesados: number;
  contactosAnalizados: number;
  contactosOmitidos: number;
  leadsIdentificados: number;
  erroresGuardado: number;
  mensaje?: string;
  error?: string;
  // Detalle de los contactos efectivamente analizados en esta corrida (no
  // incluye los saltados por falta de mensajes recientes), ordenados por
  // score de interés descendente. Viene directo del workflow de n8n.
  leads?: {
    telefono: string;
    nombre: string | null;
    temperatura: "caliente" | "tibio" | "frio";
    scoreInteres: number;
  }[];
}

// Valores reales de yamas_send_activity_log.tipo en Supabase (constraint CHECK).
// Usado por la card "Actividad reciente" del Dashboard para elegir ícono/color.
export type ActivityTipo =
  | "contactos_importados"
  | "grupo_creado"
  | "grupo_editado"
  | "grupo_eliminado"
  | "template_creado"
  | "template_estado"
  | "campana_creada"
  | "campana_duplicada"
  | "campana_eliminada"
  | "campana_completada"
  | "campana_editada"
  | "ia_analisis"
  | "whatsapp_conectado"
  | "whatsapp_desconectado";

export interface ActivityLogEntry {
  id: string;
  tipo: ActivityTipo;
  descripcion: string;
  createdAt: string;
}

// Período seleccionable en el switch del Dashboard.
export type DashboardPeriodo = "7d" | "30d" | "ano";

// Una barra del gráfico "Volumen de envíos": enviados = todo mensaje
// registrado en el período (cualquier status), leidos = read_time no nulo
// (el contacto abrió el mensaje). leidos es un subconjunto de enviados.
export interface VolumenBarra {
  label: string;
  enviados: number;
  leidos: number;
}

export interface DashboardStats {
  barras: VolumenBarra[];
  mensajesEnviados: number;
  mensajesEnviadosDeltaPct: number | null;
  mensajesLeidos: number;
  mensajesLeidosPct: number | null; // % de enviados que fueron leídos, null si no hubo envíos
  mensajesLeidosDeltaPct: number | null;
  leadsCalificados: number;
  leadsCalificadosDelta: number | null;
}
