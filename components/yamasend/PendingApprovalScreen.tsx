"use client";

import Image from "next/image";

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
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-ys-bg px-5 py-10">
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
              <circle
                cx="12"
                cy="12"
                r="9"
                stroke="#F79009"
                strokeWidth="1.8"
              />
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

          <p className="text-[13px] text-ys-dim leading-relaxed">
            En cuanto te aprueben vas a poder entrar normalmente. Si pasó
            demasiado tiempo, escribile a la persona que te mandó la invitación.
          </p>
        </div>

        <button
          onClick={onLogout}
          className="text-[13.5px] font-semibold text-ys-orange hover:underline cursor-pointer"
        >
          Cerrar sesión
        </button>
      </div>
    </div>
  );
}
