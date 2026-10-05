"use server";

import { createClient } from "@/lib/supabase/server";
import { assertPermiso } from "@/lib/auth/permisos";
import type {
  ActividadPeriodo,
  ActividadWhatsapp,
  ContactoExcluido,
  Novedades,
} from "@/lib/types";

// Las tres RPC resuelven el tenant con auth.uid() (SECURITY DEFINER), así que
// el tenant nunca viaja desde el cliente. SQL en docs/migraciones/.

function periodo(v: unknown): ActividadPeriodo {
  const o = (v ?? {}) as Record<string, unknown>;
  return {
    escribieron: Number(o.escribieron ?? 0),
    mensajes: Number(o.mensajes ?? 0),
    nuevos: Number(o.nuevos ?? 0),
  };
}

/**
 * Actividad de WhatsApp de las últimas 24 h y 7 días, para la card de
 * Contactos. Sale del historial de mensajes (tiempo real), no de
 * yamas_send_leads, y no cuenta a los contactos excluidos del motor.
 */
export async function getActividadWhatsappAction(): Promise<ActividadWhatsapp | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("yamas_send_actividad_whatsapp");
  if (error || !data) return null;
  const d = data as Record<string, unknown>;
  return {
    h24: periodo(d.h24),
    d7: periodo(d.d7),
    generadoAt: String(d.generado_at ?? new Date().toISOString()),
  };
}

/** Último evento por sección, para los avisos del sidebar. */
export async function getNovedadesAction(): Promise<Novedades | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("yamas_send_novedades");
  if (error || !data) return null;
  const d = data as Record<string, string | null>;
  return {
    ahora: d.ahora ?? new Date().toISOString(),
    templatesAprobadoAt: d.templates_aprobado_at ?? null,
    templatesRechazadoAt: d.templates_rechazado_at ?? null,
    campanasEnviadaAt: d.campanas_enviada_at ?? null,
    campanasErrorAt: d.campanas_error_at ?? null,
    contactosNuevoAt: d.contactos_nuevo_at ?? null,
    dashboardRespuestaAt: d.dashboard_respuesta_at ?? null,
    dashboardSistemaAt: d.dashboard_sistema_at ?? null,
    whatsappEstado: d.whatsapp_estado ?? null,
  };
}

/** Contactos que el Motor no tiene en cuenta (lista editable). */
export async function getExcluidosMotorAction(): Promise<ContactoExcluido[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("yamas_send_motor_excluidos");
  if (error || !Array.isArray(data)) return [];
  return data.map((r: Record<string, unknown>) => ({
    telefono: String(r.telefono ?? ""),
    nombre: typeof r.nombre === "string" && r.nombre ? r.nombre : null,
    categoria: String(r.categoria ?? ""),
    excluidoAt: String(r.excluido_at ?? ""),
  }));
}

const ERRORES_EXCLUSION: Record<string, string> = {
  no_autenticado: "No hay sesión activa.",
  sin_tenant: "No se pudo resolver tu cuenta.",
  sin_permiso: "No tenés permiso para gestionar contactos.",
  sin_contactos: "No se encontraron esos contactos.",
  demasiados_contactos: "Son demasiados contactos de una vez. Probá con menos de 1000.",
};

/**
 * Excluye (excluir=true) o vuelve a incluir contactos en el Motor.
 * La RPC además recalcula el WHO del tenant para que el cambio impacte ya.
 */
export async function setExclusionMotorAction(
  telefonos: string[],
  excluir: boolean,
): Promise<{ ok: boolean; cambiados: number; error: string | null }> {
  // Gate de permisos: el chequeo real vive acá (y otra vez en la RPC), no en la UI.
  const gate = await assertPermiso("importar_contactos");
  if (!gate.ok) return { ok: false, cambiados: 0, error: gate.error };

  const limpios = telefonos.map((t) => t.trim()).filter(Boolean);
  if (limpios.length === 0) {
    return { ok: false, cambiados: 0, error: "Elegí al menos un contacto." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("yamas_send_motor_excluir", {
    p_telefonos: limpios,
    p_excluir: excluir,
  });

  if (error || !data) {
    return { ok: false, cambiados: 0, error: "No se pudo actualizar la lista. Probá de nuevo." };
  }

  const r = data as { ok?: boolean; error?: string; cambiados?: number };
  if (!r.ok) {
    return {
      ok: false,
      cambiados: 0,
      error: ERRORES_EXCLUSION[r.error ?? ""] ?? "No se pudo actualizar la lista.",
    };
  }

  return { ok: true, cambiados: r.cambiados ?? 0, error: null };
}
