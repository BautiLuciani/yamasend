"use server";

import { createClient } from "@/lib/supabase/server";
import { assertPermiso } from "@/lib/auth/permisos";

/**
 * Cambia el nombre de un contacto (por ejemplo, a un cliente que nunca escribió
 * y figura como «Sin nombre»). El tenant sale de la sesión: solo se puede editar
 * un contacto de la propia cuenta.
 */
export async function renombrarContactoAction(contactoId: string, nombre: string): Promise<{ error: string | null }> {
  const gate = await assertPermiso("crear_audiencias");
  if (!gate.ok || !gate.tenantId) return { error: gate.error ?? "No tenés permiso para editar contactos." };

  const limpio = nombre.replace(/\s+/g, " ").trim().slice(0, 80);
  if (!limpio) return { error: "El nombre no puede quedar vacío." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("yamas_send_leads")
    .update({ nombre: limpio })
    .eq("id", contactoId)
    .eq("tenant_id", gate.tenantId)
    .select("id");
  if (error) return { error: "No se pudo guardar el nombre." };
  if (!data || data.length === 0) return { error: "No encontramos ese contacto." };
  return { error: null };
}

export interface ActividadWhatsapp {
  escribieron: number;
  mensajes: number;
  nuevos: number;
}

/** Actividad de las últimas 24 h o 7 días: quiénes escribieron, cuántos mensajes y contactos nuevos. */
export async function getActividadWhatsappAction(
  ventana: "24h" | "7d",
): Promise<{ actividad: ActividadWhatsapp | null; error: string | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("yamas_send_actividad", { p_horas: ventana === "24h" ? 24 : 168 });
  if (error) return { actividad: null, error: "No se pudo leer la actividad." };
  const r = data as { ok?: boolean; escribieron?: number; mensajes?: number; nuevos?: number } | null;
  if (!r?.ok) return { actividad: null, error: "No se pudo leer la actividad." };
  return { actividad: { escribieron: r.escribieron ?? 0, mensajes: r.mensajes ?? 0, nuevos: r.nuevos ?? 0 }, error: null };
}
