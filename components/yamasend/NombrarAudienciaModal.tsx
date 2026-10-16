"use client";

import { useState } from "react";

/** Popup de «Crear audiencia»: se le pone nombre a los contactos seleccionados. */
export default function NombrarAudienciaModal({
  cantidad,
  nombreSugerido,
  onConfirmar,
  onClose,
}: {
  cantidad: number;
  nombreSugerido: string;
  /** Devuelve un mensaje de error, o null si salió bien. */
  onConfirmar: (nombre: string) => Promise<string | null>;
  onClose: () => void;
}) {
  const [nombre, setNombre] = useState(nombreSugerido);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirmar() {
    const n = nombre.trim();
    if (!n || guardando) return;
    setGuardando(true);
    setError(null);
    const e = await onConfirmar(n);
    setGuardando(false);
    if (e) setError(e);
  }

  return (
    <div
      onClick={(ev) => ev.target === ev.currentTarget && onClose()}
      className="fixed inset-0 bg-black/[.34] flex items-center justify-center z-[100] px-4"
      style={{ animation: "ys-fade .16s ease both" }}
    >
      <div
        onClick={(ev) => ev.stopPropagation()}
        className="w-full max-w-[440px] bg-white rounded-[18px] px-7 py-[22px] flex flex-col gap-4 shadow-[var(--shadow-modal)]"
        style={{ animation: "ys-modal .19s cubic-bezier(.4,0,.2,1) both" }}
      >
        <div className="flex flex-col gap-1.5">
          <div className="text-[19px] font-extrabold tracking-[-0.02em] text-ys-text">Nueva audiencia</div>
          <div className="text-[13.5px] text-ys-muted font-medium leading-[1.5]">
            Los {cantidad} contacto{cantidad === 1 ? "" : "s"} seleccionado{cantidad === 1 ? "" : "s"} van a formar esta audiencia. Poneles un nombre.
          </div>
        </div>
        <input
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && confirmar()}
          maxLength={90}
          autoFocus
          placeholder="Ej: Clientes de Royal Canin"
          className="w-full border border-ys-border rounded-[10px] px-3 py-2.5 text-[13.5px] font-medium text-ys-text outline-none focus:border-ys-green"
        />
        {error && <div className="text-[12.5px] font-semibold text-ys-red-text bg-ys-red-bg rounded-[10px] px-3 py-2">{error}</div>}
        <div className="flex justify-end gap-2.5">
          <button
            onClick={onClose}
            className="text-[13.5px] font-bold text-[#3f4844] border border-ys-border rounded-[10px] px-[18px] py-2.5 cursor-pointer transition-colors hover:bg-[#f7f9f8]"
          >
            Cancelar
          </button>
          <button
            onClick={confirmar}
            disabled={!nombre.trim() || guardando}
            className="text-[13.5px] font-bold text-white bg-ys-green rounded-[10px] px-[18px] py-2.5 cursor-pointer transition-all hover:bg-ys-green-hover disabled:opacity-60 disabled:cursor-default"
          >
            {guardando ? "Creando…" : "Crear audiencia"}
          </button>
        </div>
      </div>
    </div>
  );
}
