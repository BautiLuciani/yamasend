"use client";

import { useEffect, useState } from "react";
import { getActividadWhatsappAction, type ActividadWhatsapp as Datos } from "@/lib/actions/contactos";

/**
 * Estado de WhatsApp a la derecha del título de Contactos: el punto verde dice
 * si la sesión está vinculada, y los números cuentan lo que pasó en las últimas
 * 24 h o 7 días (quiénes te escribieron, mensajes recibidos y contactos nuevos).
 */
export default function ActividadWhatsapp({ conectada }: { conectada: boolean | null }) {
  const [ventana, setVentana] = useState<"24h" | "7d">("24h");
  const [datos, setDatos] = useState<Datos | null>(null);
  const [fallo, setFallo] = useState(false);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      const r = await getActividadWhatsappAction(ventana);
      if (cancelado) return;
      setDatos(r.actividad);
      setFallo(!!r.error);
    })();
    return () => {
      cancelado = true;
    };
  }, [ventana]);

  const punto = conectada === true ? "bg-ys-green" : conectada === false ? "bg-[#e5383b]" : "bg-[#b8beba]";
  const n = (v: number | undefined) => (datos ? v : "–");

  return (
    <div className="bg-white border border-ys-border rounded-2xl px-4 py-3 flex items-start gap-3.5 md:mt-5 self-start">
      <div className="relative flex-none w-[46px] h-[46px] rounded-[14px] bg-ys-dark flex items-center justify-center">
        <svg width="20" height="20" viewBox="0 0 16 16" fill="none">
          <path d="M1.5 8h2.6l1.6-4 2.6 8 1.6-4h4.6" stroke="#3ddb8f" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className={`absolute -top-1 -left-1 w-3 h-3 rounded-full border-2 border-white ${punto}`} />
      </div>
      <div className="flex flex-col gap-1.5 min-w-0">
        <div className="flex items-center justify-between gap-4">
          <div className="text-[15px] font-extrabold text-ys-text whitespace-nowrap">Actividad de WhatsApp</div>
          <div className="flex border border-ys-border rounded-lg p-0.5 bg-ys-bg">
            {(["24h", "7d"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setVentana(v)}
                className={`text-[12px] font-bold rounded-md px-2.5 py-1 cursor-pointer transition-colors ${
                  ventana === v ? "bg-white text-ys-text shadow-sm" : "text-ys-muted hover:text-ys-text"
                }`}
              >
                {v === "24h" ? "24 h" : "7 días"}
              </button>
            ))}
          </div>
        </div>
        {fallo ? (
          <div className="text-[12.5px] font-semibold text-ys-muted">No se pudo leer la actividad.</div>
        ) : (
          <div className="flex items-center gap-x-4 gap-y-1 flex-wrap text-[13.5px] font-medium text-ys-muted">
            <span>
              <b className="font-bold text-ys-green-text">{n(datos?.escribieron)}</b> te escribieron
            </span>
            <span>
              <b className="font-bold text-ys-warn-text">{n(datos?.mensajes)}</b> mensajes
            </span>
            <span>
              <b className="font-bold text-ys-text">{n(datos?.nuevos)}</b> contactos nuevos
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
