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

/* ─────────────────────── Templates creados por la empresa ─────────────────── */

// Mismo webhook de n8n que usa sendTemplateToMetaAction en write.ts (workflow
// "YamaSend — Aprobar Template Meta (YCloud)"). Se repite la constante en vez
// de exportarla desde write.ts porque los dos son archivos "use server" y
// cruzarlos solo por un string obliga a Next a resolver ese módulo entero.
const TEMPLATE_APROBAR_WEBHOOK_URL =
  "https://yamasai.app.n8n.cloud/webhook/2ec4468d-e12b-448b-94c8-5f8eb253be9b";

export interface EmpresaTemplateCopia {
  templateId: string;
  tenantId: string;
  empleadoNombre: string;
  status: string;
  visible: boolean;
  rechazoMotivo: string | null;
}

export interface EmpresaTemplatePropio {
  id: string;
  nombre: string;
  contenido: string;
  templateType: string;
  createdAt: string | null;
  copias: EmpresaTemplateCopia[];
}

export async function getEmpresaTemplatesPropiosAction(): Promise<
  EmpresaTemplatePropio[]
> {
  if (!(await assertEmpresa())) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    "yamas_send_empresa_templates_propios",
  );
  if (error || !data) return [];
  return data as EmpresaTemplatePropio[];
}

/**
 * Crea un template de empresa y dispara una aprobación de Meta por empleado.
 *
 * Meta aprueba templates POR número de WhatsApp Business, y cada empleado
 * tiene el suyo: no existe una aprobación única que se pueda repartir. Por eso
 * se crea una copia real por empleado y se llama al webhook de n8n una vez por
 * cada uno, con las credenciales de ESE empleado.
 *
 * Las credenciales las resuelve la RPC (SECURITY DEFINER), que valida antes
 * que cada tenant sea de un empleado activo de esta organización — la empresa
 * no puede leer yamas_inmo_clientes por RLS, y los tenant_ids llegan del
 * cliente, así que validarlos server-side no es opcional.
 */
export async function crearTemplateEmpresaAction(
  nombre: string,
  contenido: string,
  categoria: string,
  tenantIds: string[],
): Promise<{ ok: boolean; error: string | null; enviados: number; fallidos: number }> {
  if (!(await assertEmpresa()))
    return { ok: false, error: ERRORES.sin_permiso, enviados: 0, fallidos: 0 };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("yamas_send_empresa_crear_template", {
    p_nombre: nombre,
    p_contenido: contenido,
    p_categoria: categoria,
    p_tenant_ids: tenantIds,
  });

  if (error)
    return { ok: false, error: "No se pudo crear el template.", enviados: 0, fallidos: 0 };

  const r = data as RespuestaTemplateEmpresa | null;

  if (!r?.ok) {
    return {
      ok: false,
      error: traducirErrorTemplate(r, "No se pudo crear el template."),
      enviados: 0,
      fallidos: 0,
    };
  }

  const { enviados, fallidos } = await dispararAprobaciones(
    r.destinos ?? [],
    nombre,
    contenido,
    categoria,
  );

  return { ok: true, error: null, enviados, fallidos };
}

interface RespuestaTemplateEmpresa {
  ok?: boolean;
  error?: string;
  /** Nombres de los empleados que ya tienen un template con ese nombre. */
  empleados?: string[];
  destinos?: {
    templateId: string;
    tenantId: string;
    ycloudApi: string | null;
    wabaId: string | null;
  }[];
}

/**
 * Traduce los errores de las RPCs de templates de empresa.
 *
 * El caso de nombre duplicado nombra a los empleados concretos porque es lo
 * único accionable: Meta exige nombre único por número, así que la salida es
 * cambiar el nombre del template, y para decidirlo la empresa necesita saber
 * con quién chocó.
 */
function traducirErrorTemplate(
  r: RespuestaTemplateEmpresa | null,
  fallback: string,
): string {
  if (r?.error === "nombre_duplicado") {
    const nombres = r.empleados ?? [];
    const quien =
      nombres.length === 1
        ? `${nombres[0]} ya tiene`
        : `${nombres.slice(0, -1).join(", ")} y ${nombres.at(-1)} ya tienen`;
    return `${quien} un template con ese nombre. Probá con un nombre distinto.`;
  }
  const ERR: Record<string, string> = {
    sin_permiso: "No tenés permiso para crear templates.",
    nombre_invalido: "El nombre del template es obligatorio.",
    contenido_corto: "El mensaje tiene que tener al menos 10 caracteres.",
    sin_empleados: "Elegí al menos un empleado que no lo tenga ya.",
    no_encontrado: "No se encontró el template.",
  };
  return ERR[r?.error ?? ""] ?? fallback;
}

/**
 * Dispara una solicitud de aprobación a Meta por cada destino.
 *
 * Secuencial y no en paralelo: son pocas llamadas y así no se le tiran N
 * requests simultáneos al workflow de n8n, que es compartido. Un destino sin
 * WhatsApp configurado se cuenta como fallido pero no aborta el lote: los
 * demás salen igual.
 */
async function dispararAprobaciones(
  destinos: NonNullable<RespuestaTemplateEmpresa["destinos"]>,
  nombre: string,
  contenido: string,
  categoria: string,
): Promise<{ enviados: number; fallidos: number }> {
  let enviados = 0;
  let fallidos = 0;

  for (const d of destinos) {
    if (!d.ycloudApi || !d.wabaId) {
      fallidos++;
      continue;
    }
    try {
      const res = await fetch(TEMPLATE_APROBAR_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenant_id: d.tenantId,
          ycloud_api: d.ycloudApi,
          waba_id: d.wabaId,
          nombre_meta: nombre.trim(),
          contenido: contenido.trim(),
          categoria,
          ia_conversacion_id: null,
        }),
      });
      if (res.ok) enviados++;
      else fallidos++;
    } catch {
      fallidos++;
    }
  }

  return { enviados, fallidos };
}

/**
 * Suma empleados a un template de empresa que ya existe.
 *
 * Caso típico: entró alguien nuevo al equipo y tiene que poder mandar un
 * template que el resto ya venía usando. Solo se pide la aprobación para él;
 * las copias de los demás no se tocan, así que sus aprobaciones ya conseguidas
 * quedan intactas.
 */
export async function agregarEmpleadosTemplateAction(
  masterId: string,
  tenantIds: string[],
): Promise<{ ok: boolean; error: string | null; enviados: number; fallidos: number }> {
  if (!(await assertEmpresa()))
    return { ok: false, error: ERRORES.sin_permiso, enviados: 0, fallidos: 0 };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    "yamas_send_empresa_agregar_empleados_template",
    { p_master_id: masterId, p_tenant_ids: tenantIds },
  );

  if (error)
    return { ok: false, error: "No se pudo actualizar el template.", enviados: 0, fallidos: 0 };

  const r = data as (RespuestaTemplateEmpresa & {
    nombre?: string;
    contenido?: string;
    categoria?: string;
  }) | null;

  if (!r?.ok) {
    return {
      ok: false,
      error: traducirErrorTemplate(r, "No se pudo actualizar el template."),
      enviados: 0,
      fallidos: 0,
    };
  }

  const { enviados, fallidos } = await dispararAprobaciones(
    r.destinos ?? [],
    r.nombre ?? "",
    r.contenido ?? "",
    r.categoria ?? "marketing",
  );

  return { ok: true, error: null, enviados, fallidos };
}

/** Muestra u oculta la copia de un empleado sin tocar su aprobación de Meta. */
export async function cambiarVisibilidadTemplateAction(
  templateId: string,
  visible: boolean,
): Promise<AccionResult> {
  if (!(await assertEmpresa())) return { ok: false, error: ERRORES.sin_permiso };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    "yamas_send_empresa_template_visibilidad",
    { p_template_id: templateId, p_visible: visible },
  );
  if (error) return { ok: false, error: "No se pudo actualizar el template." };
  return traducir(data);
}
