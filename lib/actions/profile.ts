"use server";

import { createClient } from "@/lib/supabase/server";

export interface ProfileActionResult {
  error: string | null;
}

/**
 * Actualiza el perfil personal (nombre, WhatsApp) del tenant logueado.
 *
 * Solo aplica a cuentas individuales y empleados: ambas tienen fila en
 * yamas_inmo_clientes. Una cuenta empresa no la tiene —no tiene WhatsApp, es
 * una consola de gestión— y usa updateEmpresaPerfilAction en su lugar.
 */
export async function updateProfileAction(data: {
  contactoNombre?: string;
  ventasTel?: string;
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
 * Actualiza el perfil personal de una cuenta EMPRESA: solo el nombre de
 * contacto, no hay WhatsApp que editar.
 */
export async function updateEmpresaPerfilAction(
  nombre: string,
): Promise<ProfileActionResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    "yamas_send_empresa_actualizar_perfil",
    { p_nombre: nombre },
  );

  if (error) return { error: "No se pudieron guardar los cambios." };

  const r = data as { ok?: boolean; error?: string } | null;
  if (r?.ok) return { error: null };

  const ERRORES: Record<string, string> = {
    sin_permiso: "No tenés permiso para editar este perfil.",
    nombre_invalido: "El nombre no puede estar vacío.",
  };
  return { error: ERRORES[r?.error ?? ""] ?? "No se pudieron guardar los cambios." };
}

/**
 * Datos de negocio ("Datos de la empresa" en Mi Perfil) para los tres casos:
 * empresa (editable), empleado con organización (heredado, solo lectura) e
 * individual (propio, editable). yamas_send_mi_perfil_datos_negocio() decide
 * cuál de las tres fuentes leer y devuelve `editable` para que el modal no
 * tenga que rederivar esa lógica de roles.
 */
export interface DatosNegocio {
  editable: boolean;
  nombreEmpresa: string;
  rubro: string;
  descripcionNegocio: string;
  publicoObjetivo: string;
  tonoComunicacion: string;
  zonaCobertura: string;
  diferenciales: string;
  reglasEvitar: string;
}

export async function getDatosNegocioAction(): Promise<DatosNegocio | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    "yamas_send_mi_perfil_datos_negocio",
  );
  if (error || !data) return null;

  const r = data as Record<string, string | boolean | null>;
  return {
    editable: r.editable === true,
    nombreEmpresa: (r.nombreEmpresa as string) ?? "",
    rubro: (r.rubro as string) ?? "",
    descripcionNegocio: (r.descripcionNegocio as string) ?? "",
    publicoObjetivo: (r.publicoObjetivo as string) ?? "",
    tonoComunicacion: (r.tonoComunicacion as string) ?? "",
    zonaCobertura: (r.zonaCobertura as string) ?? "",
    diferenciales: (r.diferenciales as string) ?? "",
    reglasEvitar: (r.reglasEvitar as string) ?? "",
  };
}

/**
 * Guarda los datos de negocio. Escribe en un lugar distinto según quién
 * llama —la propia fila de yamas_inmo_clientes para individual, la
 * organización para empresa—, pero eso lo decide el servidor: acá solo se
 * elige la RPC según si hay organización o no, nunca se asume el destino.
 */
export async function actualizarDatosNegocioAction(
  data: Omit<DatosNegocio, "editable">,
  tieneOrganizacion: boolean,
): Promise<ProfileActionResult> {
  const supabase = await createClient();

  if (tieneOrganizacion) {
    const { data: res, error } = await supabase.rpc(
      "yamas_send_empresa_actualizar_datos_negocio",
      {
        p_nombre_empresa: data.nombreEmpresa,
        p_rubro: data.rubro,
        p_descripcion_negocio: data.descripcionNegocio,
        p_publico_objetivo: data.publicoObjetivo,
        p_tono_comunicacion: data.tonoComunicacion,
        p_zona_cobertura: data.zonaCobertura,
        p_diferenciales: data.diferenciales,
        p_reglas_evitar: data.reglasEvitar,
      },
    );
    if (error) return { error: "No se pudieron guardar los cambios." };
    const r = res as { ok?: boolean; error?: string } | null;
    if (r?.ok) return { error: null };
    return {
      error:
        r?.error === "sin_permiso"
          ? "No tenés permiso para editar estos datos."
          : "No se pudieron guardar los cambios.",
    };
  }

  // Sin organización: cuenta individual, se guarda en su propia fila. Mismo
  // camino que ya usaba updateProfileAction antes de separar esta sección.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "No hay sesión activa." };

  const { error } = await supabase
    .from("yamas_inmo_clientes")
    .update({
      nombre_empresa: data.nombreEmpresa.trim(),
      rubro: data.rubro.trim(),
      descripcion_negocio: data.descripcionNegocio.trim(),
      publico_objetivo: data.publicoObjetivo.trim(),
      tono_comunicacion: data.tonoComunicacion.trim(),
      zona_cobertura: data.zonaCobertura.trim(),
      diferenciales: data.diferenciales.trim(),
      reglas_evitar: data.reglasEvitar.trim(),
    })
    .eq("auth_user_id", user.id);

  if (error) {
    console.error("actualizarDatosNegocioAction error:", error);
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
