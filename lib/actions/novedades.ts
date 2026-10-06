"use server";

import { createClient } from "@/lib/supabase/server";
import { assertPermiso } from "@/lib/auth/permisos";
import type { ContactoExcluido } from "@/lib/types";

// Las RPC resuelven el tenant con auth.uid() (SECURITY DEFINER), así que el
// tenant nunca viaja desde el cliente. SQL en docs/migraciones/.

// Las lecturas de polling (actividad y avisos) viven en lib/novedades/cliente.ts
// y se hacen desde el navegador: ver el porqué ahí.

/**
 * Contactos que el usuario excluyó del Motor (lista editable).
 * null = no se pudo cargar (para no confundir un error con "lista vacía").
 */
export async function getExcluidosMotorAction(): Promise<ContactoExcluido[] | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("yamas_send_motor_excluidos");
  if (error || !Array.isArray(data)) return null;
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
