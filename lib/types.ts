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
  respuestas: number;
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
  | "importar_contactos";

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
  | "importar_esperando_confirmacion";

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

// Una barra del gráfico "Volumen de envíos": entregados = delivered/read
// (llegó al dispositivo), fallidos = failed (nunca llegó). accepted/sent
// quedan afuera de ambos conteos porque todavía no tienen resultado
// confirmado por WhatsApp.
export interface VolumenBarra {
  label: string;
  entregados: number;
  fallidos: number;
}

export interface DashboardStats {
  barras: VolumenBarra[];
  mensajesEnviados: number;
  mensajesEnviadosDeltaPct: number | null;
  tasaEntrega: number | null; // 0-100, null si no hay mensajes con resultado confirmado
  tasaEntregaDeltaPts: number | null;
  leadsCalificados: number;
  leadsCalificadosDelta: number | null;
}
