"use client";

import { useCallback, useEffect, useState } from "react";
import { getActividadWhatsappAction } from "@/lib/actions/novedades";
import type { ActividadWhatsapp } from "@/lib/types";

/**
 * Card "Actividad de WhatsApp" de Contactos. Reemplaza al botón "Analizar"
 * (pedido de Bauti y Pato, 2026-10): el análisis inicial corre solo al
 * vincular el WhatsApp, así que ese espacio pasa a mostrar qué está pasando
 * en las conversaciones.
 *
 * Por qué estas tres métricas (ver análisis en la conversación del cambio):
 *  - "Te escribieron": contactos distintos con mensajes entrantes. Es lo más
 *    accionable: en las últimas 24 h son conversaciones con la ventana de
 *    WhatsApp abierta (se les puede responder sin template).
 *  - "Mensajes": volumen entrante, para dimensionar el movimiento.
 *  - "Nuevos": contactos cuyo PRIMER mensaje es de este período (gente que
 *    te escribe por primera vez), no contactos importados.
 *
 * Los datos salen del historial de mensajes, que se guarda en tiempo real;
 * la card se refresca sola cada minuto mientras está en pantalla y al
 * volver a la pestaña. No cuenta a los contactos excluidos del motor.
 */

const REFRESCO_MS = 60_000;

type Periodo = "h24" | "d7";

const PERIODOS: { key: Periodo; label: string; frase: string }[] = [
  { key: "h24", label: "24 h", frase: "en las últimas 24 h" },
  { key: "d7", label: "7 días", frase: "en los últimos 7 días" },
];

export default function ActividadWhatsappCard({
  whatsappVinculado,
  version = 0,
}: {
  /** Sin WhatsApp vinculado no hay actividad que mostrar: se explica eso. */
  whatsappVinculado: boolean | null;
  /** Al cambiar, se vuelve a cargar en el acto (ej: cambió la lista de excluidos). */
  version?: number;
}) {
  const [periodo, setPeriodo] = useState<Periodo>("h24");
  const [datos, setDatos] = useState<ActividadWhatsapp | null>(null);
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async () => {
    const res = await getActividadWhatsappAction();
    // Si falla un refresco, se conserva el último dato bueno en vez de
    // vaciar la card.
    if (res) setDatos(res);
    setCargando(false);
  }, []);

  useEffect(() => {
    let intervalo: ReturnType<typeof setInterval> | null = null;

    const arrancar = () => {
      if (intervalo) return;
      intervalo = setInterval(cargar, REFRESCO_MS);
    };
    const frenar = () => {
      if (intervalo) clearInterval(intervalo);
      intervalo = null;
    };
    // No tiene sentido pollear con la pestaña en segundo plano; al volver
    // se refresca en el acto.
    const onVisibilidad = () => {
      if (document.visibilityState === "visible") {
        void cargar();
        arrancar();
      } else {
        frenar();
      }
    };

    // Primera carga agendada (no en el cuerpo del efecto).
    const inicial = setTimeout(cargar, 0);
    arrancar();
    document.addEventListener("visibilitychange", onVisibilidad);
    return () => {
      clearTimeout(inicial);
      frenar();
      document.removeEventListener("visibilitychange", onVisibilidad);
    };
  }, [cargar, version]);

  const p = datos?.[periodo];
  const frase = PERIODOS.find((x) => x.key === periodo)!.frase;
  const sinWhatsapp = whatsappVinculado === false && (!p || p.mensajes === 0);

  return (
    <div className="bg-white border border-ys-border rounded-2xl px-4 md:px-[18px] py-4 flex items-center gap-3.5 text-left">
      <div className="relative w-10 h-10 flex-none rounded-[13px] bg-ys-dark flex items-center justify-center">
        <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
          <path
            d="M1.8 8h2.4l1.6-4 2.6 8 1.8-5 1 1h3"
            stroke="#3ddb8f"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        {/* Punto "en vivo": la card se actualiza sola. */}
        {!sinWhatsapp && (
          <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-ys-green border-2 border-white" />
        )}
      </div>

      <div className="flex-1 min-w-0 flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <div className="text-sm font-extrabold text-ys-text truncate">Actividad de WhatsApp</div>
          <div
            role="tablist"
            aria-label="Período"
            className="ml-auto flex-none flex gap-[2px] bg-ys-el2 rounded-lg p-[2px]"
          >
            {PERIODOS.map((x) => (
              <button
                key={x.key}
                role="tab"
                aria-selected={periodo === x.key}
                onClick={() => setPeriodo(x.key)}
                className={`text-[11.5px] rounded-md px-2 py-[3px] cursor-pointer transition-colors ${
                  periodo === x.key
                    ? "font-bold text-ys-text bg-white shadow-[0_1px_2px_rgba(16,24,20,0.07)]"
                    : "font-semibold text-ys-dim hover:text-ys-text"
                }`}
              >
                {x.label}
              </button>
            ))}
          </div>
        </div>

        {cargando && !datos ? (
          <div className="flex gap-2 pt-0.5" aria-label="Cargando actividad">
            <span className="h-3.5 w-24 rounded bg-ys-el2 animate-pulse" />
            <span className="h-3.5 w-16 rounded bg-ys-el2 animate-pulse" />
            <span className="h-3.5 w-14 rounded bg-ys-el2 animate-pulse" />
          </div>
        ) : sinWhatsapp ? (
          <div className="text-[12.5px] text-ys-dim font-medium truncate">
            Vinculá tu WhatsApp para ver la actividad de tus conversaciones.
          </div>
        ) : !p ? (
          <div className="text-[12.5px] text-ys-dim font-medium truncate">
            No pudimos cargar la actividad. Se reintenta en un minuto.
          </div>
        ) : (
          <div
            className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-[12.5px] text-ys-dim font-medium"
            title={`Mensajes que recibiste ${frase}. Se actualiza solo cada minuto.`}
          >
            <Metrica valor={p.escribieron} texto={p.escribieron === 1 ? "te escribió" : "te escribieron"} destacada />
            <Metrica valor={p.mensajes} texto={p.mensajes === 1 ? "mensaje" : "mensajes"} />
            <Metrica valor={p.nuevos} texto={p.nuevos === 1 ? "contacto nuevo" : "contactos nuevos"} />
          </div>
        )}
      </div>
    </div>
  );
}

function Metrica({
  valor,
  texto,
  destacada,
}: {
  valor: number;
  texto: string;
  destacada?: boolean;
}) {
  return (
    <span className="whitespace-nowrap">
      <span
        className={`font-mono font-medium tracking-[-0.02em] mr-1 ${
          destacada ? "text-[15px] text-ys-green-text" : "text-[13.5px] text-ys-text"
        }`}
      >
        {valor}
      </span>
      {texto}
    </span>
  );
}
