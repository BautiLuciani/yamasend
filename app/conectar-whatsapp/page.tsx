import { redirect } from "next/navigation";
import { getCurrentMembership } from "@/lib/auth/permisos";
import { getEstadoConexionWhatsapp } from "@/lib/actions/auth";
import ConectarWhatsappScreen from "@/components/yamasend/ConectarWhatsappScreen";

export default async function ConectarWhatsappPage() {
  // Ya tiene membresía (empresa, o ya conectó en otra pestaña) → no tiene
  // nada que hacer acá.
  const membership = await getCurrentMembership();
  if (membership) redirect("/panel");

  const estado = await getEstadoConexionWhatsapp();

  // Sin conexión pendiente y sin membresía: no pasó por el registro
  // (llegó acá directo con la URL, por ejemplo). Que arranque de cero.
  if (estado.status === "sin_conexion") redirect("/register");

  // status "confirmed" pero sin membresía todavía es una carrera rarísima
  // (el webhook confirmó hace un instante y el usuario refrescó antes de que
  // se creara la membresía) — el polling del cliente ya maneja este caso.

  return <ConectarWhatsappScreen linkInicial={estado.onboardingLink} />;
}
