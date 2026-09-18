import { redirect } from "next/navigation";
import { getCurrentMembership } from "@/lib/auth/permisos";
import { leerEstadoFixtureP5Action } from "@/lib/actions/motor-p5";
import MotorP5AutorizacionForm from "./MotorP5AutorizacionForm";

/**
 * TEMPORAL — PRODUCT-P5-D.4.
 *
 * Página de un solo propósito: dejar que Bautista, con su sesión real,
 * ejecute la autorización económica humana sobre el execution_intent YCloud
 * del fixture TEST_P5_REAL_SEND. No es una herramienta genérica — no acepta
 * ningún ID desde el navegador, no elige tenant/provider/draft: todo eso
 * está fijo en lib/actions/motor-p5.ts y en la RPC
 * public.motor_p5_estado_fixture().
 *
 * Esta página NO envía WhatsApp. Autoriza y reserva 1 crédito, nada más.
 *
 * DECISIÓN PENDIENTE (post-P5): eliminar esta página, o quitarla del build,
 * una vez cerrado el primer envío controlado. No se toma esa decisión acá.
 *
 * Mismo guard de sesión que el resto de /panel: se resuelve la membresía
 * en el servidor antes de renderizar nada, y se redirige a /login si no
 * hay sesión.
 */
export default async function MotorP5AutorizacionPage() {
  const membership = await getCurrentMembership();

  if (!membership) {
    redirect("/login");
  }

  // Lectura server-side, sin side effects. El form recibe esto como estado
  // inicial y solo vuelve a llamar a la Server Action de lectura después de
  // una acción humana explícita (nunca al montar).
  const estadoInicial = await leerEstadoFixtureP5Action();

  return (
    <div className="min-h-screen flex items-center justify-center px-5 bg-ys-bg">
      <div className="w-full max-w-[520px] bg-white border border-ys-border rounded-2xl px-6 py-8 flex flex-col gap-5">
        <div className="flex flex-col gap-1.5">
          <div className="text-[17px] font-extrabold text-ys-text leading-[1.3]">
            Prueba real P5 — Autorización económica
          </div>
          <div className="text-[13px] text-ys-muted font-medium leading-[1.5]">
            Esta acción autoriza y reserva 1 crédito para el fixture de prueba
            controlado. NO envía todavía el WhatsApp.
          </div>
        </div>

        <MotorP5AutorizacionForm estadoInicial={estadoInicial} />
      </div>
    </div>
  );
}
