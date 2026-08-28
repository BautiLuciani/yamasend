"use client";

import { useEffect } from "react";

/**
 * Aviso flotante para el feedback de acciones hechas FUERA del chat de IA
 * (crear una audiencia desde la sección Audiencias, borrar una campaña,
 * etc.).
 *
 * Antes ese feedback se escribía como un mensaje en el chat de IA, lo que
 * ensuciaba la conversación con eventos que el usuario no había pedido ahí
 * — y encima quedaban guardados en el historial de la conversación. Pero
 * borrarlos sin más dejaba los errores invisibles: varios de esos modales
 * no muestran error propio. El toast conserva el feedback sin mezclarlo con
 * la conversación.
 */
export type ToastTipo = "exito" | "error";

export interface ToastData {
  id: string;
  texto: string;
  tipo: ToastTipo;
}

interface ToastProps {
  toast: ToastData | null;
  onCerrar: () => void;
}

export default function Toast({ toast, onCerrar }: ToastProps) {
  useEffect(() => {
    if (!toast) return;
    // Los errores quedan más tiempo: el usuario necesita poder leerlos y,
    // eventualmente, copiarlos.
    const ms = toast.tipo === "error" ? 6000 : 3000;
    const t = setTimeout(onCerrar, ms);
    return () => clearTimeout(t);
  }, [toast, onCerrar]);

  if (!toast) return null;

  const esError = toast.tipo === "error";

  return (
    <div
      role="status"
      aria-live="polite"
      className={
        // MOBILE: arriba, justo debajo del header fijo (58px). Abajo no
        // sirve: ahí conviven la barra de escritura del chat y la barra de
        // acciones de selección (fixed bottom-3, con flex-wrap, así que su
        // alto es variable). Arriba es la única zona libre garantizada.
        //
        // DESKTOP: se mantiene abajo y centrado, sin cambios.
        //
        // z-[9500] queda por encima de todo lo que existe hoy: los modales
        // usan z-[100], el drawer de perfil z-[8000]/[8001] y los modales de
        // logout/perfil z-[9000]. Un aviso que aparece detrás de un modal es
        // un aviso que no se ve.
        "fixed z-[9500] pointer-events-none " +
        "left-3 right-3 top-[68px] flex justify-center " +
        "md:left-1/2 md:right-auto md:top-auto md:bottom-5 md:-translate-x-1/2 " +
        "md:max-w-[520px]"
      }
      style={{
        // Respeta el notch/isla en iOS cuando el aviso va arriba.
        paddingTop: "env(safe-area-inset-top, 0px)",
      }}
    >
      <div
        className={`pointer-events-auto w-full md:w-auto flex items-start gap-2.5 rounded-[14px] px-4 py-3 shadow-[0_8px_24px_rgba(16,24,20,0.18)] border ${
          esError
            ? "bg-ys-orange-bg border-ys-warn-bg text-ys-orange"
            : "bg-ys-dark border-transparent text-white"
        }`}
      >
        {esError ? (
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="mt-0.5 flex-none">
            <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5" />
            <path d="M8 5v3.5M8 10.8v.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="mt-0.5 flex-none">
            <circle cx="8" cy="8" r="7" fill="#12B76A" />
            <path d="m4.6 8.3 2.3 2.2L11.4 6" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
        <div className="min-w-0 flex-1 text-[13px] font-semibold leading-[1.45] break-words">
          {toast.texto}
        </div>
        <button
          onClick={onCerrar}
          aria-label="Cerrar aviso"
          className="flex-none ml-1 opacity-60 hover:opacity-100 transition-opacity cursor-pointer"
        >
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
            <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}
