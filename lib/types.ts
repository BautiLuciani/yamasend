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

export interface Template {
  id: string;
  nombre: string;
  contenido: string;
  status: "APPROVED" | "PENDING" | "REJECTED";
  tipo?: string;
  precio?: string;
}

export interface ContactList {
  id: string;
  nombre: string;
  contactosIds: string[];
  createdAt: string | null;
  updatedAt: string | null;
}

export interface Campaign {
  id: string;
  nombre: string;
  listaId: string | null;
  templateId: string | null;
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

export interface ChatMessage {
  id: string;
  text: string;
  type: ChatMsgType;
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
