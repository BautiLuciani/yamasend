import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Tope de frecuencia de marketing.
 *
 * Regla: no se le manda un mensaje de marketing a quien ya recibió uno hace
 * menos de DIAS_SIN_RESPUESTA días y NO contestó después. Meta limita cuántos
 * mensajes de marketing recibe un mismo usuario sin responder, y seguir
 * insistiendo termina en error 131049 y baja la calidad del número.
 *
 * Si el contacto contesta (cualquier mensaje entrante posterior al envío), el
 * tope se levanta solo. En la lista de Contactos esos contactos se ven
 * grisados.
 *
 * La misma regla se aplica en el workflow de envío de n8n (consulta de
 * contactos de la rama de templates): este módulo cubre la app y el Asistente.
 */
export const DIAS_SIN_RESPUESTA = 10;

const DIA_MS = 24 * 60 * 60 * 1000;

export interface EntrantesRecientes {
  /** clave (teléfono o lid) -> fecha ISO del último mensaje entrante */
  porClave: Map<string, string>;
}

/** Último mensaje ENTRANTE de cada contacto en la ventana del tope. */
export async function cargarEntrantesRecientes(
  supabase: SupabaseClient,
  tenantId: string,
  ahora: number = Date.now(),
): Promise<EntrantesRecientes> {
  const desde = new Date(ahora - DIAS_SIN_RESPUESTA * DIA_MS).toISOString();
  const porClave = new Map<string, string>();
  const { data } = await supabase
    .from("yamas_send_mensajes_historico")
    .select("telefono, lid, fecha")
    .eq("tenant_id", tenantId)
    .eq("enviado_por_mi", false)
    .gte("fecha", desde)
    .order("fecha", { ascending: false })
    .limit(20000);
  for (const m of (data ?? []) as { telefono: string | null; lid: string | null; fecha: string }[]) {
    for (const k of [m.telefono, m.lid]) {
      if (k && !porClave.has(k)) porClave.set(k, m.fecha);
    }
  }
  return { porClave };
}

/**
 * true si hay que saltear a este contacto: recibió una campaña hace menos de
 * DIAS_SIN_RESPUESTA días y no escribió después.
 */
export function bloqueadoPorMarketing(
  contacto: { telefono?: string | null; lid?: string | null; ultimaCampanaEnviadaAt: string | null },
  entrantes: EntrantesRecientes,
  ahora: number = Date.now(),
): boolean {
  if (!contacto.ultimaCampanaEnviadaAt) return false;
  const enviada = new Date(contacto.ultimaCampanaEnviadaAt).getTime();
  if (Number.isNaN(enviada) || ahora - enviada >= DIAS_SIN_RESPUESTA * DIA_MS) return false;
  for (const k of [contacto.telefono, contacto.lid]) {
    const f = k ? entrantes.porClave.get(k) : undefined;
    if (f && new Date(f).getTime() > enviada) return false;
  }
  return true;
}
