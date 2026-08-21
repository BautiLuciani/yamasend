"use server";

import { createClient } from "@/lib/supabase/server";
import type { ActivityLogEntry, ActivityTipo } from "@/lib/types";

/**
 * Inserta un evento en yamas_send_activity_log, usado por la card
 * "Actividad reciente" del Dashboard.
 *
 * No lanza ni devuelve error al llamador: el logging de actividad es
 * secundario a la acción principal (crear grupo, enviar campaña, etc.) y
 * nunca debe hacer fallar esa acción si el insert del log falla por algún
 * motivo. Si falla, solo se deja constancia en consola del servidor.
 *
 * Requiere el tenantId ya resuelto por el llamador (todas las Server
 * Actions de escritura ya lo resuelven server-side antes de esta llamada,
 * así que no vale la pena resolverlo de nuevo acá).
 */
export async function logActivity(
  tenantId: string,
  tipo: ActivityTipo,
  descripcion: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  try {
    const supabase = await createClient();
    const { error } = await supabase.from("yamas_send_activity_log").insert({
      tenant_id: tenantId,
      tipo,
      descripcion,
      metadata: metadata ?? null,
    });

    if (error) {
      console.error("[logActivity] Error insertando actividad:", error.message);
    }
  } catch (err) {
    console.error("[logActivity] Excepción insertando actividad:", err);
  }
}

/**
 * Trae las últimas N actividades del tenant logueado para la carga inicial
 * del Dashboard. Las actualizaciones posteriores llegan vía Supabase
 * Realtime desde el propio componente (ver Dashboard.tsx), no por polling
 * de esta acción.
 */
export async function getRecentActivityAction(
  limit: number = 5,
): Promise<{ activity: ActivityLogEntry[]; error: string | null }> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { activity: [], error: "No hay sesión activa." };

  const { data: cliente, error: clienteError } = await supabase
    .from("yamas_inmo_clientes")
    .select("tenant_id")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (clienteError || !cliente?.tenant_id) {
    return { activity: [], error: "No se pudo resolver el tenant del usuario." };
  }

  const { data: rows, error } = await supabase
    .from("yamas_send_activity_log")
    .select("id, tipo, descripcion, created_at")
    .eq("tenant_id", cliente.tenant_id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error || !rows) {
    return { activity: [], error: error?.message ?? "No se pudo traer la actividad reciente." };
  }

  return {
    activity: rows.map((r) => ({
      id: r.id,
      tipo: r.tipo as ActivityTipo,
      descripcion: r.descripcion,
      createdAt: r.created_at,
    })),
    error: null,
  };
}
