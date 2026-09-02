"use server";

import { createClient } from "@/lib/supabase/server";
import type { Producto } from "@/lib/types";

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
  productos: Producto[];
}

export async function getDatosNegocioAction(): Promise<DatosNegocio | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    "yamas_send_mi_perfil_datos_negocio",
  );
  if (error || !data) return null;

  const r = data as Record<string, string | boolean | Producto[] | null>;
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
    productos: Array.isArray(r.productos) ? (r.productos as Producto[]) : [],
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
        p_productos: data.productos,
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
      productos: data.productos,
    })
    .eq("auth_user_id", user.id);

  if (error) {
    console.error("actualizarDatosNegocioAction error:", error);
    return { error: "No se pudieron guardar los cambios. Probá de nuevo." };
  }
  return { error: null };
}

// Webhook del workflow "YamaSend — Analizar Catálogo de Productos con IA"
// en n8n. Recibe { fileBase64, fileName, mimeType } y devuelve
// { ok, productos, error }. El workflow clasifica el archivo por tipo,
// extrae su contenido (texto de PDF, filas de planilla, o visión para
// imágenes) y normaliza todo a la misma lista de productos.
const CATALOGO_IA_WEBHOOK_URL =
  "https://yamasai.app.n8n.cloud/webhook/yamasend-analizar-catalogo";

/** Tope de tamaño del archivo subido. Igual al límite del bucket de Storage. */
const CATALOGO_MAX_BYTES = 15 * 1024 * 1024;

export interface AnalizarCatalogoResult {
  productos: Producto[];
  error: string | null;
}

/**
 * Analiza un archivo de catálogo (PDF, Excel/CSV o imagen) y devuelve los
 * productos que encontró, para prellenar el campo "Productos" de Datos de
 * la empresa.
 *
 * NO guarda los productos: solo los propone. El usuario los revisa y
 * corrige en la UI, y recién al tocar "Guardar" se persisten vía
 * actualizarDatosNegocioAction. Eso es a propósito — la extracción por IA
 * puede equivocarse (sobre todo leyendo imágenes) y sobrescribir el
 * catálogo del usuario sin que lo vea sería destructivo.
 *
 * El archivo original sí se guarda en el bucket privado
 * catalogos-productos, particionado por usuario, para poder reprocesarlo
 * después sin pedirle a la persona que lo vuelva a subir.
 */
export async function analizarCatalogoProductosAction(
  fileBase64: string,
  fileName: string,
  mimeType: string,
): Promise<AnalizarCatalogoResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { productos: [], error: "No hay sesión activa." };

  if (!fileBase64) {
    return { productos: [], error: "No se recibió el archivo. Probá de nuevo." };
  }

  // base64 infla ~4/3 respecto del binario: se estima el tamaño real antes
  // de mandar nada, para no subir 20MB a Storage y que rebote allá.
  const bytesAprox = Math.floor((fileBase64.length * 3) / 4);
  if (bytesAprox > CATALOGO_MAX_BYTES) {
    return { productos: [], error: "El archivo es muy grande (máximo 15 MB)." };
  }

  // Se guarda el original antes de analizarlo. Si falla el guardado no se
  // corta el flujo: el respaldo es un extra, y perderlo no justifica
  // negarle al usuario el análisis que vino a pedir.
  try {
    const binario = Buffer.from(fileBase64, "base64");
    const nombreLimpio = fileName.replace(/[^\w.\-]/g, "_").slice(-120);
    await supabase.storage
      .from("catalogos-productos")
      .upload(`${user.id}/${Date.now()}_${nombreLimpio}`, binario, {
        contentType: mimeType || "application/octet-stream",
        upsert: false,
      });
  } catch (e) {
    console.error("analizarCatalogoProductosAction storage error:", e);
  }

  try {
    const res = await fetch(CATALOGO_IA_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileBase64, fileName, mimeType }),
    });

    if (!res.ok) {
      return {
        productos: [],
        error: `El analizador de catálogos respondió con error (${res.status}).`,
      };
    }

    const data = (await res.json()) as {
      ok?: boolean;
      productos?: Producto[];
      error?: string | null;
    };

    if (!data.ok) {
      return {
        productos: [],
        error: data.error ?? "No se pudo analizar el archivo.",
      };
    }

    const productos = Array.isArray(data.productos) ? data.productos : [];
    if (!productos.length) {
      return {
        productos: [],
        error:
          "No se encontraron productos en el archivo. Revisá que sea una lista o catálogo, o cargalos a mano.",
      };
    }

    // Se normaliza acá y no se confía en la forma que devuelva el modelo:
    // un nombre faltante rompería la lista editable en la UI.
    return {
      productos: productos
        .filter((p) => p && typeof p.nombre === "string" && p.nombre.trim())
        .map((p) => ({
          nombre: String(p.nombre).trim(),
          precio: typeof p.precio === "string" ? p.precio.trim() : "",
          descripcion:
            typeof p.descripcion === "string" ? p.descripcion.trim() : "",
        })),
      error: null,
    };
  } catch (e) {
    console.error("analizarCatalogoProductosAction error:", e);
    return {
      productos: [],
      error: "No se pudo conectar con el analizador. Reintentá en unos segundos.",
    };
  }
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
