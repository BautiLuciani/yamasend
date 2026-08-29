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
  return membership.rol === "empresa" || membership.rol === "admin";
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
