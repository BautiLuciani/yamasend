"use server";

import { createClient } from "@/lib/supabase/server";
import { assertPermiso } from "@/lib/auth/permisos";
import { validarRecurrencia } from "@/lib/campanas/recurrencia";
import type { CampanaRecurrente, RecurrenciaConfig } from "@/lib/types";

/**
 * Campañas recurrentes (ver docs/migraciones/2026-10-campanas-recurrentes.sql).
 *
 * El alta va por una RPC que valida y calcula la primera fecha en la base
 * (misma lógica que usa el generador de pg_cron). Pausar y eliminar van
 * directo a la tabla: las policies de RLS dejan a cada cuenta tocar solo las
 * suyas. Mientras la migración no esté aplicada, todo devuelve "no
 * disponible" sin romper la pantalla de Campañas.
 */

/** PostgREST: tabla o función inexistente (la migración todavía no corrió). */
function noDisponible(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return (
    error.code === "42P01" || // undefined_table
    error.code === "42883" || // undefined_function
    error.code === "PGRST205" || // tabla no está en el schema cache
    error.code === "PGRST202" // función no está en el schema cache
  );
}

interface FilaRecurrente {
  id: string;
  nombre: string;
  lista_id: string;
  template_id: string;
  frecuencia: "semanal" | "cada_n_dias" | "mensual";
  dias_semana: number[] | null;
  intervalo_dias: number | null;
  dia_mes: number | null;
  hora: string;
  activa: boolean;
  proxima_ejecucion: string | null;
  ultima_ejecucion: string | null;
  ocurrencias: number;
  max_ocurrencias: number | null;
  ultimo_error: string | null;
}

export async function getRecurrentesAction(): Promise<{
  recurrentes: CampanaRecurrente[];
  disponible: boolean;
  error: string | null;
}> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("yamas_send_campanas_recurrentes")
    .select(
      "id, nombre, lista_id, template_id, frecuencia, dias_semana, intervalo_dias, dia_mes, hora, activa, proxima_ejecucion, ultima_ejecucion, ocurrencias, max_ocurrencias, ultimo_error",
    )
    .order("created_at", { ascending: false })
    .limit(50);

  if (noDisponible(error)) return { recurrentes: [], disponible: false, error: null };
  if (error) return { recurrentes: [], disponible: true, error: "No se pudieron leer las campañas recurrentes." };

  const filas = (data ?? []) as FilaRecurrente[];
  if (filas.length === 0) return { recurrentes: [], disponible: true, error: null };

  const [{ data: listas }, { data: templates }] = await Promise.all([
    supabase.from("yamas_send_listas").select("id, nombre").in("id", [...new Set(filas.map((f) => f.lista_id))]),
    supabase.from("yamas_send_templates").select("id, nombre").in("id", [...new Set(filas.map((f) => f.template_id))]),
  ]);
  const nombreLista = new Map((listas ?? []).map((l: { id: string; nombre: string }) => [l.id, l.nombre]));
  const nombreTemplate = new Map((templates ?? []).map((t: { id: string; nombre: string }) => [t.id, t.nombre]));

  return {
    disponible: true,
    error: null,
    recurrentes: filas.map((f) => ({
      id: f.id,
      nombre: f.nombre,
      listaId: f.lista_id,
      templateId: f.template_id,
      listaNombre: nombreLista.get(f.lista_id) ?? null,
      templateNombre: nombreTemplate.get(f.template_id) ?? null,
      frecuencia: f.frecuencia,
      diasSemana: f.dias_semana ?? [],
      intervaloDias: f.intervalo_dias,
      diaMes: f.dia_mes,
      hora: f.hora.slice(0, 5),
      maxOcurrencias: f.max_ocurrencias,
      activa: f.activa,
      proximaEjecucion: f.proxima_ejecucion,
      ultimaEjecucion: f.ultima_ejecucion,
      ocurrencias: f.ocurrencias,
      ultimoError: f.ultimo_error,
    })),
  };
}

const ERRORES_RPC: Record<string, string> = {
  sin_permiso: "No pudimos identificar tu cuenta.",
  lista_no_encontrada: "La audiencia ya no existe.",
  template_no_aprobado: "El template tiene que estar aprobado por Meta para repetirse.",
  frecuencia_invalida: "Elegí cada cuánto se repite.",
  hora_invalida: "Elegí una hora válida.",
  zona_invalida: "No se pudo interpretar la zona horaria.",
  sin_fecha: "No pudimos calcular la próxima fecha.",
  datos_invalidos: "Revisá los datos de la repetición.",
};

export async function crearRecurrenteAction(input: {
  nombre: string;
  listaId: string;
  templateId: string;
  config: RecurrenciaConfig;
}): Promise<{ id: string | null; proxima: string | null; error: string | null }> {
  const gate = await assertPermiso("crear_campanas");
  if (!gate.ok) return { id: null, proxima: null, error: gate.error };

  const nombre = input.nombre.trim();
  if (!nombre) return { id: null, proxima: null, error: "Ponele un nombre a la campaña." };
  const invalida = validarRecurrencia(input.config);
  if (invalida) return { id: null, proxima: null, error: invalida };

  const c = input.config;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("yamas_send_recurrente_crear", {
    p_nombre: nombre,
    p_lista_id: input.listaId,
    p_template_id: input.templateId,
    p_frecuencia: c.frecuencia,
    p_dias_semana: c.frecuencia === "semanal" ? c.diasSemana : [],
    p_intervalo_dias: c.frecuencia === "cada_n_dias" ? c.intervaloDias : null,
    p_dia_mes: c.frecuencia === "mensual" ? c.diaMes : null,
    p_hora: c.hora,
    p_max_ocurrencias: c.maxOcurrencias,
  });

  if (noDisponible(error)) {
    return { id: null, proxima: null, error: "Las campañas que se repiten todavía no están habilitadas en tu cuenta." };
  }
  if (error) return { id: null, proxima: null, error: "No se pudo guardar la repetición. Probá de nuevo." };

  const r = data as { ok?: boolean; error?: string; id?: string; proxima?: string } | null;
  if (!r?.ok) {
    return { id: null, proxima: null, error: ERRORES_RPC[r?.error ?? ""] ?? "No se pudo guardar la repetición." };
  }
  return { id: r.id ?? null, proxima: r.proxima ?? null, error: null };
}

export async function pausarRecurrenteAction(id: string, activa: boolean): Promise<{ error: string | null }> {
  const gate = await assertPermiso("crear_campanas");
  if (!gate.ok) return { error: gate.error };
  const supabase = await createClient();
  const { error } = await supabase
    .from("yamas_send_campanas_recurrentes")
    .update({ activa, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: "No se pudo actualizar la repetición." };
  return { error: null };
}

export async function eliminarRecurrenteAction(id: string): Promise<{ error: string | null }> {
  const gate = await assertPermiso("crear_campanas");
  if (!gate.ok) return { error: gate.error };
  const supabase = await createClient();
  // Las campañas ya generadas siguen: la columna recurrencia_id pasa a null.
  const { error } = await supabase.from("yamas_send_campanas_recurrentes").delete().eq("id", id);
  if (error) return { error: "No se pudo eliminar la repetición." };
  return { error: null };
}
