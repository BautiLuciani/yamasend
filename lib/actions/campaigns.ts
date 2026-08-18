import { createClient } from "@/lib/supabase/server";
import type { Campaign, ContactList, Template } from "@/lib/types";

/**
 * Devuelve TODOS los templates del tenant (cualquier status), no solo los
 * aprobados — la sección Templates necesita mostrar borradores, enviados,
 * rechazados, etc. El filtro por status, si hace falta, se aplica en el
 * cliente (ver Templates.tsx).
 */
export async function getTemplatesForTenant(
  tenantId: string,
): Promise<Template[]> {
  const supabase = await createClient();

  const { data: rows, error } = await supabase
    .from("yamas_send_templates")
    .select("id, nombre, contenido, status, template_type, meta_rechazo_motivo, template_lang")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });

  if (error || !rows) return [];

  return rows.map((r): Template => ({
    id: r.id,
    nombre: r.nombre,
    contenido: r.contenido,
    status: (r.status as Template["status"]) ?? "borrador",
    tipo: r.template_type ?? "marketing",
    precio: "0.0618",
    rechazoMotivo: r.meta_rechazo_motivo ?? null,
    templateLang: r.template_lang ?? "es_AR",
  }));
}

export async function getListsForTenant(
  tenantId: string,
): Promise<ContactList[]> {
  const supabase = await createClient();

  const { data: rows, error } = await supabase
    .from("yamas_send_listas")
    .select("id, nombre, contactos_ids, created_at, updated_at")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error || !rows) return [];

  return rows.map((r): ContactList => ({
    id: r.id,
    nombre: r.nombre,
    contactosIds: r.contactos_ids ?? [],
    createdAt: r.created_at ?? null,
    updatedAt: r.updated_at ?? null,
  }));
}

export async function getCampaignsForTenant(
  tenantId: string,
): Promise<Campaign[]> {
  const supabase = await createClient();

  const { data: rows, error } = await supabase
    .from("yamas_send_campanas")
    .select(
      "id, nombre, lista_id, template_id, lista_nombre, template_nombre, status, contactos_count, fecha_programada, enviado_at, created_at",
    )
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error || !rows) return [];

  return rows.map((r): Campaign => ({
    id: r.id,
    nombre: r.nombre,
    listaId: r.lista_id,
    templateId: r.template_id,
    listaNombre: r.lista_nombre,
    templateNombre: r.template_nombre,
    status: (r.status as Campaign["status"]) ?? "borrador",
    contactosCount: r.contactos_count ?? 0,
    fechaProgramada: r.fecha_programada,
    enviadoAt: r.enviado_at,
    createdAt: r.created_at,
  }));
}
