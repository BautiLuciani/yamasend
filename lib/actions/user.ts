import { createClient } from "@/lib/supabase/server";
import { getCurrentMembership } from "@/lib/auth/permisos";
import type { AppUser, Contact, EmpresaUser, PlanKey } from "@/lib/types";

/**
 * Devuelve los datos del EMPLEADO logueado (sesión + membresía + fila de
 * yamas_inmo_clientes).
 *
 * Devuelve null si no hay sesión, si el usuario no es empleado (una cuenta
 * empresa no tiene tenant ni fila de cliente), o si todavía no tiene fila
 * asociada. El caller —/panel— usa getCurrentMembership() primero para saber
 * a qué shell mandarlo, así que ese null nunca es ambiguo.
 */
export async function getCurrentAppUser(): Promise<AppUser | null> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const membership = await getCurrentMembership();
  if (!membership || membership.rol === "empresa") return null;

  const { data: row, error } = await supabase
    .from("yamas_inmo_clientes")
    .select(
      "tenant_id, contacto_nombre, contacto_email, ventas_tel, plan, trialend, credito",
    )
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (error || !row) return null;

  return {
    rol: membership.rol,
    estado: membership.estado,
    permisos: membership.permisos,
    orgId: membership.orgId,
    orgNombre: membership.orgNombre,
    id: row.tenant_id ?? user.id,
    tenantId: row.tenant_id ?? user.id,
    contactoNombre: row.contacto_nombre ?? "Usuario",
    contactoEmail: row.contacto_email ?? user.email ?? "",
    ventasTel: row.ventas_tel ?? "",
    plan: (row.plan as PlanKey) ?? "starter",
    trialEnd: row.trialend ?? new Date().toISOString(),
    // Un empleado de una organización tiene su cupo administrado por la
    // empresa; uno independiente sigue con el campo legacy de
    // yamas_inmo_clientes, que es como funciona hoy.
    //
    // Se restan también los reservados: un crédito apartado para una campaña
    // programada ya está comprometido y mostrarlo como disponible haría que el
    // usuario arme una segunda campaña que después no va a poder enviar.
    credito: membership.orgId
      ? Math.max(
          membership.creditosAsignados -
            membership.creditosUsados -
            membership.creditosReservados,
          0,
        )
      : row.credito
        ? parseFloat(row.credito)
        : 0,
    creditosAsignados: membership.orgId ? membership.creditosAsignados : null,
  };
}

/**
 * Devuelve los datos de la cuenta EMPRESA logueada.
 * null si no hay sesión o si el usuario no tiene rol empresa/admin.
 *
 * Ojo: no lee yamas_inmo_clientes. Una empresa no tiene fila ahí —es una
 * consola de gestión sin WhatsApp— y ese es justamente el motivo por el que
 * queda bloqueada de todas las tablas base por RLS.
 */
export async function getCurrentEmpresaUser(): Promise<EmpresaUser | null> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const membership = await getCurrentMembership();
  if (!membership) return null;
  if (membership.rol !== "empresa") return null;
  if (!membership.orgId) return null;

  const { data: org } = await supabase
    .from("yamas_send_organizaciones")
    .select("nombre, contacto_nombre, contacto_email, creditos_pool")
    .eq("id", membership.orgId)
    .maybeSingle();

  return {
    miembroId: membership.miembroId,
    orgId: membership.orgId,
    orgNombre: org?.nombre ?? membership.orgNombre ?? "Mi empresa",
    contactoNombre: org?.contacto_nombre ?? "Empresa",
    contactoEmail: org?.contacto_email ?? user.email ?? "",
    rol: membership.rol,
    creditosPool: org?.creditos_pool ?? 0,
  };
}

/**
 * Carga los contactos/leads reales de un tenant desde yamas_send_leads
 * (poblada por el workflow "Yamasend: Sincronizar Contactos + Análisis de Chats").
 * - bloqueado: no aplica todavía en este flujo (no hay envío de marketing propio
 *   registrado por ahora), se deja en false.
 * - en24h: su último mensaje fue hace menos de 24hs (ventana de conversación gratuita)
 * - score: usa temperatura_efectiva, que ya resuelve el override manual del
 *   vendedor sobre la temperatura calculada por IA (ver columna generada en Supabase).
 */
export async function getContactsForTenant(
  tenantId: string,
): Promise<Contact[]> {
  const supabase = await createClient();

  const { data: rows, error } = await supabase
    .from("yamas_send_leads")
    .select(
      "id, telefono, nombre, temperatura, temperatura_manual, temperatura_efectiva, score_interes, interes_nivel, producto_servicio, necesidad, resumen, sentimiento, urgencia, keywords_detectados, conversaciones_count, ultimo_mensaje_at, dias_inactivo, consulta_usada, activo",
    )
    .eq("tenant_id", tenantId)
    .eq("activo", true)
    .order("ultimo_mensaje_at", { ascending: false, nullsFirst: false })
    .limit(500);

  if (error || !rows) return [];

  const ahora = Date.now();
  const hace24hMs = ahora - 24 * 60 * 60 * 1000;

  const esScoreValido = (v: string | null): v is "caliente" | "tibio" | "frio" =>
    v === "caliente" || v === "tibio" || v === "frio";

  return rows.map((r): Contact => {
    let ultimoFormateado = "";
    const ultMsgDate = r.ultimo_mensaje_at ? new Date(r.ultimo_mensaje_at) : null;
    if (ultMsgDate && !isNaN(ultMsgDate.getTime())) {
      ultimoFormateado = `${String(ultMsgDate.getDate()).padStart(2, "0")}/${String(
        ultMsgDate.getMonth() + 1,
      ).padStart(2, "0")}`;
    }

    const score = esScoreValido(r.temperatura_efectiva) ? r.temperatura_efectiva : "";
    const scoreManual = esScoreValido(r.temperatura_manual) ? r.temperatura_manual : "";

    const en24h =
      !!ultMsgDate && !isNaN(ultMsgDate.getTime()) && ultMsgDate.getTime() > hace24hMs;

    return {
      id: r.id,
      nombre: r.nombre ?? "",
      tel: r.telefono ?? "",
      score,
      scoreManual,
      aiScore: r.score_interes ?? 0,
      etapa: r.interes_nivel ?? "contacto",
      mensajes: r.conversaciones_count ?? 0,
      ultimo: ultimoFormateado,
      bloqueado: false,
      en24h,
      enListaAI: false,
      necesidad: r.necesidad ?? undefined,
      resumen: r.resumen ?? undefined,
      productoServicio: r.producto_servicio ?? undefined,
      urgencia: (r.urgencia as Contact["urgencia"]) ?? "",
      sentimiento: (r.sentimiento as Contact["sentimiento"]) ?? "",
      keywords: r.keywords_detectados ?? [],
      diasInactivo: r.dias_inactivo,
      consultaUsada: r.consulta_usada,
    };
  });
}


