"use client";

import { useState } from "react";
import { esEtiquetaDeSistema, mostrarEtiqueta, normalizarEtiqueta } from "@/lib/etiquetas/etiquetas";
import EtiquetaChip from "./EtiquetaChip";

/**
 * "Etiquetar" desde la barra de selección de Contactos: pone UNA etiqueta a todos
 * los contactos seleccionados. Se elige una existente o se escribe una nueva
 * (que se crea en el momento).
 */
export default function EtiquetarSeleccionModal({
  open,
  cantidad,
  etiquetasExistentes,
  onConfirmar,
  onClose,
}: {
  open: boolean;
  cantidad: number;
  /** Etiquetas que ya existen en la cuenta. */
  etiquetasExistentes: string[];
  /** Devuelve un mensaje de error, o null si salió bien. */
  onConfirmar: (etiqueta: string, modo: "agregar" | "quitar") => Promise<string | null>;
  onClose: () => void;
}) {
  const [texto, setTexto] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [modo, setModo] = useState<"agregar" | "quitar">("agregar");
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const normalizada = normalizarEtiqueta(texto);
  const elegibles = etiquetasExistentes.filter((e) => !esEtiquetaDeSistema(e));

  async function confirmar() {
    if (!normalizada || guardando) return;
    setGuardando(true);
    setError(null);
    const e = await onConfirmar(normalizada, modo);
    setGuardando(false);
    if (e) {
      setError(e);
      return;
    }
    setTexto("");
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
          <div className="text-[19px] font-extrabold tracking-[-0.02em] text-ys-text">
            Etiquetas de {cantidad} contacto{cantidad === 1 ? "" : "s"}
          </div>
          <div className="flex gap-1 bg-ys-el2 rounded-[10px] p-1 w-fit">
            {(["agregar", "quitar"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setModo(m)}
                className={`text-[13px] font-bold rounded-lg px-3.5 py-1.5 cursor-pointer transition-colors ${
                  modo === m ? "bg-white text-ys-text shadow-sm" : "text-ys-muted"
                }`}
              >
                {m === "agregar" ? "Agregar" : "Quitar"}
              </button>
            ))}
          </div>
          <div className="text-[13.5px] text-ys-muted font-medium leading-[1.5]">
            {modo === "agregar"
              ? "Elegí una etiqueta o escribí una nueva. Se suma a las que ya tengan."
              : "Elegí la etiqueta que querés sacarles. Los que no la tengan no cambian."}
          </div>
        </div>

        {elegibles.length > 0 && (
          <div className="flex flex-wrap gap-1.5 max-h-[120px] overflow-y-auto">
            {elegibles.map((e) => (
              <EtiquetaChip key={e} nombre={e} activa={normalizada === e} onClick={() => setTexto(mostrarEtiqueta(e))} />
            ))}
          </div>
        )}

        <input
          value={texto}
          onChange={(ev) => setTexto(ev.target.value)}
          onKeyDown={(ev) => ev.key === "Enter" && confirmar()}
          maxLength={30}
          autoFocus
          placeholder="Etiqueta (ej: vip, mayorista, evento)"
          className="w-full border border-ys-border rounded-[10px] px-3 py-2.5 text-[13.5px] font-medium text-ys-text outline-none focus:border-ys-green"
        />
        {texto.trim() && !normalizada && (
          <div className="text-[12px] font-semibold text-ys-red-text">Usá letras, números y espacios (hasta 30 caracteres).</div>
        )}
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
            disabled={!normalizada || guardando}
            className="text-[13.5px] font-bold text-white bg-ys-green rounded-[10px] px-[18px] py-2.5 cursor-pointer transition-all hover:bg-ys-green-hover disabled:opacity-60 disabled:cursor-default"
          >
            {guardando ? "Aplicando…" : modo === "agregar" ? "Agregar etiqueta" : "Quitar etiqueta"}
          </button>
        </div>
      </div>
    </div>
  );
}
