"use server";

import { createClient } from "@/lib/supabase/server";
import { assertPermiso } from "@/lib/auth/permisos";
import { hayClaveYcloudGlobal } from "@/lib/ycloud/clave";

/**
 * Estado de la conexión de WhatsApp (YCloud, coexistencia) de la cuenta.
 *
 * Solo lectura. La API key de YCloud es única para toda la plataforma y vive
 * en las variables de entorno del servidor (YCLOUD_API_KEY): ningún usuario la
 * carga ni la ve, y esta acción nunca la devuelve. Lo único que expone es si
 * la cuenta quedó lista para enviar: número y WABA cargados + clave de
 * plataforma presente.
 */

export interface ConexionYcloud {
  /** Número, WABA y clave de plataforma presentes: se puede enviar. */
  lista: boolean;
  /** Falta cargar la clave única en el servidor (lo resuelve el administrador). */
  falta: "clave_plataforma" | "numero" | "waba" | null;
  telefono: string | null;
  wabaid: string | null;
  /** Con qué cuenta se está entrando. */
  cuenta: { tenantId: string | null; email: string | null };
  error: string | null;
}

export async function getConexionYcloudAction(): Promise<ConexionYcloud> {
  const vacio = (error: string | null): ConexionYcloud => ({
    lista: false,
    falta: null,
    telefono: null,
    wabaid: null,
    cuenta: { tenantId: null, email: null },
    error,
  });

  const gate = await assertPermiso("importar_contactos");
  if (!gate.ok) return vacio(null);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return vacio(null);

  const { data, error } = await supabase
    .from("yamas_inmo_clientes")
    .select("tenant_id, wabaid, ventas_tel")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (error) return vacio("No se pudo leer la conexión de WhatsApp.");

  const telefono = (data?.ventas_tel as string | null) ?? null;
  const wabaid = (data?.wabaid as string | null) ?? null;
  const falta = !telefono ? "numero" : !wabaid ? "waba" : !hayClaveYcloudGlobal() ? "clave_plataforma" : null;

  return {
    lista: falta === null,
    falta,
    telefono,
    wabaid,
    cuenta: { tenantId: (data?.tenant_id as string | null) ?? null, email: user.email ?? null },
    error: null,
  };
}
