import { createClient } from "@/lib/supabase/server";
import type { AppUser, Contact, PlanKey } from "@/lib/types";

/**
 * Devuelve los datos de sesión + fila de yamas_inmo_clientes del usuario logueado.
 * null si no hay sesión activa, o si el usuario de Auth no tiene fila asociada todavía.
 */
export async function getCurrentAppUser(): Promise<AppUser | null> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: row, error } = await supabase
    .from("yamas_inmo_clientes")
    .select(
      "tenant_id, contacto_nombre, contacto_email, ventas_tel, plan, trialend, credito, nombre_empresa, rubro, descripcion_negocio, publico_objetivo, tono_comunicacion, zona_cobertura, diferenciales, reglas_evitar",
    )
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (error || !row) return null;

  return {
    id: row.tenant_id ?? user.id,
    tenantId: row.tenant_id ?? user.id,
    contactoNombre: row.contacto_nombre ?? "Usuario",
    contactoEmail: row.contacto_email ?? user.email ?? "",
    ventasTel: row.ventas_tel ?? "",
    plan: (row.plan as PlanKey) ?? "starter",
    trialEnd: row.trialend ?? new Date().toISOString(),
    credito: row.credito ? parseFloat(row.credito) : 0,
    nombreEmpresa: row.nombre_empresa ?? "",
    rubro: row.rubro ?? "",
    descripcionNegocio: row.descripcion_negocio ?? "",
    publicoObjetivo: row.publico_objetivo ?? "",
    tonoComunicacion: row.tono_comunicacion ?? "",
    zonaCobertura: row.zona_cobertura ?? "",
    diferenciales: row.diferenciales ?? "",
    reglasEvitar: row.reglas_evitar ?? "",
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
