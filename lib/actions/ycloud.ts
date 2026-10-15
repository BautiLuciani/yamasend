"use server";

import { createClient } from "@/lib/supabase/server";
import { assertPermiso } from "@/lib/auth/permisos";

/**
 * Conexión de WhatsApp por YCloud (coexistencia).
 *
 * La API key de YCloud la pega la persona en Mi perfil → WhatsApp. Se verifica
 * contra YCloud antes de guardarla: tiene que ser válida y tiene que incluir el
 * número de la cuenta. Se guarda solo en la fila propia de yamas_inmo_clientes
 * (la policy update_own_tenant lo exige) y NUNCA vuelve al navegador: lo único
 * que se devuelve es si está configurada y sus últimos 4 caracteres.
 *
 * Empleados de una empresa: la conexión la administra la empresa, no se edita
 * desde acá.
 */

const YCLOUD_PHONES_URL = "https://api.ycloud.com/v2/whatsapp/phoneNumbers?limit=100";

export interface ConexionYcloud {
  configurada: boolean;
  /** Últimos 4 caracteres de la clave, para reconocerla sin mostrarla. */
  ultimos4: string | null;
  telefono: string | null;
  wabaid: string | null;
  /** true si la administra una empresa (el empleado no la edita). */
  administradaPorEmpresa: boolean;
  puedeEditar: boolean;
  error: string | null;
}

const soloDigitos = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");

export async function getConexionYcloudAction(): Promise<ConexionYcloud> {
  const vacio = (error: string | null): ConexionYcloud => ({
    configurada: false,
    ultimos4: null,
    telefono: null,
    wabaid: null,
    administradaPorEmpresa: false,
    puedeEditar: false,
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
    .select("ycloud_api, wabaid, ventas_tel")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (error) return vacio("No se pudo leer la conexión de WhatsApp.");

  const clave = (data?.ycloud_api as string | null) ?? "";
  const empresa = Boolean(gate.membership?.orgId);
  return {
    configurada: clave.length > 0,
    ultimos4: clave.length >= 4 ? clave.slice(-4) : null,
    telefono: (data?.ventas_tel as string | null) ?? null,
    wabaid: (data?.wabaid as string | null) ?? null,
    administradaPorEmpresa: empresa,
    puedeEditar: !empresa,
    error: null,
  };
}

interface FilaTelefonoYcloud {
  phoneNumber?: string;
  displayPhoneNumber?: string;
  wabaId?: string;
  status?: string;
}

export async function guardarYcloudApiAction(
  apiKey: string,
): Promise<{ ok: boolean; telefono: string | null; wabaid: string | null; error: string | null }> {
  const falla = (error: string) => ({ ok: false, telefono: null, wabaid: null, error });

  const gate = await assertPermiso("importar_contactos");
  if (!gate.ok) return falla(gate.error ?? "No tenés permiso para configurar WhatsApp.");
  if (gate.membership?.orgId) return falla("La conexión de WhatsApp la administra tu empresa.");

  const clave = String(apiKey ?? "").trim();
  if (clave.length < 16 || /\s/.test(clave)) return falla("La clave no tiene el formato de una API key de YCloud.");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return falla("No hay sesión activa.");

  const { data: cliente } = await supabase
    .from("yamas_inmo_clientes")
    .select("tenant_id, ventas_tel, wabaid")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!cliente?.tenant_id) return falla("No se pudo resolver tu cuenta.");

  // 1) La clave tiene que ser válida: se prueba listando los números.
  let items: FilaTelefonoYcloud[] = [];
  try {
    const res = await fetch(YCLOUD_PHONES_URL, {
      headers: { "X-API-Key": clave, Accept: "application/json" },
      cache: "no-store",
    });
    if (res.status === 401 || res.status === 403) return falla("YCloud rechazó la clave. Revisá que esté completa.");
    if (!res.ok) return falla("YCloud no respondió bien. Probá de nuevo en un rato.");
    const json = (await res.json()) as { items?: FilaTelefonoYcloud[] };
    items = json.items ?? [];
  } catch {
    return falla("No se pudo conectar con YCloud. Probá de nuevo.");
  }

  // 2) Tiene que incluir el número de la cuenta.
  const mio = soloDigitos(cliente.ventas_tel as string | null);
  const numero = items.find((i) => soloDigitos(i.phoneNumber ?? i.displayPhoneNumber) === mio);
  if (!numero?.wabaId) {
    return falla(
      mio
        ? `La clave es válida, pero no incluye tu número (${mio}). Revisá que sea la API key de la cuenta correcta.`
        : "La clave es válida, pero tu cuenta no tiene un número de WhatsApp asociado todavía.",
    );
  }

  // 3) Se guarda en la fila propia (RLS: auth_user_id = auth.uid()).
  const { error } = await supabase
    .from("yamas_inmo_clientes")
    .update({ ycloud_api: clave, wabaid: numero.wabaId })
    .eq("auth_user_id", user.id);
  if (error) return falla("No se pudo guardar la clave. Probá de nuevo.");

  return { ok: true, telefono: numero.displayPhoneNumber ?? numero.phoneNumber ?? null, wabaid: numero.wabaId, error: null };
}
