"use server";

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
