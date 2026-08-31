"use client";

import { useEffect } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { getMiEstadoMembresiaAction } from "@/lib/actions/membresia";

/**
 * Pantalla que ve un empleado que se registró con un link de invitación pero
 * todavía no fue aprobado por su empresa (flujo invitación + aprobación).
 *
 * Es una pared, no una vista degradada: no se le muestran datos ni acciones,
 * porque en este estado assertPermiso() le deniega absolutamente todo. Darle
 * una UI parcial solo generaría errores confusos al tocar cualquier cosa.
 */
export default function PendingApprovalScreen({
  nombreEmpresa,
  email,
  onLogout,
}: {
  nombreEmpresa: string | null;
  email: string;
  onLogout: () => void;
}) {
  const router = useRouter();

  // Sondeo hasta que la empresa apruebe. Sin esto la persona se queda mirando
  // una pantalla que nunca cambia y tiene que adivinar cuándo refrescar.
  //
  // router.refresh() vuelve a correr /panel en el servidor, que al ver la
  // membresía ya activa devuelve la app directamente: no hace falta redirigir
  // ni recargar la página entera.
  useEffect(() => {
    let vivo = true;

    async function revisar() {
      if (!vivo || document.visibilityState !== "visible") return;
      const estado = await getMiEstadoMembresiaAction();
      if (vivo && estado === "activo") router.refresh();
    }

    const id = setInterval(revisar, 10000);
    // Volver a la pestaña es la señal más común de "pasó un rato": conviene
    // chequear ahí también en vez de esperar al próximo tick.
    document.addEventListener("visibilitychange", revisar);

    return () => {
      vivo = false;
      clearInterval(id);
      document.removeEventListener("visibilitychange", revisar);
    };
  }, [router]);

  return (
    // fixed + overflow-y-auto y no min-h-screen: el body tiene overflow-hidden
    // para sostener el layout de la app, y con min-h-screen el contenido que no
    // entra queda cortado contra el borde en pantallas bajas.
    <div className="fixed inset-0 overflow-y-auto bg-ys-bg">
      <div className="min-h-full w-full flex items-center justify-center px-5 py-10">
        <div className="w-full max-w-[460px] flex flex-col items-center text-center gap-6">
          <Image
            src="/brand/logo-login.png"
            alt="YamaSend"
            width={190}
            height={76}
            className="w-[170px] h-auto object-contain"
            priority
          />

          <div className="w-full bg-ys-card border border-ys-border rounded-2xl p-7 sm:p-8 flex flex-col items-center gap-5 shadow-[0_12px_28px_rgba(16,24,20,0.08)]">
            <div className="w-14 h-14 rounded-full bg-ys-warn-bg flex items-center justify-center flex-shrink-0">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="9" stroke="#F79009" strokeWidth="1.8" />
                <path
                  d="M12 7.5V12l3 2"
                  stroke="#F79009"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>

            <div className="flex flex-col gap-2">
              <h1 className="text-[19px] sm:text-xl font-extrabold text-ys-text leading-snug">
                Tu cuenta está esperando aprobación
              </h1>
              <p className="text-[14px] text-ys-muted leading-relaxed">
                {nombreEmpresa ? (
                  <>
                    Ya te registraste correctamente. Falta que{" "}
                    <span className="font-bold text-ys-text">{nombreEmpresa}</span>{" "}
                    habilite tu cuenta para que puedas empezar a usar YamaSend.
                  </>
                ) : (
                  <>
                    Ya te registraste correctamente. Falta que tu empresa habilite
                    tu cuenta para que puedas empezar a usar YamaSend.
                  </>
                )}
              </p>
            </div>

            <div className="w-full h-px bg-ys-border-softest" />

            <div className="w-full flex flex-col gap-1.5 text-left">
              <span className="text-xs font-semibold text-ys-dim uppercase tracking-wide">
                Registrado como
              </span>
              <span className="text-[14px] font-semibold text-ys-text break-all">
                {email}
              </span>
            </div>

            {/* Señal de que la pantalla está viva: sin esto el sondeo es
                invisible y parece que hay que refrescar a mano igual. */}
            <div className="w-full flex items-center justify-center gap-2 bg-ys-el2 rounded-xl px-3.5 py-2.5">
              <span className="w-[7px] h-[7px] rounded-full bg-ys-green animate-pulse flex-none" />
              <span className="text-[12.5px] font-semibold text-ys-muted">
                Esta pantalla se actualiza sola al aprobarte
              </span>
            </div>
          </div>

          <button
            onClick={onLogout}
            className="flex items-center gap-2 text-[13.5px] font-bold text-ys-orange bg-ys-card border border-ys-border rounded-full px-4 py-2.5 cursor-pointer transition-colors hover:bg-ys-warn-bg"
          >
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
              <path
                d="M6.5 2.5H4a1.5 1.5 0 0 0-1.5 1.5v8A1.5 1.5 0 0 0 4 13.5h2.5M10 5l3 3-3 3M13 8H6.5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Cerrar sesión
          </button>
        </div>
      </div>
    </div>
  );
}
