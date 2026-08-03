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
      "tenant_id, contacto_nombre, contacto_email, ventas_tel, plan, trialend, credito",
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
  };
}

/**
 * Carga los contactos reales de un tenant desde yamas_inmo_clientesdeclientes,
 * replicando la lógica de transformación del HTML original (loadContactos()):
 * - bloqueado: recibió marketing en las últimas 24hs (no se le puede reenviar template)
 * - en24h: su último mensaje fue hace menos de 24hs (ventana de conversación gratuita)
 */
export async function getContactsForTenant(
  tenantId: string,
): Promise<Contact[]> {
  const supabase = await createClient();

  const { data: rows, error } = await supabase
    .from("yamas_inmo_clientesdeclientes")
    .select(
      "id, nombre, tel, etiqueta, etiqueta_ai_score, mensajes_count, ult_mensaje, estado_clie, marketingsent, updated_at",
    )
    .eq("account_id", tenantId)
    .order("updated_at", { ascending: false })
    .limit(500);

  if (error || !rows) return [];

  const ahora = Date.now();
  const hace24hMs = ahora - 24 * 60 * 60 * 1000;

  return rows.map((r): Contact => {
    const idPart = r.id ? r.id.split("_")[1] : "";
    const tel = r.tel ? String(r.tel) : idPart || "";

    let ultimoFormateado = "";
    if (r.ult_mensaje) {
      const d = new Date(r.ult_mensaje);
      if (!isNaN(d.getTime())) {
        ultimoFormateado = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
      }
    }

    const scoreRaw = (r.etiqueta ?? "").toLowerCase();
    const score = (["caliente", "tibio", "frio"] as const).includes(
      scoreRaw as "caliente" | "tibio" | "frio",
    )
      ? (scoreRaw as "caliente" | "tibio" | "frio")
      : "";

    const marketingDate = r.marketingsent ? new Date(r.marketingsent) : null;
    const bloqueado = !!marketingDate && marketingDate.getTime() > hace24hMs;

    const ultMsgDate = r.ult_mensaje ? new Date(r.ult_mensaje) : null;
    const en24h =
      !!ultMsgDate &&
      !isNaN(ultMsgDate.getTime()) &&
      ultMsgDate.getTime() > hace24hMs;

    return {
      id: r.id,
      nombre: r.nombre ?? "",
      tel,
      score,
      aiScore: r.etiqueta_ai_score ? parseInt(r.etiqueta_ai_score, 10) || 0 : 0,
      etapa: r.estado_clie ?? "contacto",
      mensajes: r.mensajes_count ? Number(r.mensajes_count) : 0,
      ultimo: ultimoFormateado,
      bloqueado,
      en24h,
      enListaAI: false,
    };
  });
}
