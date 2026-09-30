"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { getEstadoConexionWhatsapp } from "@/lib/actions/auth";

/**
 * El usuario ya tiene cuenta (llegó por el magic link). Lo único que falta
 * es conectar su WhatsApp Business vía Meta/YCloud. Se abre en un popup para
 * no sacarlo de esta pantalla, y mientras tanto se hace polling: apenas el
 * webhook de YCloud confirma (yamas_send_confirmar_whatsapp), esta pantalla
 * lo manda solo al panel, ya con todo habilitado.
 */
export default function ConectarWhatsappScreen({
  linkInicial,
}: {
  linkInicial: string | null;
}) {
  const [conectando, setConectando] = useState(false);
  const [confirmado, setConfirmado] = useState(false);
  const [err, setErr] = useState("");
  const popupRef = useRef<Window | null>(null);

  useEffect(() => {
    // Polling cada 3s: barato (una fila por PK) y es la única forma de
    // enterarse, porque la confirmación llega por un webhook externo, no por
    // nada que pase en esta pestaña.
    const intervalo = setInterval(async () => {
      const estado = await getEstadoConexionWhatsapp();
      if (estado.status === "confirmed") {
        clearInterval(intervalo);
        setConfirmado(true);
        popupRef.current?.close();
        // Cambió la membresía server-side: hace falta un request nuevo, no
        // una navegación cliente que reuse el Router Cache viejo.
        setTimeout(() => window.location.assign("/panel"), 1200);
      }
    }, 3000);
    return () => clearInterval(intervalo);
  }, []);

  function handleConectar() {
    if (!linkInicial) {
      setErr(
        "No se pudo generar el link de conexión. Escribinos a soporte.",
      );
      return;
    }
    setErr("");
    setConectando(true);
    popupRef.current = window.open(
      linkInicial,
      "conectar-whatsapp",
      "width=480,height=720",
    );
  }

  return (
    <div className="fixed inset-0 bg-[#fbfcfb] flex items-center justify-center px-4">
      <div className="w-full max-w-[440px] bg-white border border-ys-border rounded-[18px] p-7 sm:p-9 shadow-[var(--shadow-card)] flex flex-col items-center text-center gap-4">
        <Image
          src="/brand/logo-login.png"
          alt="YamaSend"
          width={160}
          height={107}
          className="w-full max-w-[160px] h-auto object-contain"
          priority
        />

        {confirmado ? (
          <>
            <div className="w-14 h-14 rounded-full bg-ys-green-bg flex items-center justify-center">
              <svg width="26" height="26" viewBox="0 0 16 16" fill="none">
                <path d="m3 8.4 3.4 3L13 4.6" stroke="#12B76A" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div className="text-xl font-extrabold tracking-[-0.02em] text-ys-text">
              ¡WhatsApp conectado!
            </div>
            <p className="text-[13.5px] text-ys-muted font-medium">
              Cargando tu panel...
            </p>
          </>
        ) : (
          <>
            <div className="text-[21px] font-extrabold tracking-[-0.02em] text-ys-text">
              Un último paso
            </div>
            <p className="text-[13.5px] text-ys-muted font-medium leading-relaxed">
              Conectá tu WhatsApp Business para empezar a usar YamaSend: audiencias, templates, campañas e IA sobre tus conversaciones.
            </p>

            {err && (
              <div className="w-full rounded-lg bg-ys-red-bg border border-ys-red-border text-ys-red-text px-3.5 py-2.5 text-[13px] font-medium">
                {err}
              </div>
            )}

            <button
              onClick={handleConectar}
              className="w-full flex items-center justify-center gap-2.5 bg-ys-green text-white text-sm font-bold py-[13px] rounded-[11px] cursor-pointer transition-all hover:bg-ys-green-hover hover:-translate-y-px shadow-[var(--shadow-cta)]"
            >
              Conectar WhatsApp Business
            </button>

            {conectando && (
              <div className="flex items-center gap-2.5 text-[13px] text-ys-muted font-semibold">
                <div className="w-[15px] h-[15px] rounded-full border-2 border-ys-border border-t-ys-green animate-spin" />
                Esperando que termines en la ventana de Meta...
              </div>
            )}

            <p className="text-[11px] text-ys-dim font-medium">
              ¿Se cerró la ventana antes de tiempo? Tocá el botón de nuevo.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
