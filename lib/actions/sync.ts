"use server";

import { createClient } from "@/lib/supabase/server";
import { assertPermiso } from "@/lib/auth/permisos";
import type { SyncConfig, SyncResult } from "@/lib/types";
import { logActivity } from "@/lib/actions/activity";
import { CATEGORIA_TEMPLATE_UNICA } from "@/lib/templates/config";

// Webhook del workflow "Yamasend: Sincronizar Contactos + Análisis de Chats (v2)"
// en n8n. El nodo "0. Resolver auth.uid" del workflow espera el token en el
// header Authorization real de la request entrante (lee $json.headers.authorization).
// Como este fetch corre server-side (Server Action, no en el browser), no hay
// problema de preflight CORS acá — ese es un tema exclusivo de fetch desde el
// cliente (ver WAHA_QR_WEBHOOK_URL en AppShell.tsx, que sí corre en el browser).
const SYNC_ANALIZAR_WEBHOOK_URL =
  "https://yamasai.app.n8n.cloud/webhook/yamasend-sync-analizar";

/**
 * Dispara la sincronización + análisis de IA de los contactos de WhatsApp
 * del tenant logueado. El tenant_id nunca viaja desde el cliente: el workflow
 * de n8n lo resuelve server-side a partir del access_token, igual que acá.
 */
export async function syncAndAnalyzeAction(
  config: SyncConfig,
): Promise<SyncResult> {
  // Gate de permisos: el chequeo real vive acá, no en la UI. Un botón
  // escondido no impide invocar el server action directamente.
  const gate = await assertPermiso("importar_contactos");
  if (!gate.ok) return {
      success: false,
      contactosProcesados: 0,
      contactosAnalizados: 0,
      contactosOmitidos: 0,
      leadsIdentificados: 0,
      erroresGuardado: 0,
      error: gate.error ?? undefined,
    };

  const supabase = await createClient();

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    return {
      success: false,
      contactosProcesados: 0,
      contactosAnalizados: 0,
      contactosOmitidos: 0,
      leadsIdentificados: 0,
      erroresGuardado: 0,
      error: "No hay sesión activa.",
    };
  }

  try {
    const res = await fetch(SYNC_ANALIZAR_WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        dias_analisis: config.diasAnalisis,
        limite_contactos: config.limiteContactos,
        consulta: config.consulta,
      }),
    });

    if (!res.ok) {
      return {
        success: false,
        contactosProcesados: 0,
        contactosAnalizados: 0,
        contactosOmitidos: 0,
        leadsIdentificados: 0,
        erroresGuardado: 0,
        error: `El servidor de análisis respondió con error (${res.status}).`,
      };
    }

    const data = await res.json();

    const contactosProcesados = data.contactos_procesados ?? 0;
    const leadsIdentificados = data.leads_identificados ?? 0;

    // Logging de actividad: no bloquea la respuesta al usuario. Resolvemos
    // tenant_id acá porque esta acción, a diferencia de las demás, delega
    // esa resolución al workflow de n8n (vía access_token) y no lo necesita
    // para nada más que este log.
    if (contactosProcesados > 0 || leadsIdentificados > 0) {
      const { data: cliente } = await supabase
        .from("yamas_inmo_clientes")
        .select("tenant_id")
        .eq("auth_user_id", session.user.id)
        .maybeSingle();

      if (cliente?.tenant_id) {
        if (contactosProcesados > 0) {
          logActivity(
            cliente.tenant_id,
            "contactos_importados",
            `Se importaron ${contactosProcesados} contacto${contactosProcesados === 1 ? "" : "s"}`,
            { contactos_procesados: contactosProcesados },
          );
        }
        if (leadsIdentificados > 0) {
          logActivity(
            cliente.tenant_id,
            "ia_analisis",
            `La IA identificó ${leadsIdentificados} lead${leadsIdentificados === 1 ? "" : "s"} nuevo${leadsIdentificados === 1 ? "" : "s"}`,
            { leads_identificados: leadsIdentificados },
          );
        }
      }
    }

    const leads = Array.isArray(data.leads)
      ? data.leads
          .filter((l: unknown): l is Record<string, unknown> => !!l && typeof l === "object")
          .map((l: Record<string, unknown>) => ({
            telefono: String(l.telefono ?? ""),
            nombre: typeof l.nombre === "string" ? l.nombre : null,
            temperatura: (["caliente", "tibio", "frio"].includes(l.temperatura as string)
              ? l.temperatura
              : "frio") as "caliente" | "tibio" | "frio",
            scoreInteres: Number(l.score_interes ?? 0),
          }))
          .filter((l: { telefono: string }) => l.telefono)
      : undefined;

    return {
      success: data.success ?? true,
      contactosProcesados,
      contactosAnalizados: data.contactos_analizados ?? 0,
      contactosOmitidos: data.contactos_omitidos ?? 0,
      leadsIdentificados,
      erroresGuardado: data.errores_guardado ?? 0,
      mensaje: data.mensaje,
      leads,
    };
  } catch {
    return {
      success: false,
      contactosProcesados: 0,
      contactosAnalizados: 0,
      contactosOmitidos: 0,
      leadsIdentificados: 0,
      erroresGuardado: 0,
      error: "No se pudo conectar con el servicio de análisis. Reintentá en unos segundos.",
    };
  }
}

// Webhook del workflow "YamaSend — Generar Template con IA" en n8n.
// Recibe { descripcion, categoria } y devuelve { ok, sugerencia } con un
// mensaje de template redactado por un AI Agent (OpenAI) siguiendo las
// reglas de Meta para templates de WhatsApp.
const TEMPLATE_IA_WEBHOOK_URL =
  "https://yamasai.app.n8n.cloud/webhook/yamasend-template-ia";

export interface GenerarTemplateIAResult {
  sugerencia: string | null;
  error: string | null;
}

/**
 * Genera un mensaje de template sugerido a partir de una descripción libre
 * de lo que el usuario quiere comunicar. No persiste nada — solo genera
 * texto — pero sí resuelve el tenant_id del usuario logueado (cuando hay
 * sesión) para que el workflow de n8n pueda traer el contexto de negocio
 * (yamas_inmo_clientes) y personalizar el tono/rubro del mensaje generado.
 * Si no hay sesión (caso raro, no debería pasar en el panel logueado), se
 * sigue generando el template de forma genérica como antes.
 */
export async function generarTemplateConIAAction(
  descripcion: string,
  // Se ignora: por ahora todos los templates son de Marketing (ver
  // lib/templates/config.ts). Queda en la firma para no romper a los que llaman.
  _categoria: string,
): Promise<GenerarTemplateIAResult> {
  void _categoria;
  const categoria = CATEGORIA_TEMPLATE_UNICA;
  // Gate de permisos: el chequeo real vive acá, no en la UI. Un botón
  // escondido no impide invocar el server action directamente.
  const gate = await assertPermiso("crear_templates");
  if (!gate.ok) return { sugerencia: null, error: gate.error };

  if (!descripcion.trim()) {
    return { sugerencia: null, error: "Contá qué querés comunicar para poder generar el mensaje." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let tenantId: string | null = null;
  if (user) {
    const { data: cliente } = await supabase
      .from("yamas_inmo_clientes")
      .select("tenant_id")
      .eq("auth_user_id", user.id)
      .maybeSingle();
    tenantId = cliente?.tenant_id ?? null;
  }

  try {
    const res = await fetch(TEMPLATE_IA_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        descripcion: descripcion.trim(),
        categoria,
        tenant_id: tenantId,
      }),
    });

    if (!res.ok) {
      return {
        sugerencia: null,
        error: `El generador de mensajes respondió con error (${res.status}).`,
      };
    }

    const data = await res.json();

    if (!data.sugerencia) {
      return { sugerencia: null, error: "No se pudo generar una sugerencia. Probá reformular la descripción." };
    }

    return { sugerencia: data.sugerencia, error: null };
  } catch {
    return {
      sugerencia: null,
      error: "No se pudo conectar con el generador de mensajes. Reintentá en unos segundos.",
    };
  }
}

/**
 * Permite al vendedor pisar manualmente la temperatura calculada por IA
 * para un contacto puntual (columna temperatura_manual). La columna generada
 * temperatura_efectiva en Supabase resuelve sola cuál mostrar.
 * Pasar null limpia el override y vuelve a mostrar el valor calculado por IA.
 */
export async function setTemperaturaManualAction(
  leadId: string,
  temperatura: "caliente" | "tibio" | "frio" | null,
): Promise<{ error: string | null }> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "No hay sesión activa." };

  // Confirmamos que el lead pertenece al tenant del usuario logueado antes
  // de tocarlo, aunque RLS ya lo garantice — defensa en profundidad.
  const { data: cliente } = await supabase
    .from("yamas_inmo_clientes")
    .select("tenant_id")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (!cliente?.tenant_id) {
    return { error: "No se pudo resolver el tenant del usuario." };
  }

  const { error } = await supabase
    .from("yamas_send_leads")
    .update({ temperatura_manual: temperatura })
    .eq("id", leadId)
    .eq("tenant_id", cliente.tenant_id);

  if (error) return { error: error.message };
  return { error: null };
}

/**
 * Le pone nombre a un contacto (pensado sobre todo para los "Sin nombre").
 * Lo resuelve la RPC yamas_send_renombrar_contacto (tenant y permiso
 * importar_contactos del lado de la base), que guarda el nombre en
 * nombre_manual de leads y contactos: un trigger hace que ese nombre gane
 * siempre, aunque después entre un nombre de WhatsApp o un nuevo análisis.
 * Ver docs/migraciones/2026-10-nombre-manual-contactos.sql.
 */
export async function renombrarContactoAction(
  leadId: string,
  nombre: string,
): Promise<{ nombre: string | null; error: string | null }> {
  const gate = await assertPermiso("importar_contactos");
  if (!gate.ok) return { nombre: null, error: gate.error ?? "No tenés permiso para editar contactos." };

  const limpio = String(nombre ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
  if (!limpio) return { nombre: null, error: "El nombre no puede quedar vacío." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("yamas_send_renombrar_contacto", {
    p_lead_id: leadId,
    p_nombre: limpio,
  });
  if (error) {
    console.error("[renombrarContactoAction]", error);
    return { nombre: null, error: "No se pudo guardar el nombre. Probá de nuevo." };
  }
  const r = data as { ok?: boolean; error?: string; nombre?: string } | null;
  if (!r?.ok) {
    const motivos: Record<string, string> = {
      sin_permiso: "No tenés permiso para editar contactos.",
      nombre_vacio: "El nombre no puede quedar vacío.",
      no_encontrado: "No encontramos ese contacto.",
    };
    return { nombre: null, error: motivos[r?.error ?? ""] ?? "No se pudo guardar el nombre." };
  }
  return { nombre: r.nombre ?? limpio, error: null };
}

/**
 * Chequea si el WhatsApp del tenant logueado está vinculado (yamas_send_waha_sessions.estado
 * === "conectada") antes de permitir analizar/sincronizar contactos. Se usa tanto en el
 * modal de análisis (SyncConfigModal, vía AppShell) como en el flujo conversacional de la
 * IA (lib/actions/ia.ts), para que ambos caminos bloqueen el análisis del mismo modo si el
 * celular no está vinculado.
 */
export async function isWahaConectadaAction(): Promise<boolean> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return false;

  const { data: cliente } = await supabase
    .from("yamas_inmo_clientes")
    .select("tenant_id")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (!cliente?.tenant_id) return false;

  const { data: sesion } = await supabase
    .from("yamas_send_waha_sessions")
    .select("estado")
    .eq("tenant_id", cliente.tenant_id)
    .maybeSingle();

  return sesion?.estado === "conectada";
}
