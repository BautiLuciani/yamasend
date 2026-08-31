"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentMembership } from "@/lib/auth/permisos";

/**
 * Estado de la membresía del usuario logueado.
 *
 * La usa PendingApprovalScreen (client component) para darse cuenta sola de
 * que la empresa ya la aceptó, sin que la persona tenga que refrescar a mano.
 * Se resolvió con un sondeo liviano y no con Realtime a propósito: activar
 * Realtime sobre yamas_send_miembros obliga a exponer esa tabla en la
 * publicación y a sumarle una policy pensada para replicación, y es la tabla
 * de permisos. Una consulta cada 10 segundos, solo mientras esta pantalla
 * está abierta, es muchísima menos superficie por el mismo resultado.
 *
 * Vive en su propio archivo y no en lib/actions/user.ts a propósito: user.ts
 * también exporta funciones que devuelven datos de contactos y arrastran más
 * imports de los necesarios. Un client component que solo necesita este
 * sondeo no debería tirar de todo ese árbol al bundle del navegador.
 */
export async function getMiEstadoMembresiaAction(): Promise<
  "pendiente" | "activo" | "suspendido" | null
> {
  const membership = await getCurrentMembership();
  return membership?.estado ?? null;
}


/**
 * Suma la cuenta YA EXISTENTE del usuario logueado a la organización de una
 * invitación.
 *
 * Es el camino que faltaba: el link de invitación solo servía para registrarse
 * de cero, así que alguien que ya usaba YamaSend por su cuenta se quedaba sin
 * forma de aceptarlo. Todas las condiciones (que sea empleado, que no esté ya
 * en otra empresa, que la invitación sea de empleado) se validan dentro de
 * Postgres: acá solo se traducen los errores.
 */
export async function aceptarInvitacionExistenteAction(
  token: string,
): Promise<{ ok: boolean; error: string | null; estado: string | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    "yamas_send_aceptar_invitacion_existente",
    { p_token: token.trim() },
  );

  if (error)
    return { ok: false, error: "No se pudo aceptar la invitación.", estado: null };

  const r = data as { ok?: boolean; error?: string; estado?: string } | null;
  if (r?.ok) return { ok: true, error: null, estado: r.estado ?? null };

  const ERRORES: Record<string, string> = {
    sin_sesion: "Tenés que iniciar sesión para aceptar la invitación.",
    sin_membresia: "Tu cuenta todavía no está configurada.",
    rol_incompatible:
      "Las cuentas de empresa no pueden sumarse a otra empresa como empleado.",
    ya_tiene_empresa:
      "Tu cuenta ya pertenece a una empresa. Pediles que te quiten del equipo antes de sumarte a otra.",
    cuenta_suspendida: "Tu cuenta está suspendida.",
    invitacion_invalida:
      "El link ya venció o fue revocado. Pedile uno nuevo a la empresa.",
    invitacion_de_empresa:
      "Ese link es para crear una cuenta de empresa nueva, no para sumar la tuya a un equipo.",
  };

  return {
    ok: false,
    error: ERRORES[r?.error ?? ""] ?? "No se pudo aceptar la invitación.",
    estado: null,
  };
}
