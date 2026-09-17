import { redirect } from "next/navigation";
import { getCurrentMembership } from "@/lib/auth/permisos";
import MotorDiagnosticoForm from "./MotorDiagnosticoForm";

/**
 * DIAGNOSTIC_ONLY=true
 *
 * Página exclusivamente diagnóstica para cerrar el E2E técnico de Motor V1
 * (FINAL-4 R3). No integra Motor V1 al flujo productivo: solo expone, de
 * forma manual y con confirmación humana explícita, el primer paso que el
 * propio contrato SQL exige antes de poder reservar créditos para una
 * ejecución de Motor V1 — congelar quién autoriza el gasto.
 *
 * POST_R3_DECISION_REQUIRED=true: una vez cerrado el E2E, decidir si esta
 * página se elimina, se mantiene como herramienta interna protegida, o se
 * reemplaza por integración productiva real. No se toma esa decisión acá.
 *
 * El guard de sesión sigue el mismo patrón que app/panel/page.tsx: se
 * resuelve la membresía en el servidor antes de renderizar nada, y se
 * redirige a /login si no hay sesión. No se inventa un mecanismo de auth
 * nuevo.
 */
export default async function MotorDiagnosticoPage() {
  const membership = await getCurrentMembership();

  if (!membership) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-5 bg-ys-bg">
      <div className="w-full max-w-[480px] bg-white border border-ys-border rounded-2xl px-6 py-8 flex flex-col gap-5">
        <div className="flex flex-col gap-1.5">
          <div className="text-[17px] font-extrabold text-ys-text leading-[1.3]">
            Motor V1 — Diagnóstico E2E
          </div>
          <div className="text-[13px] text-ys-muted font-medium leading-[1.5]">
            Esta acción únicamente registra la autorización económica del
            Intent. No reserva créditos, no crea jobs y no envía mensajes.
          </div>
        </div>

        <MotorDiagnosticoForm />
      </div>
    </div>
  );
}
