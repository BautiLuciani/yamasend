"use server";

import { createClient } from "@/lib/supabase/server";
import { getOnboardingLink } from "@/lib/services/whatsappOnboarding";
import { dominioDeEmailExiste } from "@/lib/utils/validarEmail";

/**
 * Chequea (por DNS) que el dominio del email pueda recibir correo, antes de
 * mandar el magic link de registro. El magic link en sí se pide desde el
 * navegador (ver app/login-gate.tsx): esta acción NO toca cookies a
 * propósito, así no dispara el re-render de la página que borraba el cartel
 * de "Revisá tu email".
 */
export async function validarDominioEmailAction(email: string): Promise<boolean> {
  return dominioDeEmailExiste(email);
}

export async function logoutAction(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
}

export interface InfoInvitacion {
  valida: boolean;
  rol: "empresa" | "empleado" | null;
  email: string | null;
  organizacion: string | null;
}

/**
 * Resuelve qué tipo de invitación es un token. Corre sin sesión, porque
 * quien se va a registrar todavía no la tiene.
 */
export async function getInfoInvitacionAction(
  token: string,
): Promise<InfoInvitacion> {
  const vacio: InfoInvitacion = {
    valida: false,
    rol: null,
    email: null,
    organizacion: null,
  };
  if (!token?.trim()) return vacio;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("yamas_send_info_invitacion", {
    p_token: token.trim(),
  });
  if (error || !data) return vacio;

  const r = data as {
    valida?: boolean;
    rol?: string;
    email?: string;
    organizacion?: string;
  };
  if (!r.valida) return vacio;

  return {
    valida: true,
    rol: (r.rol as "empresa" | "empleado") ?? "empleado",
    email: r.email ?? null,
    organizacion: r.organizacion ?? null,
  };
}

export type ResultadoPrimerIngreso =
  | { destino: "/panel" }
  | { destino: "/conectar-whatsapp" }
  | { destino: "/register"; error: string };

/**
 * Se llama UNA vez, justo después de que /auth/callback confirma el magic
 * link y ya hay sesión real (auth.uid() válido). Decide qué le falta a esta
 * cuenta y lo crea:
 *
 *   - Ya tiene membresía              → nada que hacer, al panel.
 *   - Ya tiene una conexión pendiente → todavía no conectó WhatsApp, retomar ahí.
 *   - Es la primera vez                → lee el metadata que viajó en el
 *     magic link (nombre, tipo de cuenta, invitación) y:
 *       · empresa (propia o por invitación) → no necesita WhatsApp, se
 *         registra completo ya mismo con la RPC de siempre.
 *       · individual / empleado invitado    → crea una fila en
 *         whatsapp_pending_connections y lo manda a conectar WhatsApp.
 *
 * Idempotente: si el usuario vuelve a clickear un magic link viejo, no
 * duplica nada (chequea membresía y pending antes de crear algo nuevo).
 */
export async function procesarPrimerIngreso(): Promise<ResultadoPrimerIngreso> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { destino: "/register", error: "Tu sesión expiró. Probá de nuevo." };
  }

  const { data: miembro } = await supabase
    .from("yamas_send_miembros")
    .select("id")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (miembro) return { destino: "/panel" };

  const { data: pendiente } = await supabase
    .from("whatsapp_pending_connections")
    .select("id, status")
    .eq("auth_user_id", user.id)
    .eq("status", "pending")
    .maybeSingle();
  if (pendiente) return { destino: "/conectar-whatsapp" };

  const meta = (user.user_metadata ?? {}) as {
    nombre?: string;
    tipo_cuenta?: "individual" | "empresa";
    nombre_empresa?: string | null;
    invite_token?: string | null;
  };

  const inviteToken = meta.invite_token?.trim() || null;
  let infoInvite: InfoInvitacion | null = null;
  if (inviteToken) {
    infoInvite = await getInfoInvitacionAction(inviteToken);
    if (!infoInvite.valida) {
      return {
        destino: "/register",
        error: "El link de invitación ya venció o fue revocado.",
      };
    }
  }

  const esEmpresa = infoInvite
    ? infoInvite.rol === "empresa"
    : meta.tipo_cuenta === "empresa";

  if (esEmpresa) {
    // Camino sin WhatsApp: exactamente la misma RPC de siempre, corriendo
    // ahora con sesión real (auth.uid() = user.id).
    const { data: alta, error: rpcError } = await supabase.rpc(
      "yamas_send_registrar_miembro",
      {
        p_tenant_id: null,
        p_nombre: meta.nombre ?? null,
        p_invite_token: inviteToken,
        p_tipo_cuenta: "empresa",
        p_nombre_empresa: meta.nombre_empresa?.trim() || null,
      },
    );
    const resultado = alta as { ok?: boolean; error?: string } | null;
    if (rpcError || resultado?.ok === false) {
      return {
        destino: "/register",
        error:
          resultado?.error === "nombre_empresa_invalido"
            ? "El nombre de la empresa no es válido."
            : "No se pudo configurar la cuenta de empresa.",
      };
    }
    return { destino: "/panel" };
  }

  // Individual o empleado invitado: falta WhatsApp. Se crea la conexión
  // pendiente y ahí es donde el frontend dispara el botón de Meta.
  const { error: insertError } = await supabase
    .from("whatsapp_pending_connections")
    .insert({
      auth_user_id: user.id,
      invite_token: inviteToken,
      nombre: meta.nombre ?? null,
    });

  if (insertError) {
    return {
      destino: "/register",
      error: "No se pudo iniciar la conexión con WhatsApp: " + insertError.message,
    };
  }

  return { destino: "/conectar-whatsapp" };
}

export interface EstadoConexionWhatsapp {
  status: "pending" | "confirmed" | "sin_conexion";
  onboardingLink: string | null;
}

/**
 * Usado por la pantalla /conectar-whatsapp: da el link al que mandar al
 * usuario, y lo que devuelve el polling para saber si ya confirmó.
 */
export async function getEstadoConexionWhatsapp(): Promise<EstadoConexionWhatsapp> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "sin_conexion", onboardingLink: null };

  const { data: pendiente } = await supabase
    .from("whatsapp_pending_connections")
    .select("id, status")
    .eq("auth_user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!pendiente) return { status: "sin_conexion", onboardingLink: null };

  if (pendiente.status === "confirmed") {
    return { status: "confirmed", onboardingLink: null };
  }

  const link = await getOnboardingLink(pendiente.id);
  return { status: "pending", onboardingLink: link };
}
