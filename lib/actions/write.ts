"use server";

import { createClient } from "@/lib/supabase/server";
import type { Template } from "@/lib/types";
import { logActivity } from "@/lib/actions/activity";

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

  logActivity(
    cliente.tenant_id,
    "grupo_creado",
    `Audiencia "${nombre}" creada con ${contactosIds.length} contacto${contactosIds.length === 1 ? "" : "s"}`,
    { lista_id: data.id, contactos_count: contactosIds.length },
  );

  return { id: data.id, error: null };
}

/**
 * Suma contactos a una audiencia (yamas_send_listas) ya existente, sin duplicar
 * los que ya estuvieran en contactos_ids. Usado desde la barra flotante de
 * Contactos → "Agregar a audiencia existente".
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
    return { id: null, error: "No se pudo encontrar la audiencia." };
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
 * Renombra una audiencia (yamas_send_listas) ya existente.
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

  logActivity(cliente.tenant_id, "grupo_editado", `Audiencia renombrada a "${nombre}"`, {
    lista_id: listaId,
  });

  return { error: null };
}

/**
 * Quita contactos puntuales de una audiencia (yamas_send_listas) ya existente.
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
    return { error: "No se pudo encontrar la audiencia." };
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
 * Elimina una audiencia (yamas_send_listas) por completo. El llamador debe pedir
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

  const { data: listaAborrar } = await supabase
    .from("yamas_send_listas")
    .select("nombre")
    .eq("id", listaId)
    .eq("tenant_id", cliente.tenant_id)
    .maybeSingle();

  const { error } = await supabase
    .from("yamas_send_listas")
    .delete()
    .eq("id", listaId)
    .eq("tenant_id", cliente.tenant_id);

  if (error) return { error: error.message };

  logActivity(
    cliente.tenant_id,
    "grupo_eliminado",
    `Audiencia "${listaAborrar?.nombre ?? listaId}" eliminada`,
    { lista_id: listaId },
  );

  return { error: null };
}

// Webhook del workflow "Yamasend — envios mensajes meta" en n8n. Recibe
// { tenant_id, ycloud_api, wabaid, ventas_tel, lista_id, template_name,
// template_language, ventana_24h, total } y dispara el envío masivo vía
// YCloud, actualizando yamas_send_listas.status y yamas_inmo_clientesdeclientes
// a medida que va enviando.
const CAMPAIGN_SEND_WEBHOOK_URL =
  "https://yamasai.app.n8n.cloud/webhook/9a625055-39fb-4b59-a991-5f9d19beb32f";

/**
 * Guarda una campaña asociada a una lista y un template ya existentes.
 * Requiere ycloud_api y waba_id del tenant (campos NOT NULL en el esquema);
 * si el tenant todavía no los configuró, se informa el error en vez de
 * insertar datos incompletos que rompan la fila.
 * Desnormaliza lista_nombre/template_nombre para que la tabla de Campañas
 * no necesite hacer joins para mostrarse.
 * status inicial: "programada" si se pasa fechaProgramada (futura), si no
 * "enviando" (el llamador dispara sendCampaignAction a continuación).
 *
 * esDuplicada: true cuando el llamador pre-cargó el wizard a partir de
 * "Duplicar" en el modal de detalle de campaña (ver onDuplicate en
 * AppShell.tsx). No cambia la lógica de guardado — solo el tipo de evento
 * que se registra en el log de actividad del Dashboard.
 */
export async function saveCampaignAction(
  nombre: string,
  listaId: string | null,
  templateId: string | null,
  contactosIds: string[],
  fechaProgramada: string | null = null,
  esDuplicada: boolean = false,
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

  const [{ data: lista }, { data: template }] = await Promise.all([
    listaId
      ? supabase.from("yamas_send_listas").select("nombre").eq("id", listaId).maybeSingle()
      : Promise.resolve({ data: null }),
    templateId
      ? supabase.from("yamas_send_templates").select("nombre").eq("id", templateId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const { data, error } = await supabase
    .from("yamas_send_campanas")
    .insert({
      tenant_id: cliente.tenant_id,
      nombre,
      lista_id: listaId,
      template_id: templateId,
      lista_nombre: lista?.nombre ?? null,
      template_nombre: template?.nombre ?? null,
      contactos_ids: contactosIds,
      contactos_count: contactosIds.length,
      ycloud_api: cliente.ycloud_api,
      waba_id: cliente.wabaid,
      status: fechaProgramada ? "programada" : "enviando",
      fecha_programada: fechaProgramada,
    })
    .select("id")
    .single();

  if (error || !data) {
    return {
      id: null,
      error: error?.message ?? "Error guardando la campaña.",
    };
  }

  logActivity(
    cliente.tenant_id,
    esDuplicada ? "campana_duplicada" : "campana_creada",
    esDuplicada
      ? `Campaña "${nombre}" duplicada`
      : `Campaña "${nombre}" creada`,
    { campana_id: data.id, contactos_count: contactosIds.length },
  );

  return { id: data.id, error: null };
}

export interface SendCampaignResult {
  ok: boolean;
  error: string | null;
}

/**
 * Dispara el envío inmediato de una campaña ya guardada, llamando al
 * workflow de n8n "Yamasend — envios mensajes meta". Resuelve
 * ycloud_api/wabaid/ventas_tel del tenant server-side (nunca del cliente).
 * Se usa tanto para "Enviar ahora" como, desde el scheduler de n8n, para
 * campañas programadas cuya fecha_programada ya venció (en ese caso el
 * propio n8n llama a este mismo webhook directamente, sin pasar por acá).
 */
export async function sendCampaignAction(
  campaignId: string,
  listaId: string,
  templateName: string,
  templateLanguage: string,
  ventana24h: boolean,
  total: number,
): Promise<SendCampaignResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { ok: false, error: "No hay sesión activa." };

  const { data: cliente, error: clienteError } = await supabase
    .from("yamas_inmo_clientes")
    .select("tenant_id, ycloud_api, wabaid, ventas_tel")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (clienteError || !cliente?.tenant_id) {
    return { ok: false, error: "No se pudo resolver el tenant del usuario." };
  }

  if (!cliente.ycloud_api || !cliente.wabaid || !cliente.ventas_tel) {
    return {
      ok: false,
      error:
        "Tu cuenta todavía no tiene configurada la integración de WhatsApp (ycloud_api / wabaid / ventas_tel). Contactá a soporte.",
    };
  }

  try {
    const res = await fetch(CAMPAIGN_SEND_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tenant_id: cliente.tenant_id,
        campaign_id: campaignId,
        ycloud_api: cliente.ycloud_api,
        wabaid: cliente.wabaid,
        ventas_tel: cliente.ventas_tel,
        lista_id: listaId,
        template_name: templateName,
        template_language: templateLanguage,
        ventana_24h: ventana24h,
        total,
      }),
    });

    const data = await res.json().catch(() => null);

    if (!res.ok || !data || data.ok === false) {
      await supabase
        .from("yamas_send_campanas")
        .update({ status: "error" })
        .eq("id", campaignId);
      return {
        ok: false,
        error: `El servidor de envío respondió con error (${res.status}).`,
      };
    }

    return { ok: true, error: null };
  } catch {
    await supabase
      .from("yamas_send_campanas")
      .update({ status: "error" })
      .eq("id", campaignId);
    return {
      ok: false,
      error: "No se pudo conectar con el servicio de envío. Reintentá en unos segundos.",
    };
  }
}

/**
 * Borra un borrador de template puntual. Acotado a tenant + status =
 * "borrador" para no poder borrar por error un template ya enviado a Meta.
 * Se usa cuando el usuario continúa un borrador y lo manda directo a
 * aprobación, para no dejar una fila "borrador" duplicada con la nueva
 * fila "enviado" que crea el workflow de n8n.
 */
/**
 * Elimina una campaña y sus mensajes asociados. Bloqueada para campañas en
 * estado "enviando" (hay un envío en curso disparado por el workflow de
 * n8n; borrarla a mitad de camino dejaría el envío corriendo sin ningún
 * registro al que actualizar). El resto de los estados (borrador,
 * programada, enviado, error, cancelado) se pueden eliminar libremente.
 */
export async function deleteCampaignAction(
  campaignId: string,
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

  const { data: campana, error: campanaError } = await supabase
    .from("yamas_send_campanas")
    .select("id, nombre, status")
    .eq("id", campaignId)
    .eq("tenant_id", cliente.tenant_id)
    .maybeSingle();

  if (campanaError || !campana) {
    return { error: "No se encontró la campaña." };
  }

  if (campana.status === "enviando") {
    return {
      error: "No se puede eliminar una campaña que está enviándose en este momento.",
    };
  }

  const { error: mensajesError } = await supabase
    .from("yamas_send_mensajes")
    .delete()
    .eq("campana_id", campaignId)
    .eq("tenant_id", cliente.tenant_id);

  if (mensajesError) return { error: mensajesError.message };

  const { error: campanaDeleteError } = await supabase
    .from("yamas_send_campanas")
    .delete()
    .eq("id", campaignId)
    .eq("tenant_id", cliente.tenant_id);

  if (campanaDeleteError) return { error: campanaDeleteError.message };

  logActivity(
    cliente.tenant_id,
    "campana_eliminada",
    `Campaña "${campana.nombre}" eliminada`,
    { campana_id: campaignId },
  );

  return { error: null };
}

export async function deleteTemplateDraftAction(
  templateId: string,
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
    .from("yamas_send_templates")
    .delete()
    .eq("id", templateId)
    .eq("tenant_id", cliente.tenant_id)
    .eq("status", "borrador");

  if (error) return { error: error.message };
  return { error: null };
}

/**
 * Guarda un template como borrador en yamas_send_templates (status: "borrador").
 * Solo requiere el nombre — contenido/categoría pueden completarse después,
 * ya que el usuario puede querer reservar el nombre y volver más tarde.
 * No llama a YCloud/Meta: es puramente local hasta que se mande a aprobar.
 *
 * Si se pasa templateId, actualiza ese borrador existente (caso "Continuar
 * borrador") en vez de insertar una fila nueva. El UPDATE queda acotado al
 * tenant del usuario logueado y a status = "borrador", para no permitir
 * pisar por error un template que ya se mandó a Meta.
 */
export async function saveTemplateDraftAction(
  nombre: string,
  contenido: string,
  categoria: string,
  templateId?: string | null,
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

  if (templateId) {
    const { data, error } = await supabase
      .from("yamas_send_templates")
      .update({
        nombre: nombre.trim(),
        contenido: contenido.trim(),
        template_type: categoria,
      })
      .eq("id", templateId)
      .eq("tenant_id", cliente.tenant_id)
      .eq("status", "borrador")
      .select("id")
      .single();

    if (error || !data) {
      return { id: null, error: error?.message ?? "Error actualizando el borrador." };
    }

    return { id: data.id, error: null };
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

  logActivity(
    cliente.tenant_id,
    "template_creado",
    `Template "${nombre.trim()}" creado`,
    { template_id: data.id },
  );

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

// Webhook del workflow "YamaSend — Insight IA Campañas" en n8n. Recibe
// { tenant_id }, trae las campañas del tenant desde Supabase y devuelve un
// insight redactado por GPT. El resultado se cachea en
// yamas_send_insights_cache (1 por tenant por día) para no llamar al LLM en
// cada carga de pantalla. Reutilizado por el modal de Nueva Campaña y,
// eventualmente, por el Dashboard.
const CAMPAIGN_INSIGHT_WEBHOOK_URL =
  "https://yamasai.app.n8n.cloud/webhook/yamasend-insight-campanas";

export interface RefreshTemplatesResult {
  templates: Template[] | null;
  error: string | null;
}

/**
 * Devuelve los templates del tenant logueado en su estado actual. Pensada
 * para ser invocada periódicamente desde el cliente (polling) mientras haya
 * templates en estado "enviado", ya que el cambio de status llega vía
 * webhook de YCloud y el panel no tiene otra forma de enterarse sin recargar
 * la página. Reutiliza el mismo mapeo que getTemplatesForTenant.
 */
export async function refreshTemplatesAction(): Promise<RefreshTemplatesResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { templates: null, error: "No hay sesión activa." };

  const { data: cliente, error: clienteError } = await supabase
    .from("yamas_inmo_clientes")
    .select("tenant_id")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (clienteError || !cliente?.tenant_id) {
    return { templates: null, error: "No se pudo resolver el tenant del usuario." };
  }

  const { data: rows, error } = await supabase
    .from("yamas_send_templates")
    .select("id, nombre, contenido, status, template_type, meta_rechazo_motivo, template_lang")
    .eq("tenant_id", cliente.tenant_id)
    .order("created_at", { ascending: false });

  if (error || !rows) {
    return { templates: null, error: error?.message ?? "No se pudieron traer los templates." };
  }

  const templates: Template[] = rows.map((r) => ({
    id: r.id,
    nombre: r.nombre,
    contenido: r.contenido,
    status: (r.status as Template["status"]) ?? "borrador",
    tipo: r.template_type ?? "marketing",
    precio: "0.0618",
    rechazoMotivo: r.meta_rechazo_motivo ?? null,
    templateLang: r.template_lang ?? "es_AR",
  }));

  return { templates, error: null };
}

/**
 * Devuelve el insight de IA del tenant, usando cache de Supabase si ya se
 * generó uno hoy. Si no hay cache vigente, llama al workflow de n8n, que es
 * quien se encarga de guardar el resultado nuevo en la tabla de cache.
 */
export interface CampaignInsightResult {
  insight: string | null;
  error: string | null;
}

export async function getCampaignInsightAction(): Promise<CampaignInsightResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { insight: null, error: "No hay sesión activa." };

  const { data: cliente, error: clienteError } = await supabase
    .from("yamas_inmo_clientes")
    .select("tenant_id")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (clienteError || !cliente?.tenant_id) {
    return { insight: null, error: "No se pudo resolver el tenant del usuario." };
  }

  const inicioDeHoy = new Date();
  inicioDeHoy.setHours(0, 0, 0, 0);

  const { data: cache } = await supabase
    .from("yamas_send_insights_cache")
    .select("insight")
    .eq("tenant_id", cliente.tenant_id)
    .gte("generado_at", inicioDeHoy.toISOString())
    .order("generado_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (cache?.insight) {
    return { insight: cache.insight, error: null };
  }

  try {
    const res = await fetch(CAMPAIGN_INSIGHT_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenant_id: cliente.tenant_id }),
    });

    const data = await res.json().catch(() => null);

    if (!res.ok || !data?.insight) {
      return {
        insight: null,
        error: "No se pudo generar el insight en este momento.",
      };
    }

    return { insight: data.insight as string, error: null };
  } catch {
    return {
      insight: null,
      error: "No se pudo conectar con el servicio de insights.",
    };
  }
}
