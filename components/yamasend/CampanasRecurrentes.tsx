"use client";

import { useState } from "react";
import type { CampanaRecurrente } from "@/lib/types";
import { describirRecurrencia, formatearProxima } from "@/lib/campanas/recurrencia";

/**
 * Series de campañas que se repiten ("todos los lunes a las 11"). Se muestran
 * arriba de la lista de Campañas: qué se repite, cuándo sale la próxima y si
 * la última falló (sin saldo, template ya no aprobado…). Pausar frena las
 * próximas sin tocar las que ya se generaron; eliminar tampoco borra lo ya
 * enviado.
 */
export default function CampanasRecurrentes({
  recurrentes,
  puedeGestionar,
  onSinPermiso,
  onPausar,
  onEliminar,
}: {
  recurrentes: CampanaRecurrente[];
  puedeGestionar: boolean;
  onSinPermiso: () => void;
  onPausar: (id: string, activa: boolean) => Promise<void>;
  onEliminar: (id: string) => Promise<void>;
}) {
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState<string | null>(null);

  if (recurrentes.length === 0) return null;

  async function ejecutar(id: string, fn: () => Promise<void>) {
    setOcupado(id);
    await fn();
    setOcupado(null);
    setConfirmando(null);
  }

  return (
    <section aria-label="Campañas que se repiten" className="bg-ys-card border border-ys-border rounded-2xl overflow-hidden">
      <div className="px-5 py-3 border-b border-ys-border flex items-center gap-2">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" className="text-ys-green-text">
          <path d="M3 7.5V6.5A2.5 2.5 0 0 1 5.5 4H13M13 4l-2-2M13 4l-2 2M13 8.5v1A2.5 2.5 0 0 1 10.5 12H3M3 12l2 2M3 12l2-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <h2 className="m-0 text-sm font-extrabold text-ys-text">Se repiten solas</h2>
        <span className="font-mono text-xs text-ys-muted">{recurrentes.length}</span>
      </div>

      {recurrentes.map((r, i) => (
        <div
          key={r.id}
          className={`px-5 py-3.5 flex items-center gap-3 flex-wrap ${i > 0 ? "border-t border-ys-border-softer" : ""}`}
        >
          <div className="flex-1 min-w-[220px] flex flex-col gap-0.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-extrabold text-ys-text truncate">{r.nombre}</span>
              <span
                className={`text-[11.5px] font-extrabold rounded-full px-2.5 py-0.5 ${
                  r.activa ? "bg-[#d3f2e3] text-ys-green-text" : "bg-ys-el2 text-ys-muted"
                }`}
              >
                {r.activa ? "Activa" : "Pausada"}
              </span>
            </div>
            <div className="text-[13px] font-semibold text-ys-muted">
              {describirRecurrencia(r)}
              {r.listaNombre ? ` · ${r.listaNombre}` : ""}
            </div>
            <div className="text-[12.5px] font-medium text-ys-dim">
              {r.activa && r.proximaEjecucion ? `Próxima: ${formatearProxima(r.proximaEjecucion)}` : "Sin próxima fecha"}
              {r.ocurrencias > 0 ? ` · ${r.ocurrencias} enviada${r.ocurrencias === 1 ? "" : "s"}` : ""}
              {r.maxOcurrencias ? ` de ${r.maxOcurrencias}` : ""}
            </div>
            {r.ultimoError && (
              <div className="text-[12.5px] font-bold text-ys-warn-text">
                La última no salió: {r.ultimoError}
              </div>
            )}
          </div>

          {confirmando === r.id ? (
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-bold text-ys-text">¿Eliminar la repetición?</span>
              <button
                type="button"
                onClick={() => setConfirmando(null)}
                disabled={ocupado === r.id}
                className="h-9 px-3.5 rounded-[10px] border border-ys-border text-[13px] font-bold text-[#3f4844] cursor-pointer hover:bg-[#f7f9f8] disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => ejecutar(r.id, () => onEliminar(r.id))}
                disabled={ocupado === r.id}
                className="h-9 px-3.5 rounded-[10px] bg-ys-orange-bg border border-ys-warn-bg text-[13px] font-extrabold text-ys-orange cursor-pointer disabled:opacity-50"
              >
                Sí, eliminar
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => (puedeGestionar ? ejecutar(r.id, () => onPausar(r.id, !r.activa)) : onSinPermiso())}
                disabled={ocupado === r.id}
                className="h-9 px-3.5 rounded-[10px] border border-ys-border text-[13px] font-bold text-ys-text cursor-pointer hover:bg-[#f7f9f8] disabled:opacity-50"
              >
                {r.activa ? "Pausar" : "Reanudar"}
              </button>
              <button
                type="button"
                onClick={() => (puedeGestionar ? setConfirmando(r.id) : onSinPermiso())}
                className="h-9 px-3.5 rounded-[10px] text-[13px] font-bold text-ys-muted cursor-pointer hover:text-ys-orange"
              >
                Eliminar
              </button>
            </div>
          )}
        </div>
      ))}
    </section>
  );
}
