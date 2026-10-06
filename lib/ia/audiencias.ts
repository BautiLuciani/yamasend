// Solo servidor: importa el cliente de Supabase con cookies (next/headers).
import { createClient } from "@/lib/supabase/server";
import { saveListAction } from "@/lib/actions/write";

/**
 * Creación de audiencias desde el chat de IA sin pasar por la tarjeta de
 * selección (pedido de Bauti y Pato, 2026-10): cuando el grupo de contactos
 * está claramente definido por una consulta, la IA la deja creada.
 *
 * Cuidados que aplica siempre, se cree directo o no:
 *  - Solo entran contactos que existen en la base de ESTE tenant (los
 *    teléfonos vienen de herramientas, nunca se confía en ids del modelo).
 *  - Saca a los contactos excluidos del motor (no son clientes).
 *  - No duplica: si en los últimos minutos ya se creó una audiencia con
 *    exactamente los mismos contactos, devuelve esa.
 *  - El nombre no choca con otra audiencia existente.
 *
 * Usa saveListAction (la misma del modal manual), así el permiso
 * crear_audiencias y el log de actividad son los de siempre.
 */

type Supabase = Awaited<ReturnType<typeof createClient>>;

export interface ContactosResueltos {
  /** ids de yamas_send_leads (lo que guarda una audiencia). */
  ids: string[];
  /** Teléfonos excluidos del motor que quedaron afuera. */
  excluidos: number;
  /** Teléfonos sin un contacto activo en la base. */
  sinContacto: number;
}

function soloDigitos(t: string): string {
  return (t || "").replace(/\D/g, "");
}

/** Teléfonos excluidos del motor por el usuario (lista editable de Contactos). */
async function telefonosExcluidos(supabase: Supabase): Promise<Set<string>> {
  const { data, error } = await supabase.rpc("yamas_send_motor_excluidos");
  if (error || !Array.isArray(data)) return new Set();
  return new Set((data as { telefono: string }[]).map((r) => soloDigitos(r.telefono)));
}

/** Resuelve teléfonos a ids de leads activos, respetando el orden y sin excluidos. */
export async function resolverContactosParaAudiencia(
  supabase: Supabase,
  tenantId: string,
  telefonos: string[],
): Promise<ContactosResueltos> {
  const unicos = Array.from(new Set(telefonos.map(soloDigitos).filter(Boolean))).slice(0, 1000);
  if (unicos.length === 0) return { ids: [], excluidos: 0, sinContacto: 0 };

  const excluidosSet = await telefonosExcluidos(supabase);
  const candidatos = unicos.filter((t) => !excluidosSet.has(t));
  const excluidos = unicos.length - candidatos.length;

  const porTelefono = new Map<string, string>();
  // En tandas: un .in() con cientos de valores puede pasar el largo de URL.
  for (let i = 0; i < candidatos.length; i += 200) {
    const tanda = candidatos.slice(i, i + 200);
    const { data, error } = await supabase
      .from("yamas_send_leads")
      .select("id, telefono")
      .eq("tenant_id", tenantId)
      .eq("activo", true)
      .in("telefono", tanda);
    if (error) throw new Error("No se pudieron resolver los contactos.");
    for (const f of data ?? []) {
      if (f.telefono) porTelefono.set(soloDigitos(f.telefono), f.id as string);
    }
  }

  const ids: string[] = [];
  for (const t of candidatos) {
    const id = porTelefono.get(t);
    if (id && !ids.includes(id)) ids.push(id);
  }
  return { ids, excluidos, sinContacto: candidatos.length - ids.length };
}

/** "Nombre", "Nombre (2)", "Nombre (3)"... el primero libre en la cuenta. */
async function nombreLibre(supabase: Supabase, tenantId: string, base: string): Promise<string> {
  const limpio = base.replace(/\s+/g, " ").trim().slice(0, 100) || "Audiencia de la IA";
  const { data } = await supabase
    .from("yamas_send_listas")
    .select("nombre")
    .eq("tenant_id", tenantId)
    .ilike("nombre", `${limpio.replace(/[%_\\]/g, "\\$&")}%`);
  const usados = new Set((data ?? []).map((r) => String(r.nombre).toLowerCase()));
  if (!usados.has(limpio.toLowerCase())) return limpio;
  for (let n = 2; n < 50; n++) {
    const candidato = `${limpio} (${n})`;
    if (!usados.has(candidato.toLowerCase())) return candidato;
  }
  return `${limpio} (${Date.now() % 1000})`;
}

/** Audiencia creada hace poco con exactamente los mismos contactos (doble pedido). */
async function audienciaRecienteIgual(
  supabase: Supabase,
  tenantId: string,
  ids: string[],
): Promise<{ id: string; nombre: string } | null> {
  const desde = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const { data } = await supabase
    .from("yamas_send_listas")
    .select("id, nombre, contactos_ids")
    .eq("tenant_id", tenantId)
    .gte("created_at", desde)
    .order("created_at", { ascending: false })
    .limit(30);
  const clave = [...ids].sort().join(",");
  for (const r of data ?? []) {
    const otros = Array.isArray(r.contactos_ids) ? (r.contactos_ids as string[]) : [];
    if ([...otros].sort().join(",") === clave) return { id: r.id as string, nombre: r.nombre as string };
  }
  return null;
}

export interface ResultadoCrearAudiencia {
  ok: boolean;
  error: string | null;
  id: string | null;
  nombre: string;
  total: number;
  /** Ya existía (pedido repetido): no se creó otra. */
  yaExistia: boolean;
  excluidos: number;
  sinContacto: number;
}

/** Crea la audiencia con contactos ya resueltos a ids (ver resolverContactosParaAudiencia). */
export async function crearAudienciaIA(
  supabase: Supabase,
  tenantId: string,
  opciones: {
    nombre: string;
    resueltos: ContactosResueltos;
    descripcion?: string | null;
    filtroAiQuery?: string | null;
    /** Si ya hay una audiencia con ese nombre exacto, usarla en vez de crear "(2)". */
    reutilizarPorNombre?: boolean;
  },
): Promise<ResultadoCrearAudiencia> {
  const { resueltos } = opciones;
  const base = {
    excluidos: resueltos.excluidos,
    sinContacto: resueltos.sinContacto,
  };

  if (resueltos.ids.length === 0) {
    return { ok: false, error: "sin_contactos", id: null, nombre: opciones.nombre, total: 0, yaExistia: false, ...base };
  }

  const repetida = await audienciaRecienteIgual(supabase, tenantId, resueltos.ids);
  if (repetida) {
    return { ok: true, error: null, id: repetida.id, nombre: repetida.nombre, total: resueltos.ids.length, yaExistia: true, ...base };
  }

  if (opciones.reutilizarPorNombre) {
    const { data: mismoNombre } = await supabase
      .from("yamas_send_listas")
      .select("id, nombre, contactos_ids")
      .eq("tenant_id", tenantId)
      .eq("nombre", opciones.nombre.trim())
      .maybeSingle();
    if (mismoNombre) {
      const total = Array.isArray(mismoNombre.contactos_ids) ? mismoNombre.contactos_ids.length : 0;
      return { ok: true, error: null, id: mismoNombre.id as string, nombre: mismoNombre.nombre as string, total, yaExistia: true, ...base };
    }
  }

  const nombre = await nombreLibre(supabase, tenantId, opciones.nombre);
  const r = await saveListAction(nombre, resueltos.ids, {
    descripcion: opciones.descripcion ?? null,
    filtroAiQuery: opciones.filtroAiQuery ?? null,
  });
  if (r.error || !r.id) {
    return { ok: false, error: r.error ?? "No se pudo crear la audiencia.", id: null, nombre, total: 0, yaExistia: false, ...base };
  }
  return { ok: true, error: null, id: r.id, nombre, total: resueltos.ids.length, yaExistia: false, ...base };
}

/** Texto corto de lo que quedó afuera, para sumar a la respuesta del chat. */
export function textoContactosFuera(excluidos: number, sinContacto: number): string {
  const partes: string[] = [];
  if (excluidos > 0) {
    partes.push(`${excluidos} ${excluidos === 1 ? "quedó" : "quedaron"} afuera porque ${excluidos === 1 ? "está excluido" : "están excluidos"} del motor`);
  }
  if (sinContacto > 0) {
    partes.push(`${sinContacto} todavía no ${sinContacto === 1 ? "está disponible" : "están disponibles"} como contacto`);
  }
  return partes.length ? ` (${partes.join("; ")}).` : "";
}
