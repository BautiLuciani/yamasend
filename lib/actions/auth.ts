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
  whatsapp: string;
  password: string;
  plan: PlanKey;
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

  const { error: insertError } = await supabase
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

  return { error: null };
}

export async function logoutAction(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
}
