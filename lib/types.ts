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
}

export type ChatMsgType = "user" | "bot" | "error";

/**
 * Payload opcional que acompaña un mensaje del bot y le dice a IA.tsx qué
 * tarjeta interactiva renderizar debajo del texto (espejo de los `hasX` del
 * prototipo de Claude Design: hasGrupo, hasContactos, hasCampana, etc).
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
      kind: "confirmar_grupo";
      nombre: string;
      contactosIds: string[];
    }
  | {
      kind: "grupo_creado";
      grupoId: string;
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
      kind: "elegir_grupo_campana";
      grupos: { id: string; nombre: string; totalContactos: number }[];
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
      grupoNombre: string;
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
export type IAFlowKind = "crear_grupo" | "crear_template" | "crear_campana";

export type IAFlowStep =
  // crear_grupo
  | "grupo_esperando_nombre"
  | "grupo_esperando_contactos"
  | "grupo_esperando_confirmacion"
  // crear_template
  | "template_esperando_nombre"
  | "template_esperando_categoria"
  | "template_esperando_descripcion"
  | "template_esperando_confirmacion"
  // crear_campana
  | "campana_esperando_nombre"
  | "campana_esperando_grupo"
  | "campana_esperando_template"
  | "campana_esperando_momento"
  | "campana_esperando_fecha"
  | "campana_esperando_confirmacion";

export interface IAFlowState {
  kind: IAFlowKind | null;
  step: IAFlowStep | null;
  draft: {
    nombre?: string;
    contactosIds?: string[];
    consultaUsada?: string | null;
    categoria?: string;
    contenido?: string;
    grupoId?: string;
    templateId?: string;
    momento?: "ahora" | "programar";
    fechaProgramada?: string | null;
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
