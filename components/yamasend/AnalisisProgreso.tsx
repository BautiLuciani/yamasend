"use client";

import type { AnalisisEstado } from "@/lib/types";

interface AnalisisProgresoProps {
  estado: AnalisisEstado | null;
  /** Oculta la tarjeta de "análisis completo" hasta el próximo análisis. */
  onCerrar: () => void;
}

/**
 * Tarjeta de progreso del análisis inicial automático (yamas_send_analisis_jobs).
 *
 * El análisis arranca solo al vincular el WhatsApp, corre en segundo plano y
 * no bloquea nada: el usuario puede seguir usando el panel mientras los leads
 * van apareciendo. Esta tarjeta solo informa; la decisión de qué analizar ya
 * no depende de que el usuario elija una cantidad de contactos.
 */
export default function AnalisisProgreso({ estado, onCerrar }: AnalisisProgresoProps) {
  if (!estado) return null;

  const enCurso =
    estado.estado === "pendiente" ||
    estado.estado === "listando" ||
    estado.estado === "procesando" ||
    estado.estado === "pausado";

  if (estado.estado === "completado") {
    return (
      <div className="px-4 md:px-[38px] pt-4 md:pt-6">
        <div className="bg-ys-card border border-ys-green-border rounded-2xl px-4 md:px-[18px] py-3.5 flex items-center gap-3.5">
          <div className="w-9 h-9 flex-none rounded-full bg-ys-green-bg flex items-center justify-center">
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="m3 8.4 3.4 3L13 4.6" stroke="#12B76A" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div className="flex flex-col gap-0.5 min-w-0">
            <div className="text-[14px] font-extrabold text-ys-text">Análisis completo</div>
            <div className="text-[13px] text-ys-muted font-medium">
              Revisamos {formatear(estado.total_chats ?? 0)} conversaciones de los últimos{" "}
              {estado.ventana_dias} días y encontramos {formatear(estado.leads)}{" "}
              {estado.leads === 1 ? "contacto con interés" : "contactos con interés"}.
            </div>
          </div>
          <button
            onClick={onCerrar}
            aria-label="Cerrar aviso"
            className="ml-auto flex-none text-ys-dim hover:text-ys-text rounded-lg p-1.5 cursor-pointer transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="m4 4 8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>
    );
  }

  if (estado.estado === "error") {
    return (
      <div className="px-4 md:px-[38px] pt-4 md:pt-6">
        <div className="bg-ys-card border border-ys-red-border rounded-2xl px-4 md:px-[18px] py-3.5 flex items-center gap-3.5">
          <div className="text-[13px] text-ys-red-text font-semibold">
            No pudimos terminar de leer tus conversaciones. Podés volver a intentarlo con
            &nbsp;<span className="font-extrabold">Analizar</span>.
          </div>
          <button
            onClick={onCerrar}
            aria-label="Cerrar aviso"
            className="ml-auto flex-none text-ys-dim hover:text-ys-text rounded-lg p-1.5 cursor-pointer transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="m4 4 8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>
    );
  }

  if (!enCurso) return null;

  const total = estado.total_chats ?? 0;
  const listando = estado.estado === "pendiente" || estado.estado === "listando" || total === 0;
  const pausado = estado.estado === "pausado";

  const detalle = listando
    ? "Estamos buscando tus conversaciones de los últimos " + estado.ventana_dias + " días."
    : pausado
      ? "Hicimos una pausa corta para no saturar tu WhatsApp. Seguimos solos en unos minutos."
      : formatear(estado.procesados) + " de " + formatear(total) + " conversaciones · " +
        formatear(estado.leads) + (estado.leads === 1 ? " contacto con interés" : " contactos con interés");

  return (
    <div className="px-4 md:px-[38px] pt-4 md:pt-6">
      <div
        className="bg-ys-card border border-ys-border rounded-2xl px-4 md:px-[18px] py-3.5 flex flex-col gap-3"
        role="status"
        aria-live="polite"
      >
        <div className="flex items-center gap-3.5">
          <div className="w-9 h-9 flex-none rounded-full bg-ys-green-bg flex items-center justify-center">
            <div
              className={`w-4 h-4 rounded-full border-2 border-ys-green-border border-t-ys-green ${
                pausado ? "" : "animate-spin"
              }`}
            />
          </div>
          <div className="flex flex-col gap-0.5 min-w-0">
            <div className="text-[14px] font-extrabold text-ys-text">
              Analizando tus conversaciones
            </div>
            <div className="text-[13px] text-ys-muted font-medium">{detalle}</div>
          </div>
          {!listando && (
            <div className="ml-auto flex-none text-[15px] font-extrabold text-ys-green-text tabular-nums">
              {estado.porcentaje}%
            </div>
          )}
        </div>
        <div className="h-1.5 w-full rounded-full bg-ys-el2 overflow-hidden">
          <div
            className={`h-full rounded-full bg-ys-green transition-[width] duration-700 ${
              listando ? "w-1/4 animate-pulse" : ""
            }`}
            style={listando ? undefined : { width: Math.max(estado.porcentaje, 3) + "%" }}
          />
        </div>
        <div className="text-[12px] text-ys-dim font-medium">
          Podés seguir usando YamaSend: los contactos van apareciendo a medida que avanzamos.
        </div>
      </div>
    </div>
  );
}

function formatear(n: number): string {
  return new Intl.NumberFormat("es-AR").format(n);
}
