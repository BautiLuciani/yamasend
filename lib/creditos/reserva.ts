import { createClient } from "@/lib/supabase/server";

/**
 * Reserva de créditos para campañas.
 *
 * Reemplaza al viejo "leer el saldo y después enviar", que tenía tres
 * problemas:
 *
 *   1. Carrera entre envíos simultáneos — dos campañas lanzadas al mismo
 *      tiempo leían el mismo saldo y las dos pasaban el chequeo.
 *   2. Campañas programadas — el scheduler de n8n llama al webhook de envío
 *      directamente, sin pasar nunca por sendCampaignAction, así que una
 *      campaña programada se enviaba sin mirar el saldo.
 *   3. Fallaba abierto — si la consulta de saldo se rompía, dejaba pasar el
 *      envío igual.
 *
 * Ahora los créditos se apartan en el momento de programar o enviar, dentro de
 * una única transacción de Postgres con lock. El scheduler ya no necesita
 * validar nada porque los créditos están comprometidos desde antes, y la
 * devolución de lo no usado la hace un trigger cuando la campaña termina.
 *
 * Este módulo NO es un server action a propósito: no lleva "use server" y solo
 * lo importan otros módulos del servidor. Si fuera invocable desde el cliente,
 * alguien podría reservarse su propio saldo a mano para nada.
 */

export interface ReservaResult {
  ok: boolean;
  error: string | null;
  /** Créditos disponibles después de la operación. null si la cuenta no tiene cupo. */
  disponible: number | null;
}

interface RpcReserva {
  ok?: boolean;
  error?: string;
  aplica?: boolean;
  disponible?: number;
  necesarios?: number;
  reservados?: number;
}

/**
 * Fail-closed: cualquier respuesta que no sea un ok explícito bloquea el
 * envío. Es la decisión opuesta a la anterior y es deliberada — antes esto
 * ordenaba mensajes internos de una empresa, ahora ordena algo que la gente
 * paga. Ante la duda, no gastar.
 */
const ERROR_INDETERMINADO =
  "No pudimos verificar tus créditos en este momento. Probá de nuevo en unos segundos.";

/**
 * Aparta `cantidad` créditos para una campaña. Es idempotente por campaña: si
 * la campaña ya tenía una reserva, ajusta la diferencia en vez de sumar otra
 * vez, así reprogramar o cambiarle la audiencia no duplica el apartado.
 *
 * Pasar cantidad 0 libera lo que la campaña tuviera reservado.
 *
 * @param tieneEmpresa cambia el texto del error: a un empleado hay que
 *        mandarlo a pedirle créditos a su empresa, a un independiente a
 *        comprarlos.
 */
export async function reservarCreditosCampana(
  campanaId: string,
  cantidad: number,
  tieneEmpresa: boolean,
): Promise<ReservaResult> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("yamas_send_reservar_creditos", {
    p_campana_id: campanaId,
    p_cantidad: cantidad,
  });

  if (error || data === null || data === undefined) {
    return { ok: false, error: ERROR_INDETERMINADO, disponible: null };
  }

  const r = data as RpcReserva;

  if (r.ok) {
    return { ok: true, error: null, disponible: r.disponible ?? null };
  }

  if (r.error === "saldo_insuficiente") {
    const disponible = r.disponible ?? 0;
    const necesarios = r.necesarios ?? cantidad;
    const dondeConseguir = tieneEmpresa
      ? "Pedile más créditos a tu empresa o achicá la audiencia."
      : "Comprá más créditos o achicá la audiencia.";

    return {
      ok: false,
      disponible,
      error:
        disponible === 0
          ? `No te quedan créditos disponibles y esta campaña necesita ${necesarios}. ${dondeConseguir}`
          : `Te quedan ${disponible} créditos disponibles y esta campaña necesita ${necesarios}. ${dondeConseguir}`,
    };
  }

  const MENSAJES: Record<string, string> = {
    sin_sesion: "No hay sesión activa.",
    sin_membresia: "Tu cuenta todavía no está configurada.",
    campana_no_encontrada: "No encontré esa campaña.",
    cantidad_invalida: "La cantidad de destinatarios no es válida.",
  };

  return {
    ok: false,
    disponible: null,
    error: MENSAJES[r.error ?? ""] ?? ERROR_INDETERMINADO,
  };
}

/**
 * Cuántos créditos le corresponde tener apartados a una campaña según su
 * estado. Solo las campañas comprometidas (programadas o saliendo) retienen
 * cupo; un borrador no debe bloquearle créditos a nadie, porque puede quedar
 * ahí para siempre sin enviarse nunca.
 */
export function reservaSegunEstado(
  status: string,
  contactosCount: number,
): number {
  const s = (status ?? "").toLowerCase();
  return s === "programada" || s === "enviando" ? contactosCount : 0;
}
