"use server";

import { createClient } from "@/lib/supabase/server";

export interface ProfileActionResult {
  error: string | null;
}

/**
 * Actualiza datos del perfil personal y/o de la agencia del tenant logueado.
 * Solo toca las columnas pasadas explícitamente (todas opcionales) para no
 * pisar el resto de la fila en yamas_inmo_clientes.
 */
export async function updateProfileAction(data: {
  contactoNombre?: string;
  ventasTel?: string;
  nombreEmpresa?: string;
  rubro?: string;
  descripcionNegocio?: string;
  publicoObjetivo?: string;
  tonoComunicacion?: string;
  zonaCobertura?: string;
  diferenciales?: string;
  reglasEvitar?: string;
}): Promise<ProfileActionResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "No hay sesión activa." };
  }

  const updatePayload: Record<string, string> = {};
  if (data.contactoNombre !== undefined) {
    const trimmed = data.contactoNombre.trim();
    if (!trimmed) return { error: "El nombre no puede estar vacío." };
    updatePayload.contacto_nombre = trimmed;
  }
  if (data.ventasTel !== undefined) {
    updatePayload.ventas_tel = data.ventasTel.trim();
  }
  if (data.nombreEmpresa !== undefined) {
    updatePayload.nombre_empresa = data.nombreEmpresa.trim();
  }
  if (data.rubro !== undefined) {
    updatePayload.rubro = data.rubro.trim();
  }
  if (data.descripcionNegocio !== undefined) {
    updatePayload.descripcion_negocio = data.descripcionNegocio.trim();
  }
  if (data.publicoObjetivo !== undefined) {
    updatePayload.publico_objetivo = data.publicoObjetivo.trim();
  }
  if (data.tonoComunicacion !== undefined) {
    updatePayload.tono_comunicacion = data.tonoComunicacion.trim();
  }
  if (data.zonaCobertura !== undefined) {
    updatePayload.zona_cobertura = data.zonaCobertura.trim();
  }
  if (data.diferenciales !== undefined) {
    updatePayload.diferenciales = data.diferenciales.trim();
  }
  if (data.reglasEvitar !== undefined) {
    updatePayload.reglas_evitar = data.reglasEvitar.trim();
  }

  if (Object.keys(updatePayload).length === 0) {
    return { error: null };
  }

  const { error } = await supabase
    .from("yamas_inmo_clientes")
    .update(updatePayload)
    .eq("auth_user_id", user.id);

  if (error) {
    console.error("updateProfileAction error:", error);
    return { error: "No se pudieron guardar los cambios. Probá de nuevo." };
  }

  return { error: null };
}

/**
 * Cambia la contraseña del usuario logueado.
 * Antes de aplicar el cambio, revalida la contraseña actual haciendo un
 * signInWithPassword: si no es correcta, no se llega a llamar updateUser.
 */
export async function changePasswordAction(data: {
  currentPassword: string;
  newPassword: string;
}): Promise<ProfileActionResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !user.email) {
    return { error: "No hay sesión activa." };
  }

  if (data.newPassword.length < 8) {
    return { error: "La nueva contraseña debe tener al menos 8 caracteres." };
  }

  // Revalidación: si la contraseña actual es incorrecta, signInWithPassword
  // devuelve error y no seguimos.
  const { error: reauthError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: data.currentPassword,
  });

  if (reauthError) {
    return { error: "La contraseña actual es incorrecta." };
  }

  const { error: updateError } = await supabase.auth.updateUser({
    password: data.newPassword,
  });

  if (updateError) {
    console.error("changePasswordAction error:", updateError);
    return {
      error: "No se pudo actualizar la contraseña. Probá de nuevo.",
    };
  }

  return { error: null };
}
