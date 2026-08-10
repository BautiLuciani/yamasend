"use server";

import { createClient } from "@/lib/supabase/server";
import type { SyncConfig, SyncResult } from "@/lib/types";

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

    return {
      success: data.success ?? true,
      contactosProcesados: data.contactos_procesados ?? 0,
      contactosAnalizados: data.contactos_analizados ?? 0,
      contactosOmitidos: data.contactos_omitidos ?? 0,
      leadsIdentificados: data.leads_identificados ?? 0,
      erroresGuardado: data.errores_guardado ?? 0,
      mensaje: data.mensaje,
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
