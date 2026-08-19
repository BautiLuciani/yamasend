"use server";

import { createClient } from "@/lib/supabase/server";
import type { Campaign, CampaignDetail, ContactList, Template } from "@/lib/types";

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

/**
 * Detalle ampliado de una campaña puntual, para el modal "Recorrido de la
 * campaña". Se pide bajo demanda (no en la carga inicial del panel) para
 * que enviados/entregados/respuestas estén siempre frescos.
 *
 * - mensajesOk / mensajesError / costoUsd salen directo de
 *   yamas_send_campanas (ya los mantiene actualizados el workflow de
 *   envío).
 * - respuestas se cuenta agregando yamas_send_mensajes.respondido_at
 *   (poblado por el workflow "Yamasend - Sync de Contactos (WAHA)").
 * - duracionMin es una aproximación: MAX(created_at) - MIN(created_at) de
 *   los mensajes de esa campaña en yamas_send_mensajes, ya que
 *   send_time no se está poblando hoy. Null si no hay mensajes registrados
 *   todavía.
 */
export async function getCampaignDetailAction(
  tenantId: string,
  campaignId: string,
): Promise<CampaignDetail | null> {
  const supabase = await createClient();

  const { data: campana, error } = await supabase
    .from("yamas_send_campanas")
    .select(
      "id, nombre, lista_id, template_id, lista_nombre, template_nombre, status, contactos_count, fecha_programada, enviado_at, created_at, mensajes_ok, mensajes_error, costo_usd",
    )
    .eq("tenant_id", tenantId)
    .eq("id", campaignId)
    .maybeSingle();

  if (error || !campana) return null;

  const { data: mensajes } = await supabase
    .from("yamas_send_mensajes")
    .select("created_at, respondido_at")
    .eq("tenant_id", tenantId)
    .eq("campana_id", campaignId);

  const respuestas = (mensajes ?? []).filter((m) => m.respondido_at !== null).length;

  let duracionMin: number | null = null;
  if (mensajes && mensajes.length > 0) {
    const timestamps = mensajes
      .map((m) => (m.created_at ? new Date(m.created_at).getTime() : null))
      .filter((t): t is number => t !== null);

    if (timestamps.length > 0) {
      const min = Math.min(...timestamps);
      const max = Math.max(...timestamps);
      duracionMin = Math.max(0, Math.round((max - min) / 60000));
    }
  }

  return {
    id: campana.id,
    nombre: campana.nombre,
    listaId: campana.lista_id,
    templateId: campana.template_id,
    listaNombre: campana.lista_nombre,
    templateNombre: campana.template_nombre,
    status: (campana.status as Campaign["status"]) ?? "borrador",
    contactosCount: campana.contactos_count ?? 0,
    fechaProgramada: campana.fecha_programada,
    enviadoAt: campana.enviado_at,
    createdAt: campana.created_at,
    mensajesOk: campana.mensajes_ok ?? 0,
    mensajesError: campana.mensajes_error ?? 0,
    respuestas,
    costoUsd: campana.costo_usd,
    duracionMin,
  };
}
