"use server";

import OpenAI from "openai";
import { createClient } from "@/lib/supabase/server";
import type {
  ChatMessage,
  IAConversacion,
  IAConversacionResumen,
  IAFlowState,
} from "@/lib/types";
import { IA_FLOW_IDLE } from "@/lib/types";

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

function getOpenAI(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("Falta configurar OPENAI_API_KEY en las variables de entorno del proyecto.");
  }
  return new OpenAI({ apiKey });
}

/**
 * Lista las conversaciones del tenant, más recientes primero, solo con lo
 * necesario para el popover de Historial (sin messages/flowState completos,
 * que pueden pesar bastante con conversaciones largas).
 */
export async function listarConversacionesIAAction(): Promise<IAConversacionResumen[]> {
  const tenantId = await resolverTenantId();
  if (!tenantId) return [];

  const supabase = await createClient();
  const { data: rows, error } = await supabase
    .from("yamas_send_ia_conversaciones")
    .select("id, titulo, updated_at")
    .eq("tenant_id", tenantId)
    .order("updated_at", { ascending: false })
    .limit(30);

  if (error || !rows) return [];

  return rows.map((r) => ({
    id: r.id,
    titulo: r.titulo ?? "Conversación sin título",
    updatedAt: r.updated_at,
  }));
}

/**
 * Carga una conversación completa por id (messages + flowState), para
 * restaurarla tal cual estaba — incluyendo un flujo a medio completar, que
 * el usuario debe poder seguir tocando como si nunca hubiese cerrado el chat.
 */
export async function cargarConversacionIAAction(
  conversacionId: string,
): Promise<IAConversacion | null> {
  const tenantId = await resolverTenantId();
  if (!tenantId) return null;

  const supabase = await createClient();
  const { data: row, error } = await supabase
    .from("yamas_send_ia_conversaciones")
    .select("id, titulo, mensajes, flow_state, updated_at")
    .eq("tenant_id", tenantId)
    .eq("id", conversacionId)
    .maybeSingle();

  if (error || !row) return null;

  return {
    id: row.id,
    titulo: row.titulo ?? "Conversación sin título",
    messages: (row.mensajes as ChatMessage[]) ?? [],
    flowState: (row.flow_state as IAFlowState) ?? IA_FLOW_IDLE,
    updatedAt: row.updated_at,
  };
}

/**
 * Guarda (upsert) el estado actual de una conversación. Se llama con
 * debounce desde el cliente en cada cambio de messages/flowState — nunca
 * en cada tecla, solo cuando se agrega un mensaje o cambia el flujo.
 * Si no se pasa conversacionId, crea una fila nueva y devuelve su id (caso
 * "primera vez que esta conversación tiene algo que guardar").
 */
export async function guardarConversacionIAAction(
  conversacionId: string | null,
  messages: ChatMessage[],
  flowState: IAFlowState,
  titulo: string | null,
): Promise<{ id: string | null; error: string | null }> {
  const tenantId = await resolverTenantId();
  if (!tenantId) return { id: null, error: "No se pudo resolver el tenant del usuario." };

  const supabase = await createClient();

  if (conversacionId) {
    const { error } = await supabase
      .from("yamas_send_ia_conversaciones")
      .update({
        mensajes: messages,
        flow_state: flowState,
        titulo: titulo ?? undefined,
        updated_at: new Date().toISOString(),
      })
      .eq("id", conversacionId)
      .eq("tenant_id", tenantId);

    if (error) return { id: null, error: error.message };
    return { id: conversacionId, error: null };
  }

  const { data, error } = await supabase
    .from("yamas_send_ia_conversaciones")
    .insert({
      tenant_id: tenantId,
      titulo: titulo ?? "Conversación sin título",
      mensajes: messages,
      flow_state: flowState,
    })
    .select("id")
    .single();

  if (error || !data) {
    return { id: null, error: error?.message ?? "Error guardando la conversación." };
  }

  return { id: data.id, error: null };
}

/**
 * Genera un título corto para la conversación a partir de su primer
 * mensaje del usuario, vía IA (gpt-4o-mini, barato y rápido). Se llama una
 * sola vez por conversación, justo después del primer mensaje real del
 * usuario — no en cada guardado.
 */
export async function generarTituloConversacionAction(
  primerMensaje: string,
): Promise<string> {
  try {
    const openai = getOpenAI();
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.3,
      max_tokens: 20,
      messages: [
        {
          role: "system",
          content:
            "Generá un título muy corto (máximo 6 palabras, sin comillas, sin punto final) que resuma de qué trata esta conversación de un chat de IA para una plataforma de mensajería de WhatsApp. Devolvé únicamente el título, nada más.",
        },
        { role: "user", content: primerMensaje.slice(0, 300) },
      ],
    });

    const titulo = completion.choices[0]?.message?.content?.trim();
    return titulo && titulo.length > 0 ? titulo.slice(0, 80) : primerMensaje.slice(0, 60);
  } catch (e) {
    console.error("[IA] Error generando título de conversación:", e);
    // Fallback silencioso: el primer mensaje recortado, para no bloquear
    // el guardado de la conversación por un fallo de este paso opcional.
    return primerMensaje.slice(0, 60);
  }
}

/**
 * Borra una conversación del historial. No se usa todavía desde la UI de
 * hoy (el foco es historial + nueva conversación), pero queda disponible
 * para una futura opción de "Eliminar" en el popover de Historial.
 */
export async function borrarConversacionIAAction(
  conversacionId: string,
): Promise<{ error: string | null }> {
  const tenantId = await resolverTenantId();
  if (!tenantId) return { error: "No se pudo resolver el tenant del usuario." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("yamas_send_ia_conversaciones")
    .delete()
    .eq("id", conversacionId)
    .eq("tenant_id", tenantId);

  return { error: error?.message ?? null };
}
