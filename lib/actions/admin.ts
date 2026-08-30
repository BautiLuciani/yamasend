"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentMembership } from "@/lib/auth/permisos";

/**
 * Consola de administración interna (Bauti y Pato).
 *
 * Las cuentas de empresa se dan de alta con el MISMO mecanismo de invitación
 * que los empleados, y no con la Admin API de Supabase. Eso evita tener que
 * meter la SERVICE_ROLE_KEY en el entorno de la app: esa llave saltea todo el
 * RLS, y una filtración desde el server bundle daría acceso total a la base.
 */

async function esAdmin(): Promise<boolean> {
  const m = await getCurrentMembership();
  return m?.rol === "admin" && m.estado === "activo";
}

export interface AdminOrganizacion {
  id: string;
  nombre: string;
  contactoEmail: string | null;
  estado: string;
  creditosPool: number;
  creditosRepartidos: number;
  empleadosTotal: number;
  empleadosPendientes: number;
  tieneCuentaEmpresa: boolean;
  mensajesEnviados: number;
  createdAt: string | null;
}

export async function getAdminOrganizacionesAction(): Promise<AdminOrganizacion[]> {
  if (!(await esAdmin())) return [];

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("yamas_send_admin_organizaciones");
  if (error || !data) return [];

  return (data as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    nombre: String(r.nombre ?? ""),
    contactoEmail: (r.contacto_email as string) ?? null,
    estado: String(r.estado ?? "activa"),
    creditosPool: Number(r.creditos_pool ?? 0),
    creditosRepartidos: Number(r.creditos_repartidos ?? 0),
    empleadosTotal: Number(r.empleados_total ?? 0),
    empleadosPendientes: Number(r.empleados_pendientes ?? 0),
    tieneCuentaEmpresa: r.tiene_cuenta_empresa === true,
    mensajesEnviados: Number(r.mensajes_enviados ?? 0),
    createdAt: (r.created_at as string) ?? null,
  }));
}

export interface AdminResult {
  ok: boolean;
  error: string | null;
}

const ERRORES: Record<string, string> = {
  sin_permiso: "No tenés permiso para esto.",
  nombre_invalido: "El nombre tiene que tener al menos 2 caracteres.",
  email_invalido: "El email no tiene un formato válido.",
  cantidad_invalida: "Ingresá una cantidad distinta de cero.",
  no_encontrado: "No se encontró la organización.",
};

function traducir(res: unknown): AdminResult {
  const r = res as { ok?: boolean; error?: string } | null;
  if (r?.ok) return { ok: true, error: null };
  return {
    ok: false,
    error: ERRORES[r?.error ?? ""] ?? "No se pudo completar la acción.",
  };
}

export async function crearOrganizacionAction(
  nombre: string,
  email: string,
  creditosIniciales: number,
): Promise<AdminResult> {
  if (!(await esAdmin())) return { ok: false, error: ERRORES.sin_permiso };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    "yamas_send_admin_crear_organizacion",
    {
      p_nombre: nombre,
      p_contacto_email: email || null,
      p_creditos_iniciales: creditosIniciales,
    },
  );
  if (error) return { ok: false, error: "No se pudo crear la organización." };
  return traducir(data);
}

export async function cargarPoolAction(
  orgId: string,
  cantidad: number,
): Promise<AdminResult> {
  if (!(await esAdmin())) return { ok: false, error: ERRORES.sin_permiso };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("yamas_send_admin_cargar_pool", {
    p_org_id: orgId,
    p_cantidad: cantidad,
    p_descripcion: null,
  });
  if (error) return { ok: false, error: "No se pudieron cargar los créditos." };
  return traducir(data);
}

export interface InvitarEmpresaResult extends AdminResult {
  token: string | null;
}

export async function invitarEmpresaAction(
  orgId: string,
  email: string,
): Promise<InvitarEmpresaResult> {
  if (!(await esAdmin()))
    return { ok: false, error: ERRORES.sin_permiso, token: null };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    "yamas_send_admin_invitar_empresa",
    { p_org_id: orgId, p_email: email },
  );
  if (error)
    return { ok: false, error: "No se pudo crear la invitación.", token: null };

  const base = traducir(data);
  const r = data as { token?: string } | null;
  return { ...base, token: base.ok ? (r?.token ?? null) : null };
}
