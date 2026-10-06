"use server";

import { createClient } from "@/lib/supabase/server";
import { assertPermiso, getCurrentMembership } from "@/lib/auth/permisos";
import { getDatosNegocioAction } from "@/lib/actions/profile";
import { saveListAction } from "@/lib/actions/write";
import {
  contactosConEtiquetas,
  contarEtiquetas,
  normalizarEtiqueta,
  normalizarEtiquetas,
  sugerirEtiquetas,
  type ConteoEtiqueta,
  type ContactoParaSugerir,
  type SugerenciaEtiqueta,
} from "@/lib/etiquetas/etiquetas";
import type { ContactList } from "@/lib/types";

/**
 * Etiquetas de contactos (ver lib/etiquetas/etiquetas.ts y docs/etiquetas.sql).
 *
 * El tenant sale siempre de la sesión en el servidor y los ids de contactos se
 * recalculan acá: el navegador solo dice QUÉ etiquetas quiere, nunca a quién.
 */

const MAX_CONTACTOS = 3000;
const MAX_POR_LOTE = 2000;
const MUESTRA = 12;

/** Lo que baja al navegador de una sugerencia: sin la lista de ids. */
export type SugerenciaVista = Omit<SugerenciaEtiqueta, "contactoIds">;

export interface EtiquetasResumen {
  etiquetas: ConteoEtiqueta[];
  sugerencias: SugerenciaVista[];
  totalContactos: number;
  /** Cuántos clientes se agregaron o etiquetaron recién en esta carga. */
  clientesNuevos: number;
  error: string | null;
}

interface FilaLead {
  id: string;
  nombre: string | null;
  etiquetas: string[] | null;
  producto_servicio: string | null;
  necesidad: string | null;
  keywords_detectados: string[] | null;
  temperatura_efectiva: string | null;
  sentimiento: string | null;
  ultimo_mensaje_at: string | null;
}

const ERRORES_RPC: Record<string, string> = {
  sin_permiso: "No tenés permiso para hacer esto.",
  etiquetas_invalidas: "Una etiqueta no es válida. Usá letras, números y espacios (hasta 30 caracteres).",
  sin_contactos: "No hay contactos para etiquetar.",
  etiqueta_de_sistema: "«Cliente» la administra el sistema: se asigna sola a quien compra.",
  sin_perfil: "No se pudo completar la acción.",
  demasiadas_etiquetas: "Llegaste al máximo de 100 etiquetas. Eliminá alguna que no uses.",
  no_existe: "Esa etiqueta ya no existe.",
};

function mensajeDe(codigo: string | undefined): string {
  return ERRORES_RPC[codigo ?? ""] ?? "No se pudo completar la acción.";
}

async function cargarContactos(tenantId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("yamas_send_leads")
    .select("id, nombre, etiquetas, producto_servicio, necesidad, keywords_detectados, temperatura_efectiva, sentimiento, ultimo_mensaje_at")
    .eq("tenant_id", tenantId)
    .eq("activo", true)
    .limit(MAX_CONTACTOS);
  if (error) return { filas: [] as FilaLead[], error: "No se pudieron leer los contactos." };
  return { filas: (data ?? []) as FilaLead[], error: null };
}

/** Contactos con todo lo necesario para sugerir etiquetas. */
async function cargarParaSugerir(tenantId: string) {
  const supabase = await createClient();
  const [{ filas, error }, primero, compradores, config, negocio] = await Promise.all([
    cargarContactos(tenantId),
    supabase.rpc("yamas_send_primer_contacto"),
    supabase.rpc("yamas_send_compradores_detectados"),
    supabase.from("yamas_send_etiquetas_config").select("ignoradas").eq("tenant_id", tenantId).maybeSingle(),
    getDatosNegocioAction(),
  ]);

  const primer = new Map<string, string>(
    ((primero.data ?? []) as { lead_id: string; primer_mensaje_at: string }[]).map((r) => [r.lead_id, r.primer_mensaje_at]),
  );
  const compras = new Map<string, number>(
    ((compradores.data ?? []) as { lead_id: string; compras: number }[]).map((r) => [r.lead_id, r.compras]),
  );
  const primeraCompra = new Map<string, string>(
    ((compradores.data ?? []) as { lead_id: string; primera_compra: string }[]).map((r) => [r.lead_id, r.primera_compra]),
  );

  const contactos: ContactoParaSugerir[] = filas.map((l) => ({
    id: l.id,
    etiquetas: l.etiquetas ?? [],
    textoInteres: [l.producto_servicio, l.necesidad, (l.keywords_detectados ?? []).join(" ")].filter(Boolean).join(" "),
    primerContactoAt: primer.get(l.id) ?? null,
    compras: compras.get(l.id) ?? 0,
    primeraCompraAt: primeraCompra.get(l.id) ?? null,
    temperatura: l.temperatura_efectiva,
    sentimiento: l.sentimiento,
    ultimoMensajeAt: l.ultimo_mensaje_at,
    keywords: l.keywords_detectados ?? [],
  }));

  return {
    filas,
    contactos,
    productos: (negocio?.productos ?? []).map((p) => p.nombre).filter(Boolean),
    // Palabras del propio negocio: no sirven como tema ("mascotas" en una tienda de mascotas).
    palabrasNegocio: [negocio?.nombreEmpresa, negocio?.rubro, negocio?.descripcionNegocio].filter((x): x is string => !!x),
    ignoradas: (config.data?.ignoradas ?? []) as string[],
    error,
  };
}

/**
 * Etiquetas en uso, sugerencias y cantidad de contactos. Antes sincroniza la
 * etiqueta "cliente" (idempotente) para quien tenga permiso de importar contactos:
 * crea los contactos que compraron pero nunca escribieron, solo con esa etiqueta.
 */
export async function getEtiquetasAction(): Promise<EtiquetasResumen> {
  const vacio = (error: string | null): EtiquetasResumen => ({
    etiquetas: [],
    sugerencias: [],
    totalContactos: 0,
    clientesNuevos: 0,
    error,
  });

  const membership = await getCurrentMembership();
  if (!membership?.tenantId) return vacio(null);

  const supabase = await createClient();
  let clientesNuevos = 0;
  if (membership.permisos.importar_contactos) {
    const { data } = await supabase.rpc("yamas_send_clientes_sincronizar");
    const r = data as { ok?: boolean; creados?: number; etiquetados?: number } | null;
    if (r?.ok) clientesNuevos = (r.creados ?? 0) + (r.etiquetados ?? 0);
  }

  const { filas, contactos, productos, palabrasNegocio, ignoradas, error } = await cargarParaSugerir(membership.tenantId);
  if (error) return vacio(error);

  // Las etiquetas creadas a mano que todavía no tienen contactos también se listan (con 0).
  const { data: catalogo } = await supabase
    .from("yamas_send_etiquetas_catalogo")
    .select("nombre")
    .eq("tenant_id", membership.tenantId);
  const enUso = contarEtiquetas(contactos);
  const nombresEnUso = new Set(enUso.map((e) => e.nombre));
  const sinContactos: ConteoEtiqueta[] = ((catalogo ?? []) as { nombre: string }[])
    .filter((c) => !nombresEnUso.has(c.nombre))
    .map((c) => ({ nombre: c.nombre, cantidad: 0, sistema: false }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre));

  const sugerencias = sugerirEtiquetas({ contactos, productos, palabrasNegocio, ignoradas, ahora: Date.now() });
  return {
    etiquetas: [...enUso, ...sinContactos],
    sugerencias: sugerencias.map(({ contactoIds: _ids, ...resto }) => {
      void _ids;
      return resto;
    }),
    totalContactos: filas.length,
    clientesNuevos,
    error: null,
  };
}

export interface BusquedaEtiquetas {
  cantidad: number;
  muestra: { id: string; nombre: string | null; etiquetas: string[] }[];
}

/** Contactos que tienen TODAS las etiquetas elegidas (el filtro acumulable). */
export async function buscarPorEtiquetasAction(etiquetas: string[]): Promise<BusquedaEtiquetas> {
  const membership = await getCurrentMembership();
  if (!membership?.tenantId) return { cantidad: 0, muestra: [] };

  const { filas } = await cargarContactos(membership.tenantId);
  const todos = filas.map((f) => ({ id: f.id, nombre: f.nombre, etiquetas: f.etiquetas ?? [] }));
  const coinciden = contactosConEtiquetas(todos, normalizarEtiquetas(etiquetas));
  return { cantidad: coinciden.length, muestra: coinciden.slice(0, MUESTRA) };
}

export interface ResultadoAccion {
  afectados: number;
  error: string | null;
}

async function llamarRpc(nombre: string, args: Record<string, unknown>): Promise<ResultadoAccion> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(nombre, args);
  if (error) return { afectados: 0, error: "No se pudo completar la acción." };
  const r = data as { ok?: boolean; error?: string; afectados?: number } | null;
  if (!r?.ok) return { afectados: 0, error: mensajeDe(r?.error) };
  return { afectados: r.afectados ?? 0, error: null };
}

/** Crea una etiqueta personalizada, aunque todavía no tenga contactos. */
export async function crearEtiquetaAction(nombre: string): Promise<{ nombre: string | null; error: string | null }> {
  const gate = await assertPermiso("crear_audiencias");
  if (!gate.ok) return { nombre: null, error: gate.error };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("yamas_send_etiquetas_crear", { p_nombre: nombre });
  if (error) return { nombre: null, error: "No se pudo completar la acción." };
  const r = data as { ok?: boolean; error?: string; nombre?: string } | null;
  if (!r?.ok) return { nombre: null, error: mensajeDe(r?.error) };
  return { nombre: r.nombre ?? null, error: null };
}

/** Pone etiquetas a contactos puntuales (por ejemplo, desde el detalle de un contacto). */
export async function etiquetarContactosAction(leadIds: string[], etiquetas: string[]): Promise<ResultadoAccion> {
  const gate = await assertPermiso("crear_audiencias");
  if (!gate.ok) return { afectados: 0, error: gate.error };
  const ids = leadIds.slice(0, MAX_POR_LOTE);
  return llamarRpc("yamas_send_etiquetas_agregar", { p_lead_ids: ids, p_etiquetas: etiquetas });
}

export async function quitarEtiquetasAction(leadIds: string[], etiquetas: string[]): Promise<ResultadoAccion> {
  const gate = await assertPermiso("crear_audiencias");
  if (!gate.ok) return { afectados: 0, error: gate.error };
  const ids = leadIds.slice(0, MAX_POR_LOTE);
  return llamarRpc("yamas_send_etiquetas_quitar", { p_lead_ids: ids, p_etiquetas: etiquetas });
}

/** Pone etiquetas nuevas a TODOS los contactos que cumplen un filtro de etiquetas. */
export async function etiquetarPorFiltroAction(filtro: string[], nuevas: string[]): Promise<ResultadoAccion> {
  const gate = await assertPermiso("crear_audiencias");
  if (!gate.ok || !gate.tenantId) return { afectados: 0, error: gate.error ?? "No tenés permiso." };

  const { filas, error } = await cargarContactos(gate.tenantId);
  if (error) return { afectados: 0, error };
  const todos = filas.map((f) => ({ id: f.id, etiquetas: f.etiquetas ?? [] }));
  const ids = contactosConEtiquetas(todos, normalizarEtiquetas(filtro)).map((c) => c.id);
  if (ids.length === 0) return { afectados: 0, error: "No hay contactos para etiquetar." };

  let total = 0;
  for (let i = 0; i < ids.length; i += MAX_POR_LOTE) {
    const r = await llamarRpc("yamas_send_etiquetas_agregar", {
      p_lead_ids: ids.slice(i, i + MAX_POR_LOTE),
      p_etiquetas: nuevas,
    });
    if (r.error) return r;
    total += r.afectados;
  }
  return { afectados: total, error: null };
}

export async function renombrarEtiquetaAction(de: string, a: string): Promise<ResultadoAccion> {
  const gate = await assertPermiso("crear_audiencias");
  if (!gate.ok) return { afectados: 0, error: gate.error };
  return llamarRpc("yamas_send_etiquetas_renombrar", { p_de: de, p_a: a });
}

export async function eliminarEtiquetaAction(etiqueta: string): Promise<ResultadoAccion> {
  const gate = await assertPermiso("crear_audiencias");
  if (!gate.ok) return { afectados: 0, error: gate.error };
  return llamarRpc("yamas_send_etiquetas_eliminar", { p_etiqueta: etiqueta });
}

/** Aplica una sugerencia: el servidor recalcula a quién corresponde. */
export async function aplicarSugerenciaAction(etiqueta: string): Promise<ResultadoAccion> {
  const gate = await assertPermiso("crear_audiencias");
  if (!gate.ok || !gate.tenantId) return { afectados: 0, error: gate.error ?? "No tenés permiso." };
  const nombre = normalizarEtiqueta(etiqueta);
  if (!nombre) return { afectados: 0, error: mensajeDe("etiquetas_invalidas") };

  const { contactos, productos, palabrasNegocio, ignoradas, error } = await cargarParaSugerir(gate.tenantId);
  if (error) return { afectados: 0, error };
  const sug = sugerirEtiquetas({ contactos, productos, palabrasNegocio, ignoradas, ahora: Date.now() }).find((s) => s.etiqueta === nombre);
  if (!sug) return { afectados: 0, error: "Esa sugerencia ya no está disponible." };

  let total = 0;
  for (let i = 0; i < sug.contactoIds.length; i += MAX_POR_LOTE) {
    const r = await llamarRpc("yamas_send_etiquetas_agregar", {
      p_lead_ids: sug.contactoIds.slice(i, i + MAX_POR_LOTE),
      p_etiquetas: [nombre],
    });
    if (r.error) return r;
    total += r.afectados;
  }
  return { afectados: total, error: null };
}

export async function ignorarSugerenciaAction(etiqueta: string): Promise<{ error: string | null }> {
  const gate = await assertPermiso("crear_audiencias");
  if (!gate.ok) return { error: gate.error };
  const r = await llamarRpc("yamas_send_etiquetas_ignorar_sugerencia", { p_etiquetas: [etiqueta] });
  return { error: r.error };
}

export interface CrearAudienciaEtiquetasResult {
  lista: ContactList | null;
  cantidad: number;
  error: string | null;
}

/**
 * Arma una audiencia con todos los contactos que tienen TODAS las etiquetas
 * elegidas (cliente + producto + nuevo). Si ya hay una con el mismo nombre se
 * actualiza, en vez de crear una nueva en cada click.
 */
export async function crearAudienciaPorEtiquetasAction(
  etiquetas: string[],
  nombre?: string,
): Promise<CrearAudienciaEtiquetasResult> {
  const vacio = (error: string): CrearAudienciaEtiquetasResult => ({ lista: null, cantidad: 0, error });

  const elegidas = normalizarEtiquetas(etiquetas);
  if (elegidas.length === 0) return vacio("Elegí al menos una etiqueta.");

  const gate = await assertPermiso("crear_audiencias");
  if (!gate.ok || !gate.tenantId) return vacio(gate.error ?? "No tenés permiso para crear audiencias.");

  const { filas, error } = await cargarContactos(gate.tenantId);
  if (error) return vacio(error);
  const ids = contactosConEtiquetas(
    filas.map((f) => ({ id: f.id, etiquetas: f.etiquetas ?? [] })),
    elegidas,
  ).map((c) => c.id);
  if (ids.length === 0) return vacio("Ningún contacto tiene todas esas etiquetas.");

  const nombreLista = (nombre?.trim() || `Etiquetas: ${elegidas.join(" + ")}`).slice(0, 90);
  const supabase = await createClient();
  const { data: existente } = await supabase
    .from("yamas_send_listas")
    .select("id, created_at")
    .eq("tenant_id", gate.tenantId)
    .eq("nombre", nombreLista)
    .limit(1)
    .maybeSingle();

  const ahora = new Date().toISOString();
  if (existente?.id) {
    const { error: errUpdate } = await supabase
      .from("yamas_send_listas")
      .update({ contactos_ids: ids, updated_at: ahora })
      .eq("id", existente.id)
      .eq("tenant_id", gate.tenantId);
    if (errUpdate) return vacio("No se pudo actualizar la audiencia.");
    return {
      lista: { id: existente.id, nombre: nombreLista, contactosIds: ids, createdAt: existente.created_at ?? null, updatedAt: ahora },
      cantidad: ids.length,
      error: null,
    };
  }

  const res = await saveListAction(nombreLista, ids);
  if (res.error || !res.id) return vacio(res.error ?? "No se pudo crear la audiencia.");
  return {
    lista: { id: res.id, nombre: nombreLista, contactosIds: ids, createdAt: ahora, updatedAt: ahora },
    cantidad: ids.length,
    error: null,
  };
}
