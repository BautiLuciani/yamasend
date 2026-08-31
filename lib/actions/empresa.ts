"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentMembership } from "@/lib/auth/permisos";
import {
  PERMISO_KEYS,
  PERMISOS_COMPLETOS,
  type EmpleadoResumen,
  type MemberEstado,
  type Permisos,
} from "@/lib/types";

/**
 * Lecturas de la consola de empresa.
 *
 * Todas pasan por funciones SECURITY DEFINER de Postgres (yamas_send_empresa_*)
 * y no por queries directas. El motivo: una cuenta empresa NO tiene acceso RLS
 * a ninguna tabla base —no tiene fila en yamas_inmo_clientes, así que la
 * subquery de las policies le devuelve vacío— y esas funciones exponen solo
 * las columnas que la empresa tiene permitido ver.
 *
 * En particular, los contactos se limitan a nombre y teléfono: el resumen de
 * IA, la temperatura, los keywords y el histórico de conversaciones son datos
 * privados del empleado y no hay ninguna función que los exponga.
 */

/** Corta la ejecución si el que llama no es una cuenta empresa/admin activa. */
async function assertEmpresa(): Promise<boolean> {
  const membership = await getCurrentMembership();
  if (!membership) return false;
  if (membership.estado !== "activo") return false;
  return membership.rol === "empresa";
}

function normalizarPermisos(raw: unknown): Permisos {
  const base = { ...PERMISOS_COMPLETOS };
  if (!raw || typeof raw !== "object") return base;
  const obj = raw as Record<string, unknown>;
  for (const key of PERMISO_KEYS) base[key] = obj[key] === true;
  return base;
}

export interface EmpresaDashboard {
  empleadosTotal: number;
  empleadosActivos: number;
  empleadosPendientes: number;
  contactosTotal: number;
  audienciasTotal: number;
  templatesTotal: number;
  templatesAprobados: number;
  campanasTotal: number;
  campanasEnviadas: number;
  mensajesEnviados: number;
  mensajesLeidos: number;
  creditosPool: number;
  creditosAsignados: number;
}

export async function getEmpresaDashboardAction(): Promise<EmpresaDashboard | null> {
  if (!(await assertEmpresa())) return null;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("yamas_send_empresa_dashboard");
  if (error || !data) return null;

  const d = data as Record<string, number>;
  return {
    empleadosTotal: d.empleados_total ?? 0,
    empleadosActivos: d.empleados_activos ?? 0,
    empleadosPendientes: d.empleados_pendientes ?? 0,
    contactosTotal: d.contactos_total ?? 0,
    audienciasTotal: d.audiencias_total ?? 0,
    templatesTotal: d.templates_total ?? 0,
    templatesAprobados: d.templates_aprobados ?? 0,
    campanasTotal: d.campanas_total ?? 0,
    campanasEnviadas: d.campanas_enviadas ?? 0,
    mensajesEnviados: d.mensajes_enviados ?? 0,
    mensajesLeidos: d.mensajes_leidos ?? 0,
    creditosPool: d.creditos_pool ?? 0,
    creditosAsignados: d.creditos_asignados ?? 0,
  };
}

export async function getEmpresaEmpleadosAction(): Promise<EmpleadoResumen[]> {
  if (!(await assertEmpresa())) return [];

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("yamas_send_empresa_empleados");
  if (error || !data) return [];

  return (data as Record<string, unknown>[]).map((r) => ({
    miembroId: String(r.miembro_id),
    tenantId: String(r.tenant_id ?? ""),
    nombre: String(r.nombre ?? "Sin nombre"),
    estado: (r.estado as MemberEstado) ?? "activo",
    permisos: normalizarPermisos(r.permisos),
    creditosAsignados: Number(r.creditos_asignados ?? 0),
    creditosUsados: Number(r.creditos_usados ?? 0),
    creditosSaldo: Number(r.creditos_saldo ?? 0),
    contactosCount: Number(r.contactos_count ?? 0),
    audienciasCount: Number(r.audiencias_count ?? 0),
    templatesCount: Number(r.templates_count ?? 0),
    campanasCount: Number(r.campanas_count ?? 0),
    campanasEnviadas: Number(r.campanas_enviadas ?? 0),
    mensajesOk: Number(r.mensajes_ok ?? 0),
    mensajesError: Number(r.mensajes_error ?? 0),
    mensajesLeidos: Number(r.mensajes_leidos ?? 0),
    ultimaActividadAt: (r.ultima_actividad_at as string) ?? null,
    whatsappConfigurado: r.whatsapp_configurado === true,
  }));
}

/** Contacto visto por la empresa: SOLO nombre y teléfono, más quién lo importó. */
export interface EmpresaContacto {
  id: string;
  tenantId: string;
  empleadoNombre: string;
  nombre: string;
  telefono: string;
}

export interface EmpresaContactosPage {
  contactos: EmpresaContacto[];
  total: number;
}

export async function getEmpresaContactosAction(
  tenantId: string | null,
  busqueda: string,
  limit: number,
  offset: number,
): Promise<EmpresaContactosPage> {
  if (!(await assertEmpresa())) return { contactos: [], total: 0 };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("yamas_send_empresa_contactos", {
    p_tenant_id: tenantId,
    p_busqueda: busqueda || null,
    p_limit: limit,
    p_offset: offset,
  });
  if (error || !data) return { contactos: [], total: 0 };

  const filas = data as Record<string, unknown>[];
  return {
    // total_filas viene del count() OVER () de la función: es el total sin
    // paginar, para poder pintar el paginador sin una segunda query.
    total: filas.length > 0 ? Number(filas[0].total_filas ?? 0) : 0,
    contactos: filas.map((r) => ({
      id: String(r.id),
      tenantId: String(r.tenant_id ?? ""),
      empleadoNombre: String(r.empleado_nombre ?? "Sin nombre"),
      nombre: String(r.nombre ?? ""),
      telefono: String(r.telefono ?? ""),
    })),
  };
}

export interface EmpresaAudiencia {
  id: string;
  empleadoNombre: string;
  nombre: string;
  descripcion: string | null;
  contactosCount: number;
  createdAt: string | null;
}

export async function getEmpresaAudienciasAction(
  tenantId: string | null,
): Promise<EmpresaAudiencia[]> {
  if (!(await assertEmpresa())) return [];

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("yamas_send_empresa_audiencias", {
    p_tenant_id: tenantId,
  });
  if (error || !data) return [];

  return (data as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    empleadoNombre: String(r.empleado_nombre ?? "Sin nombre"),
    nombre: String(r.nombre ?? ""),
    descripcion: (r.descripcion as string) ?? null,
    contactosCount: Number(r.contactos_count ?? 0),
    createdAt: (r.created_at as string) ?? null,
  }));
}

export interface EmpresaTemplate {
  id: string;
  empleadoNombre: string;
  nombre: string;
  contenido: string;
  status: string;
  templateType: string;
  rechazoMotivo: string | null;
  createdAt: string | null;
}

export async function getEmpresaTemplatesAction(
  tenantId: string | null,
): Promise<EmpresaTemplate[]> {
  if (!(await assertEmpresa())) return [];

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("yamas_send_empresa_templates", {
    p_tenant_id: tenantId,
  });
  if (error || !data) return [];

  return (data as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    empleadoNombre: String(r.empleado_nombre ?? "Sin nombre"),
    nombre: String(r.nombre ?? ""),
    contenido: String(r.contenido ?? ""),
    status: String(r.status ?? "borrador"),
    templateType: String(r.template_type ?? "marketing"),
    rechazoMotivo: (r.meta_rechazo_motivo as string) ?? null,
    createdAt: (r.created_at as string) ?? null,
  }));
}

export interface EmpresaCampana {
  id: string;
  empleadoNombre: string;
  nombre: string;
  status: string;
  listaNombre: string | null;
  templateNombre: string | null;
  contactosCount: number;
  mensajesOk: number;
  mensajesError: number;
  mensajesLeidos: number;
  fechaProgramada: string | null;
  enviadoAt: string | null;
  createdAt: string | null;
}

export async function getEmpresaCampanasAction(
  tenantId: string | null,
): Promise<EmpresaCampana[]> {
  if (!(await assertEmpresa())) return [];

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("yamas_send_empresa_campanas", {
    p_tenant_id: tenantId,
    p_limit: 300,
  });
  if (error || !data) return [];

  return (data as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    empleadoNombre: String(r.empleado_nombre ?? "Sin nombre"),
    nombre: String(r.nombre ?? ""),
    status: String(r.status ?? "borrador"),
    listaNombre: (r.lista_nombre as string) ?? null,
    templateNombre: (r.template_nombre as string) ?? null,
    contactosCount: Number(r.contactos_count ?? 0),
    mensajesOk: Number(r.mensajes_ok ?? 0),
    mensajesError: Number(r.mensajes_error ?? 0),
    mensajesLeidos: Number(r.mensajes_leidos ?? 0),
    fechaProgramada: (r.fecha_programada as string) ?? null,
    enviadoAt: (r.enviado_at as string) ?? null,
    createdAt: (r.created_at as string) ?? null,
  }));
}

/* ═══════════════════════ Escrituras de gestión ═══════════════════════
 *
 * Todas van por RPCs SECURITY DEFINER que validan, dentro de Postgres, que
 * el empleado destino pertenece a la organización del que llama. La guarda
 * assertEmpresa() de acá es una primera barrera, pero NO es la que protege:
 * si alguien invocara el server action salteándola, la RPC lo rechaza igual.
 */

export interface AccionResult {
  ok: boolean;
  error: string | null;
}

const ERRORES: Record<string, string> = {
  sin_permiso: "No tenés permiso para hacer esto.",
  nombre_invalido: "Ingresá un nombre de al menos 2 caracteres.",
  no_encontrado: "No se encontró ese empleado en tu equipo.",
  estado_invalido: "Ese estado no es válido.",
  email_invalido: "El email no tiene un formato válido.",
};

function traducir(res: unknown): AccionResult {
  const r = res as { ok?: boolean; error?: string } | null;
  if (r?.ok) return { ok: true, error: null };
  const codigo = r?.error ?? "";
  return { ok: false, error: ERRORES[codigo] ?? "No se pudo completar la acción." };
}

export async function actualizarPermisosEmpleadoAction(
  miembroId: string,
  permisos: Permisos,
): Promise<AccionResult> {
  if (!(await assertEmpresa()))
    return { ok: false, error: ERRORES.sin_permiso };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    "yamas_send_empresa_actualizar_permisos",
    { p_miembro_id: miembroId, p_permisos: permisos },
  );
  if (error) return { ok: false, error: "No se pudieron guardar los permisos." };
  return traducir(data);
}

export async function cambiarEstadoEmpleadoAction(
  miembroId: string,
  estado: "activo" | "suspendido",
): Promise<AccionResult> {
  if (!(await assertEmpresa()))
    return { ok: false, error: ERRORES.sin_permiso };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    "yamas_send_empresa_cambiar_estado",
    { p_miembro_id: miembroId, p_estado: estado },
  );
  if (error) return { ok: false, error: "No se pudo cambiar el estado." };
  return traducir(data);
}

export async function quitarEmpleadoAction(
  miembroId: string,
): Promise<AccionResult> {
  if (!(await assertEmpresa()))
    return { ok: false, error: ERRORES.sin_permiso };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    "yamas_send_empresa_quitar_empleado",
    { p_miembro_id: miembroId },
  );
  if (error) return { ok: false, error: "No se pudo quitar al empleado." };
  return traducir(data);
}

export interface EmpresaInvitacion {
  id: string;
  /** Solo lo tienen las invitaciones viejas: dejó de pedirse. */
  email: string | null;
  nombreSugerido: string | null;
  /** null cuando la invitación ya no sirve (usada, revocada o vencida). */
  token: string | null;
  estado: string;
  expiraAt: string | null;
  createdAt: string | null;
}

export async function getEmpresaInvitacionesAction(): Promise<EmpresaInvitacion[]> {
  if (!(await assertEmpresa())) return [];

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("yamas_send_empresa_invitaciones");
  if (error || !data) return [];

  return (data as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    email: (r.email as string) ?? null,
    nombreSugerido: (r.nombre_sugerido as string) ?? null,
    token: (r.token as string) ?? null,
    estado: String(r.estado ?? "pendiente"),
    expiraAt: (r.expira_at as string) ?? null,
    createdAt: (r.created_at as string) ?? null,
  }));
}

export interface CrearInvitacionResult extends AccionResult {
  token: string | null;
}

/**
 * Crea una invitación. Ya no se pide email: nunca se comparaba contra el email
 * con el que la persona termina registrándose (puede usar el que quiera), así
 * que solo aportaba un campo más y una falsa sensación de control. El nombre
 * es ahora lo que identifica a la invitación en el listado.
 */
export async function crearInvitacionAction(
  nombre: string,
  permisos: Permisos,
): Promise<CrearInvitacionResult> {
  if (!(await assertEmpresa()))
    return { ok: false, error: ERRORES.sin_permiso, token: null };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    "yamas_send_empresa_crear_invitacion",
    { p_nombre: nombre, p_permisos: permisos },
  );
  if (error) return { ok: false, error: "No se pudo crear la invitación.", token: null };

  const base = traducir(data);
  const r = data as { token?: string } | null;
  return { ...base, token: base.ok ? (r?.token ?? null) : null };
}

export async function revocarInvitacionAction(
  id: string,
): Promise<AccionResult> {
  if (!(await assertEmpresa()))
    return { ok: false, error: ERRORES.sin_permiso };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    "yamas_send_empresa_revocar_invitacion",
    { p_id: id },
  );
  if (error) return { ok: false, error: "No se pudo revocar la invitación." };
  return traducir(data);
}

/**
 * Reparte créditos del pool a un empleado (cantidad positiva) o se los saca
 * y los devuelve al pool (cantidad negativa).
 *
 * La operación es atómica sobre pool y empleado dentro de Postgres, con
 * FOR UPDATE en ambas filas: dos asignaciones simultáneas podrían gastar el
 * mismo crédito del pool dos veces.
 */
export async function asignarCreditosAction(
  miembroId: string,
  cantidad: number,
): Promise<AccionResult & { pool: number | null; saldo: number | null }> {
  if (!(await assertEmpresa()))
    return { ok: false, error: ERRORES.sin_permiso, pool: null, saldo: null };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    "yamas_send_empresa_asignar_creditos",
    { p_miembro_id: miembroId, p_cantidad: cantidad },
  );
  if (error)
    return { ok: false, error: "No se pudieron asignar los créditos.", pool: null, saldo: null };

  const r = data as {
    ok?: boolean;
    error?: string;
    pool?: number;
    saldo?: number;
  } | null;

  if (r?.ok) {
    return { ok: true, error: null, pool: r.pool ?? null, saldo: r.saldo ?? null };
  }

  const mensajes: Record<string, string> = {
    pool_insuficiente: `El pool no alcanza. Disponibles: ${r?.pool ?? 0} créditos.`,
    saldo_insuficiente: `No podés sacarle más de ${r?.saldo ?? 0} créditos: el resto ya los usó.`,
    cantidad_invalida: "Ingresá una cantidad distinta de cero.",
  };

  return {
    ok: false,
    error: mensajes[r?.error ?? ""] ?? ERRORES[r?.error ?? ""] ?? "No se pudo completar.",
    pool: null,
    saldo: null,
  };
}


/**
 * Acepta o rechaza a alguien que ya se registró con el link de invitación.
 *
 * Va por invitación y no por miembro porque un empleado pendiente todavía no
 * aparece en getEmpresaEmpleadosAction(): esa lista se arma sobre los tenants
 * visibles, que a propósito excluye a los no aprobados para que la empresa no
 * vea sus contactos antes de aceptarlo.
 */
export async function resolverInvitacionAction(
  id: string,
  aceptar: boolean,
): Promise<AccionResult> {
  if (!(await assertEmpresa()))
    return { ok: false, error: ERRORES.sin_permiso };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    "yamas_send_empresa_resolver_invitacion",
    { p_id: id, p_aceptar: aceptar },
  );
  if (error)
    return { ok: false, error: "No se pudo procesar la solicitud." };
  return traducir(data);
}
