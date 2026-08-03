"use server";

import { createClient } from "@/lib/supabase/server";

export interface SaveResult {
  id: string | null;
  error: string | null;
}

/**
 * Guarda una lista de contactos seleccionados para el tenant del usuario logueado.
 * El tenant_id nunca se recibe del cliente: se resuelve en el servidor a partir
 * de la sesión, para que no se pueda escribir en nombre de otro tenant.
 */
export async function saveListAction(
  nombre: string,
  contactosIds: string[],
): Promise<SaveResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { id: null, error: "No hay sesión activa." };

  const { data: cliente, error: clienteError } = await supabase
    .from("yamas_inmo_clientes")
    .select("tenant_id")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (clienteError || !cliente?.tenant_id) {
    return { id: null, error: "No se pudo resolver el tenant del usuario." };
  }

  const { data, error } = await supabase
    .from("yamas_send_listas")
    .insert({
      tenant_id: cliente.tenant_id,
      nombre,
      contactos_ids: contactosIds,
    })
    .select("id")
    .single();

  if (error || !data) {
    return { id: null, error: error?.message ?? "Error guardando la lista." };
  }

  return { id: data.id, error: null };
}

/**
 * Guarda una campaña asociada a una lista y un template ya existentes.
 * Requiere ycloud_api y waba_id del tenant (campos NOT NULL en el esquema);
 * si el tenant todavía no los configuró, se informa el error en vez de
 * insertar datos incompletos que rompan la fila.
 */
export async function saveCampaignAction(
  nombre: string,
  listaId: string | null,
  templateId: string | null,
  contactosIds: string[],
): Promise<SaveResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { id: null, error: "No hay sesión activa." };

  const { data: cliente, error: clienteError } = await supabase
    .from("yamas_inmo_clientes")
    .select("tenant_id, ycloud_api, wabaid")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (clienteError || !cliente?.tenant_id) {
    return { id: null, error: "No se pudo resolver el tenant del usuario." };
  }

  if (!cliente.ycloud_api || !cliente.wabaid) {
    return {
      id: null,
      error:
        "Tu cuenta todavía no tiene configurada la integración de WhatsApp (ycloud_api / wabaid). Contactá a soporte antes de crear campañas.",
    };
  }

  const { data, error } = await supabase
    .from("yamas_send_campanas")
    .insert({
      tenant_id: cliente.tenant_id,
      nombre,
      lista_id: listaId,
      template_id: templateId,
      contactos_ids: contactosIds,
      contactos_count: contactosIds.length,
      ycloud_api: cliente.ycloud_api,
      waba_id: cliente.wabaid,
      status: "borrador",
    })
    .select("id")
    .single();

  if (error || !data) {
    return {
      id: null,
      error: error?.message ?? "Error guardando la campaña.",
    };
  }

  return { id: data.id, error: null };
}
