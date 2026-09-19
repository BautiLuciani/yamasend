import { redirect } from "next/navigation";
import { assertPermiso } from "@/lib/auth/permisos";
import MotorRecomendaciones from "@/components/yamasend/MotorRecomendaciones";

/**
 * AI-MOTOR-1.9 — superficie PRODUCTIVA de revisión humana del Motor.
 *
 * Separada a propósito de /panel/motor-diagnostico (que sigue existiendo,
 * sin cambios, como herramienta interna de certificación manual). Esta
 * ruta es el destino real del handoff del chat: no recibe ningún dato del
 * chat ni de ningún cliente — ni planId, ni candidatos, ni tenantId. Todo
 * lo que MotorRecomendaciones necesita lo resuelve por su cuenta,
 * server-side, en cada Server Action que ya existía (prepararPlanMotorAction,
 * aprobarPlanMotorAction, etc. — ninguna de esas cambió en esta fase).
 *
 * Guard fail-closed con el permiso dedicado "ver_motor" (assertPermiso ya
 * cubre, en un solo chequeo: sin sesión, membresía pendiente/suspendida,
 * rol "empresa" de solo lectura, y permiso en false). Cualquiera de esos
 * casos redirige a /login sin renderizar nada del Motor — igual que el
 * resto de la app, nunca se acepta ningún dato de autorización del cliente.
 */
export default async function MotorPage() {
  const gate = await assertPermiso("ver_motor");

  if (!gate.ok) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-ys-bg px-5 py-10 flex items-start justify-center">
      <div className="w-full max-w-[560px]">
        <MotorRecomendaciones />
      </div>
    </div>
  );
}
