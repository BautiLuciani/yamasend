"use client";

import { createClient } from "@/lib/supabase/client";
import type { ActividadPeriodo, ActividadWhatsapp, Novedades } from "@/lib/types";

/**
 * Lecturas de polling (card de actividad y avisos del sidebar) hechas desde
 * el navegador con la sesión del usuario, y no como server actions: Next
 * despacha las server actions de a una por cliente, así que un polling
 * periódico por esa vía se encolaba delante de los clicks y del chat de IA.
 *
 * Las RPC son SECURITY DEFINER y resuelven el tenant con auth.uid() (el JWT
 * de la sesión), así que el tenant nunca viaja desde el cliente.
 * SQL en docs/migraciones/2026-10-actividad-y-novedades.sql.
 */

function periodo(v: unknown): ActividadPeriodo {
  const o = (v ?? {}) as Record<string, unknown>;
  return {
    escribieron: Number(o.escribieron ?? 0),
    mensajes: Number(o.mensajes ?? 0),
    nuevos: Number(o.nuevos ?? 0),
  };
}

export async function fetchActividadWhatsapp(): Promise<ActividadWhatsapp | null> {
  try {
    const { data, error } = await createClient().rpc("yamas_send_actividad_whatsapp");
    if (error || !data) return null;
    const d = data as Record<string, unknown>;
    return {
      h24: periodo(d.h24),
      d7: periodo(d.d7),
      generadoAt: String(d.generado_at ?? new Date().toISOString()),
    };
  } catch {
    return null;
  }
}

export async function fetchNovedades(): Promise<Novedades | null> {
  try {
    const { data, error } = await createClient().rpc("yamas_send_novedades");
    if (error || !data) return null;
    const d = data as Record<string, unknown>;
    const s = (k: string) => (typeof d[k] === "string" ? (d[k] as string) : null);
    return {
      ahora: s("ahora") ?? new Date().toISOString(),
      templatesAprobadoAt: s("templates_aprobado_at"),
      templatesRechazadoAt: s("templates_rechazado_at"),
      campanasEnviadaAt: s("campanas_enviada_at"),
      campanasErrorAt: s("campanas_error_at"),
      contactosNuevoAt: s("contactos_nuevo_at"),
      dashboardRespuestaAt: s("dashboard_respuesta_at"),
      dashboardSistemaAt: s("dashboard_sistema_at"),
      whatsappDesvinculado: d.whatsapp_desvinculado === true,
    };
  } catch {
    return null;
  }
}
