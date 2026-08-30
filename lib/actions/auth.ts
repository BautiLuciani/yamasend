"use server";

import { createClient } from "@/lib/supabase/server";
import type { PlanKey } from "@/lib/types";

export interface AuthResult {
  error: string | null;
}

/**
 * Login con email + password vía Supabase Auth.
 * Ya no comparamos password en texto plano: Supabase valida el hash internamente.
 */
export async function loginAction(
  email: string,
  password: string,
): Promise<AuthResult> {
  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    // Mensaje genérico: no revelamos si el email existe o no (buena práctica de seguridad).
    return { error: "Email o contraseña incorrectos." };
  }

  return { error: null };
}

/**
 * Registro: crea el usuario en Supabase Auth y, si tiene éxito,
 * crea la fila correspondiente en yamas_inmo_clientes vinculada por auth_user_id.
 */
export async function registerAction(data: {
  nombre: string;
  email: string;
  /** Vacío para cuentas de empresa: no tienen WhatsApp propio. */
  whatsapp: string;
  password: string;
  plan: PlanKey;
  /**
   * Token de un link de invitación (/register?invite=...). Si viene, el
   * usuario queda vinculado a esa organización en estado "pendiente" hasta
   * que la empresa lo apruebe. Si no viene, es un empleado independiente.
   */
  inviteToken?: string | null;
}): Promise<AuthResult> {
  const supabase = await createClient();

  const waClean = data.whatsapp.replace(/[\s+\-()]/g, "");

  const { data: authData, error: authError } = await supabase.auth.signUp({
    email: data.email,
    password: data.password,
  });

  if (authError) {
    return { error: authError.message || "No se pudo crear la cuenta." };
  }

  if (!authData.user) {
    return { error: "No se pudo crear la cuenta. Intentá de nuevo." };
  }

  const trialEnd = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];

  // Una cuenta de empresa no tiene WhatsApp, así que no lleva fila en
  // yamas_inmo_clientes. Ese hueco es lo que la deja bloqueada de todas las
  // tablas base por RLS, que es exactamente lo que queremos.
  const esEmpresa = waClean.length === 0;

  const { error: insertError } = esEmpresa
    ? { error: null }
    : await supabase
    .from("yamas_inmo_clientes")
    .insert({
      ID: waClean,
      auth_user_id: authData.user.id,
      tenant_id: waClean,
      account_id: waClean,
      ventas_tel: waClean,
      contacto_nombre: data.nombre,
      contacto_email: data.email,
      plan: data.plan,
      YamaSend: "yes",
      trialend: trialEnd,
    });

  if (insertError) {
    return {
      error:
        "La cuenta se creó pero hubo un error guardando los datos: " +
        insertError.message,
    };
  }

  // Alta de la membresía (rol + permisos). La RPC decide el rol internamente:
  // nunca se lo mandamos como parámetro, porque si el cliente pudiera elegirlo
  // cualquiera se registraría como "admin".
  const { data: alta, error: rpcError } = await supabase.rpc(
    "yamas_send_registrar_miembro",
    {
      p_tenant_id: esEmpresa ? null : waClean,
      p_nombre: data.nombre,
      p_invite_token: data.inviteToken?.trim() || null,
    },
  );

  if (rpcError) {
    return {
      error:
        "La cuenta se creó pero hubo un error configurando los permisos: " +
        rpcError.message,
    };
  }

  // Una invitación vencida o revocada no debe romper el registro: la cuenta
  // ya existe y es válida. Se avisa y queda como empleado independiente, que
  // es un estado consistente; la empresa puede reinvitarla después.
  const resultado = alta as { ok?: boolean; error?: string } | null;
  if (resultado && resultado.ok === false) {
    if (resultado.error === "invitacion_invalida") {
      return {
        error:
          "Tu cuenta se creó, pero el link de invitación ya venció o fue revocado. Pedile a la empresa que te mande uno nuevo.",
      };
    }
    if (resultado.error !== "ya_es_miembro") {
      return {
        error: "La cuenta se creó pero no se pudieron configurar los permisos.",
      };
    }
  }

  return { error: null };
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
 * Resuelve qué tipo de invitación es un token, para que /register sepa si
 * pedir el número de WhatsApp (empleado) o no (empresa, que es una consola
 * de gestión sin WhatsApp propio).
 *
 * Corre sin sesión, porque quien se va a registrar todavía no la tiene. La
 * función de Postgres expone solo el rol, el email y el nombre de la
 * organización: nunca los permisos ni el token en sí.
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
