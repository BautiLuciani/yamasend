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
 * Suma contactos a un grupo (yamas_send_listas) ya existente, sin duplicar
 * los que ya estuvieran en contactos_ids. Usado desde la barra flotante de
 * Contactos → "Agregar a grupo existente".
 */
export async function addContactsToListAction(
  listaId: string,
  contactosIds: string[],
): Promise<SaveResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { id: null, error: "No hay sesión activa." };

  const { data: cliente } = await supabase
    .from("yamas_inmo_clientes")
    .select("tenant_id")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (!cliente?.tenant_id) {
    return { id: null, error: "No se pudo resolver el tenant del usuario." };
  }

  const { data: lista, error: fetchError } = await supabase
    .from("yamas_send_listas")
    .select("contactos_ids")
    .eq("id", listaId)
    .eq("tenant_id", cliente.tenant_id)
    .maybeSingle();

  if (fetchError || !lista) {
    return { id: null, error: "No se pudo encontrar el grupo." };
  }

  const actuales: string[] = lista.contactos_ids ?? [];
  const nuevos = Array.from(new Set([...actuales, ...contactosIds]));

  const { error } = await supabase
    .from("yamas_send_listas")
    .update({ contactos_ids: nuevos })
    .eq("id", listaId)
    .eq("tenant_id", cliente.tenant_id);

  if (error) return { id: null, error: error.message };
  return { id: listaId, error: null };
}

/**
 * Renombra un grupo (yamas_send_listas) ya existente.
 */
export async function renameListAction(
  listaId: string,
  nombre: string,
): Promise<{ error: string | null }> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "No hay sesión activa." };

  const { data: cliente } = await supabase
    .from("yamas_inmo_clientes")
    .select("tenant_id")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (!cliente?.tenant_id) {
    return { error: "No se pudo resolver el tenant del usuario." };
  }

  const { error } = await supabase
    .from("yamas_send_listas")
    .update({ nombre })
    .eq("id", listaId)
    .eq("tenant_id", cliente.tenant_id);

  if (error) return { error: error.message };
  return { error: null };
}

/**
 * Quita contactos puntuales de un grupo (yamas_send_listas) ya existente.
 */
export async function removeContactsFromListAction(
  listaId: string,
  contactosIds: string[],
): Promise<{ error: string | null }> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "No hay sesión activa." };

  const { data: cliente } = await supabase
    .from("yamas_inmo_clientes")
    .select("tenant_id")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (!cliente?.tenant_id) {
    return { error: "No se pudo resolver el tenant del usuario." };
  }

  const { data: lista, error: fetchError } = await supabase
    .from("yamas_send_listas")
    .select("contactos_ids")
    .eq("id", listaId)
    .eq("tenant_id", cliente.tenant_id)
    .maybeSingle();

  if (fetchError || !lista) {
    return { error: "No se pudo encontrar el grupo." };
  }

  const actuales: string[] = lista.contactos_ids ?? [];
  const restantes = actuales.filter((id) => !contactosIds.includes(id));

  const { error } = await supabase
    .from("yamas_send_listas")
    .update({ contactos_ids: restantes })
    .eq("id", listaId)
    .eq("tenant_id", cliente.tenant_id);

  if (error) return { error: error.message };
  return { error: null };
}

/**
 * Elimina un grupo (yamas_send_listas) por completo. El llamador debe pedir
 * confirmación explícita al usuario antes de invocar esta acción.
 */
export async function deleteListAction(
  listaId: string,
): Promise<{ error: string | null }> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "No hay sesión activa." };

  const { data: cliente } = await supabase
    .from("yamas_inmo_clientes")
    .select("tenant_id")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (!cliente?.tenant_id) {
    return { error: "No se pudo resolver el tenant del usuario." };
  }

  const { error } = await supabase
    .from("yamas_send_listas")
    .delete()
    .eq("id", listaId)
    .eq("tenant_id", cliente.tenant_id);

  if (error) return { error: error.message };
  return { error: null };
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

/**
 * Guarda un template como borrador en yamas_send_templates (status: "borrador").
 * Solo requiere el nombre — contenido/categoría pueden completarse después,
 * ya que el usuario puede querer reservar el nombre y volver más tarde.
 * No llama a YCloud/Meta: es puramente local hasta que se mande a aprobar.
 */
export async function saveTemplateDraftAction(
  nombre: string,
  contenido: string,
  categoria: string,
): Promise<SaveResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { id: null, error: "No hay sesión activa." };

  if (!nombre.trim()) {
    return { id: null, error: "El nombre del template es obligatorio." };
  }

  const { data: cliente, error: clienteError } = await supabase
    .from("yamas_inmo_clientes")
    .select("tenant_id")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (clienteError || !cliente?.tenant_id) {
    return { id: null, error: "No se pudo resolver el tenant del usuario." };
  }

  const { data, error } = await supabase
    .from("yamas_send_templates")
    .insert({
      tenant_id: cliente.tenant_id,
      nombre: nombre.trim(),
      contenido: contenido.trim(),
      template_type: categoria,
      status: "borrador",
    })
    .select("id")
    .single();

  if (error || !data) {
    return { id: null, error: error?.message ?? "Error guardando el borrador." };
  }

  return { id: data.id, error: null };
}

// Webhook del workflow "YamaSend — Aprobar Template Meta (YCloud)" en n8n.
// Recibe { tenant_id, template_id, ycloud_api, waba_id, nombre_meta, contenido,
// header, footer, botones }, crea el template en YCloud/Meta y guarda el
// resultado en yamas_send_templates (status: "enviado" o "error").
// El resultado final (verificado/rechazado) llega después, de forma
// asíncrona, vía el segundo webhook del mismo workflow (Webhook YCloud
// Templates) cuando YCloud dispara el evento whatsapp.template.reviewed.
const TEMPLATE_APROBAR_WEBHOOK_URL =
  "https://yamasai.app.n8n.cloud/webhook/2ec4468d-e12b-448b-94c8-5f8eb253be9b";

export interface SendTemplateResult {
  ok: boolean;
  templateId: string | null;
  status: "enviado" | "error" | null;
  mensaje: string;
  error: string | null;
}

/**
 * Envía un template a Meta para aprobación a través del workflow de n8n.
 * Resuelve tenant_id, ycloud_api y waba_id server-side (nunca desde el
 * cliente) y valida que el tenant tenga la integración de YCloud configurada
 * antes de llamar al webhook, igual que saveCampaignAction.
 */
export async function sendTemplateToMetaAction(
  nombre: string,
  contenido: string,
  categoria: string,
): Promise<SendTemplateResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      ok: false,
      templateId: null,
      status: null,
      mensaje: "",
      error: "No hay sesión activa.",
    };
  }

  if (!nombre.trim() || contenido.trim().length < 10) {
    return {
      ok: false,
      templateId: null,
      status: null,
      mensaje: "",
      error: "El template necesita un nombre y un mensaje de al menos 10 caracteres.",
    };
  }

  const { data: cliente, error: clienteError } = await supabase
    .from("yamas_inmo_clientes")
    .select("tenant_id, ycloud_api, wabaid")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (clienteError || !cliente?.tenant_id) {
    return {
      ok: false,
      templateId: null,
      status: null,
      mensaje: "",
      error: "No se pudo resolver el tenant del usuario.",
    };
  }

  if (!cliente.ycloud_api || !cliente.wabaid) {
    return {
      ok: false,
      templateId: null,
      status: null,
      mensaje: "",
      error:
        "Tu cuenta todavía no tiene configurada la integración de WhatsApp (ycloud_api / wabaid). Contactá a soporte antes de enviar templates a Meta.",
    };
  }

  try {
    const res = await fetch(TEMPLATE_APROBAR_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tenant_id: cliente.tenant_id,
        ycloud_api: cliente.ycloud_api,
        waba_id: cliente.wabaid,
        nombre_meta: nombre.trim(),
        contenido: contenido.trim(),
        categoria,
      }),
    });

    const data = await res.json().catch(() => null);

    if (!res.ok || !data) {
      return {
        ok: false,
        templateId: null,
        status: "error",
        mensaje: "",
        error: `El servidor de aprobación respondió con error (${res.status}).`,
      };
    }

    if (data.ok === false) {
      return {
        ok: false,
        templateId: null,
        status: "error",
        mensaje: "",
        error: data.mensaje ?? "Meta/YCloud rechazó la solicitud de creación del template.",
      };
    }

    return {
      ok: true,
      templateId: null,
      status: "enviado",
      mensaje:
        data.mensaje ??
        "Template enviado a Meta para verificación. Te avisamos cuando cambie el estado.",
      error: null,
    };
  } catch {
    return {
      ok: false,
      templateId: null,
      status: null,
      mensaje: "",
      error: "No se pudo conectar con el servicio de aprobación. Reintentá en unos segundos.",
    };
  }
}
