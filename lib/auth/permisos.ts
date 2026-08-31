import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import {
  PERMISOS_COMPLETOS,
  PERMISO_KEYS,
  type MemberEstado,
  type Membership,
  type PermisoKey,
  type Permisos,
  type UserRole,
} from "@/lib/types";

/**
 * Capa de autorización de YamaSend.
 *
 * La regla de oro: la UI esconde botones, pero el gate REAL está acá. Todo
 * server action que muta algo tiene que empezar llamando a assertPermiso().
 * Un permiso que solo se aplica en el cliente no es un permiso, es una
 * sugerencia — cualquiera puede invocar un server action directamente.
 *
 * La defensa es en tres capas:
 *   1. RLS en Postgres  → qué filas puede VER cada rol
 *   2. assertPermiso()  → qué puede HACER (este archivo)
 *   3. UI               → qué ve en pantalla (cosmético)
 */

/** Normaliza el jsonb de permisos que viene de la DB a un objeto tipado. */
function normalizarPermisos(raw: unknown): Permisos {
  const base = { ...PERMISOS_COMPLETOS };
  if (!raw || typeof raw !== "object") return base;

  const obj = raw as Record<string, unknown>;
  for (const key of PERMISO_KEYS) {
    // Fail-closed: cualquier valor que no sea exactamente true cuenta como false.
    base[key] = obj[key] === true;
  }
  return base;
}

/**
 * Resuelve la membresía del usuario logueado.
 *
 * Auto-sanación: si el usuario tiene fila en yamas_inmo_clientes pero todavía
 * no tiene membresía (cuentas anteriores al sistema de roles), se le crea una
 * de empleado independiente con permisos completos. Sin esto, desplegar roles
 * dejaría afuera a todas las cuentas existentes.
 *
 * Envuelta en cache() de React: /panel la llama, y después getCurrentAppUser()
 * y getCurrentEmpresaUser() la vuelven a llamar. Sin memoización serían 3
 * round trips a la DB por request para resolver siempre lo mismo.
 */
export const getCurrentMembership = cache(
  async function getCurrentMembership(): Promise<Membership | null> {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return null;

    const leer = async () =>
      supabase
        .from("yamas_send_miembros")
        .select(
          "id, org_id, tenant_id, rol, estado, permisos, creditos_asignados, creditos_usados, nombre_display",
        )
        .eq("auth_user_id", user.id)
        .maybeSingle();

    let { data: row } = await leer();

    if (!row) {
      // ¿Es una cuenta vieja de empleado? Si tiene tenant, le damos membresía.
      const { data: cliente } = await supabase
        .from("yamas_inmo_clientes")
        .select("tenant_id, contacto_nombre")
        .eq("auth_user_id", user.id)
        .maybeSingle();

      if (!cliente?.tenant_id) return null;

      // La RPC decide el rol internamente (siempre "empleado"): nunca se lo
      // mandamos como parámetro, porque el cliente no debe poder elegir rol.
      await supabase.rpc("yamas_send_registrar_miembro", {
        p_tenant_id: cliente.tenant_id,
        p_nombre: cliente.contacto_nombre ?? null,
        p_invite_token: null,
      });

      ({ data: row } = await leer());
      if (!row) return null;
    }

    // El nombre de la organización se pide aparte: la mayoría de los usuarios
    // no tiene org y no vale la pena pagar un join en cada request.
    let orgNombre: string | null = null;
    if (row.org_id) {
      const { data: org } = await supabase
        .from("yamas_send_organizaciones")
        .select("nombre")
        .eq("id", row.org_id)
        .maybeSingle();
      orgNombre = org?.nombre ?? null;
    }

    return {
      miembroId: row.id,
      nombreDisplay: row.nombre_display ?? null,
      orgId: row.org_id ?? null,
      orgNombre,
      tenantId: row.tenant_id ?? null,
      rol: row.rol as UserRole,
      estado: row.estado as MemberEstado,
      permisos: normalizarPermisos(row.permisos),
      creditosAsignados: row.creditos_asignados ?? 0,
      creditosUsados: row.creditos_usados ?? 0,
    };
  },
);

export interface PermisoCheck {
  ok: boolean;
  /** Mensaje listo para mostrarle al usuario. null si ok === true. */
  error: string | null;
  /** tenant_id resuelto server-side. Nunca se acepta del cliente. */
  tenantId: string | null;
  membership: Membership | null;
}

const MENSAJES: Record<PermisoKey, string> = {
  crear_audiencias: "crear audiencias",
  importar_contactos: "importar contactos",
  crear_templates: "crear templates",
  enviar_templates_meta: "enviar templates a aprobación",
  crear_campanas: "crear campañas",
  enviar_campanas: "enviar campañas",
  comprar_creditos: "comprar créditos",
  usar_ia: "usar el asistente de IA",
};

/**
 * Gate de permisos para server actions. Devuelve el tenant_id ya resuelto,
 * así el action no tiene que volver a buscarlo (y no puede olvidarse).
 *
 * Fail-closed en todos los caminos: sin sesión, sin membresía, miembro no
 * activo, o rol empresa (que es de solo lectura por diseño) → deniega.
 */
export async function assertPermiso(
  permiso: PermisoKey,
): Promise<PermisoCheck> {
  const membership = await getCurrentMembership();

  if (!membership) {
    return {
      ok: false,
      error: "No hay sesión activa.",
      tenantId: null,
      membership: null,
    };
  }

  if (membership.estado === "pendiente") {
    return {
      ok: false,
      error: membership.orgNombre
        ? `Tu cuenta todavía está esperando la aprobación de ${membership.orgNombre}.`
        : "Tu cuenta todavía está esperando aprobación.",
      tenantId: null,
      membership,
    };
  }

  if (membership.estado === "suspendido") {
    return {
      ok: false,
      error: "Tu cuenta está suspendida. Contactá al administrador.",
      tenantId: null,
      membership,
    };
  }

  // La empresa es informativa y no escribe nunca sobre los recursos de sus
  // empleados, sin importar qué diga su jsonb de permisos.
  if (membership.rol === "empresa") {
    return {
      ok: false,
      error:
        "Las cuentas de empresa son de solo lectura: no pueden crear ni enviar recursos.",
      tenantId: null,
      membership,
    };
  }

  if (!membership.permisos[permiso]) {
    return {
      ok: false,
      error: membership.orgNombre
        ? `No tenés permiso para ${MENSAJES[permiso]}. Pedíselo a ${membership.orgNombre}.`
        : `No tenés permiso para ${MENSAJES[permiso]}.`,
      tenantId: null,
      membership,
    };
  }

  if (!membership.tenantId) {
    return {
      ok: false,
      error: "No se pudo resolver el tenant del usuario.",
      tenantId: null,
      membership,
    };
  }

  return {
    ok: true,
    error: null,
    tenantId: membership.tenantId,
    membership,
  };
}
