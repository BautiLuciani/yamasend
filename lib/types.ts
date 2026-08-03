export type ScoreTemp = "caliente" | "tibio" | "frio" | "";

export interface Contact {
  id: string;
  nombre: string;
  tel: string;
  score: ScoreTemp;
  aiScore: number;
  etapa: string;
  mensajes: number;
  ultimo: string; // dd/mm
  bloqueado: boolean; // recibió marketing en últimas 24h
  en24h: boolean; // último mensaje en últimas 24h (ventana gratuita)
  enListaAI: boolean;
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

export type StatusState =
  | "idle"
  | "need-tpl"
  | "editing-tpl"
  | "approving"
  | "approving-check"
  | "ready"
  | "rejected";
