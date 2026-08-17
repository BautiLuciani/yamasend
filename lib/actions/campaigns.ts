import { createClient } from "@/lib/supabase/server";
import type { Campaign, ContactList, Template } from "@/lib/types";

export async function getTemplatesForTenant(
  tenantId: string,
): Promise<Template[]> {
  const supabase = await createClient();

  const { data: rows, error } = await supabase
    .from("yamas_send_templates")
    .select("id, nombre, contenido, status, template_type")
    .eq("tenant_id", tenantId)
    .eq("status", "APPROVED")
    .order("created_at", { ascending: false });

  if (error || !rows) return [];

  return rows.map((r): Template => ({
    id: r.id,
    nombre: r.nombre,
    contenido: r.contenido,
    status: (r.status as Template["status"]) ?? "APPROVED",
    tipo: r.template_type ?? "marketing",
    precio: "0.0618",
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
    .select("id, nombre, lista_id, template_id")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error || !rows) return [];

  return rows.map((r): Campaign => ({
    id: r.id,
    nombre: r.nombre,
    listaId: r.lista_id,
    templateId: r.template_id,
  }));
}
