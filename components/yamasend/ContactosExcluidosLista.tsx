"use client";

import { useState } from "react";
import type { ContactoExcluido } from "@/lib/types";

/**
 * Pestaña "Excluidos" de Contactos: los contactos que el motor no tiene en
 * cuenta, con la opción de volver a incluirlos uno por uno (por si el usuario
 * se equivocó o el contacto pasó a ser cliente).
 */
export default function ContactosExcluidosLista({
  excluidos,
  busqueda,
  cargando,
  onIncluir,
  compact = false,
}: {
  excluidos: ContactoExcluido[];
  busqueda: string;
  cargando: boolean;
  onIncluir: (telefono: string) => Promise<void>;
  compact?: boolean;
}) {
  // Teléfonos con la acción en curso, para bloquear doble click por fila.
  const [enCurso, setEnCurso] = useState<Set<string>>(new Set());

  const q = busqueda.trim().toLowerCase();
  const filtrados = q
    ? excluidos.filter(
        (e) =>
          (e.nombre ?? "").toLowerCase().includes(q) || e.telefono.includes(q.replace(/\D/g, "") || q),
      )
    : excluidos;

  async function incluir(telefono: string) {
    setEnCurso((prev) => new Set(prev).add(telefono));
    await onIncluir(telefono);
    setEnCurso((prev) => {
      const next = new Set(prev);
      next.delete(telefono);
      return next;
    });
  }

  if (cargando && excluidos.length === 0) {
    return (
      <div className="px-6 py-10 text-center text-[13px] text-ys-dim font-medium">
        Cargando contactos excluidos...
      </div>
    );
  }

  if (excluidos.length === 0) {
    return (
      <div className={`${compact ? "px-4" : "px-6"} py-10 flex flex-col items-center gap-2 text-center`}>
        <div className="text-[14px] font-extrabold text-ys-text">No hay contactos excluidos</div>
        <p className="text-[12.5px] text-ys-dim font-medium max-w-[380px] leading-[1.55]">
          Si tenés números que no son clientes (otras sucursales, proveedores, tu equipo),
          seleccionalos en la lista y elegí &ldquo;Excluir del motor&rdquo;.
        </p>
      </div>
    );
  }

  if (filtrados.length === 0) {
    return (
      <div className="px-6 py-10 text-center text-[13px] text-ys-dim font-medium">
        Ningún contacto excluido coincide con la búsqueda.
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <p className={`${compact ? "px-4" : "px-6"} pb-3 text-[12px] text-ys-dim font-medium leading-[1.5]`}>
        El motor no tiene en cuenta estos contactos para recomendaciones ni campañas sugeridas.
      </p>
      <ul className="border-t border-ys-border-softest">
        {filtrados.map((e) => {
          const ocupado = enCurso.has(e.telefono);
          return (
            <li
              key={e.telefono}
              className={`flex items-center gap-3 border-b border-ys-border-softest ${
                compact ? "px-4 py-3" : "px-6 py-3.5"
              }`}
            >
              <div className="w-8 h-8 flex-none rounded-full bg-ys-el2 text-ys-dim flex items-center justify-center">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                  <circle cx="8" cy="8" r="5.8" stroke="currentColor" strokeWidth="1.5" />
                  <path d="M3.9 12.1 12.1 3.9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </div>
              <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                <div className="text-[13.5px] font-bold text-ys-text truncate">
                  {e.nombre || "Sin nombre"}
                </div>
                <div className="text-[12px] font-mono text-ys-dim truncate">+{e.telefono}</div>
              </div>
              <button
                onClick={() => incluir(e.telefono)}
                disabled={ocupado}
                className="flex-none text-[12.5px] font-bold text-ys-text border border-ys-border rounded-[9px] px-3 py-2 cursor-pointer transition-colors hover:border-ys-green-border hover:bg-[#f7fbf9] disabled:opacity-50 disabled:cursor-wait"
              >
                {ocupado ? "Incluyendo..." : "Volver a incluir"}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * Pestañas "Todos / Excluidos" del encabezado de la lista de Contactos.
 * Reemplaza al título fijo "Todos los contactos".
 */
export function VistaContactosTabs({
  vista,
  cantidadExcluidos,
  onChange,
}: {
  vista: "todos" | "excluidos";
  cantidadExcluidos: number;
  onChange: (vista: "todos" | "excluidos") => void;
}) {
  const tabs: { key: "todos" | "excluidos"; label: string }[] = [
    { key: "todos", label: "Todos los contactos" },
    { key: "excluidos", label: `Excluidos${cantidadExcluidos > 0 ? ` (${cantidadExcluidos})` : ""}` },
  ];
  return (
    <div role="tablist" aria-label="Vista de contactos" className="flex items-center gap-1">
      {tabs.map((t) => {
        const activa = vista === t.key;
        return (
          <button
            key={t.key}
            role="tab"
            aria-selected={activa}
            onClick={() => onChange(t.key)}
            className={`text-[14px] md:text-[15px] rounded-[9px] px-2.5 py-1.5 cursor-pointer transition-colors whitespace-nowrap ${
              activa
                ? "font-extrabold text-ys-text bg-ys-el2"
                : "font-semibold text-ys-dim hover:text-ys-text"
            }`}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
