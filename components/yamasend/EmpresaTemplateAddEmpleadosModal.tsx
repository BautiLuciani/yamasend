"use client";

import { useState } from "react";
import type { EmpleadoResumen } from "@/lib/types";
import type { EmpresaTemplatePropio } from "@/lib/actions/empresa";

/**
 * Suma empleados a un template de empresa que ya existe.
 *
 * Solo se ofrecen los que todavía no lo tienen: volver a agregarlos duplicaría
 * la copia y dispararía una segunda aprobación de Meta sin sentido. Los que ya
 * lo tienen se listan aparte para que la empresa entienda por qué no están.
 */
export default function EmpresaTemplateAddEmpleadosModal({
  template,
  empleados,
  onCancel,
  onAgregar,
}: {
  template: EmpresaTemplatePropio | null;
  empleados: EmpleadoResumen[];
  onCancel: () => void;
  onAgregar: (
    masterId: string,
    tenantIds: string[],
  ) => Promise<{ ok: boolean; error: string | null }>;
}) {
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set());
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!template) return null;

  const yaLoTienen = new Set(template.copias.map((c) => c.tenantId));

  const disponibles = empleados.filter(
    (e) =>
      e.estado === "activo" &&
      e.whatsappConfigurado &&
      !yaLoTienen.has(e.tenantId),
  );
  const sinWhatsapp = empleados.filter(
    (e) =>
      e.estado === "activo" &&
      !e.whatsappConfigurado &&
      !yaLoTienen.has(e.tenantId),
  );

  function toggle(tenantId: string) {
    setSeleccionados((prev) => {
      const next = new Set(prev);
      if (next.has(tenantId)) next.delete(tenantId);
      else next.add(tenantId);
      return next;
    });
  }

  async function handleAgregar() {
    if (seleccionados.size === 0 || !template) return;
    setGuardando(true);
    setError(null);
    const res = await onAgregar(template.id, Array.from(seleccionados));
    setGuardando(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setSeleccionados(new Set());
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center px-4 py-6">
      <div
        className="absolute inset-0 bg-[rgba(16,24,20,0.45)]"
        onClick={guardando ? undefined : onCancel}
      />
      <div className="relative w-full max-w-[480px] max-h-full overflow-y-auto bg-white border border-ys-border rounded-2xl p-5 md:p-6 flex flex-col gap-4 shadow-[0_20px_48px_rgba(16,24,20,0.18)]">
        <div className="flex flex-col gap-1">
          <h2 className="text-[17px] font-extrabold text-ys-text">
            Sumar empleados
          </h2>
          <p className="text-[12.5px] text-ys-muted font-medium leading-snug">
            Se pide la aprobación a Meta solo para los que agregues. Los que ya
            lo tienen no se tocan.
          </p>
          <span className="font-mono text-[12.5px] font-bold text-ys-text bg-ys-el2 rounded-lg px-2.5 py-1.5 mt-1 self-start break-all">
            {template.nombre}
          </span>
        </div>

        {disponibles.length === 0 && sinWhatsapp.length === 0 && (
          <p className="text-[12.5px] text-ys-muted font-medium bg-ys-el2 rounded-lg px-3 py-2.5">
            Todos tus empleados activos ya tienen este template.
          </p>
        )}

        {disponibles.length > 0 && (
          <div className="flex flex-col gap-1.5 max-h-[220px] overflow-y-auto">
            {disponibles.map((e) => {
              const activo = seleccionados.has(e.tenantId);
              return (
                <button
                  key={e.miembroId}
                  onClick={() => toggle(e.tenantId)}
                  className={`flex items-center gap-2.5 rounded-[10px] border px-3 py-2.5 text-left cursor-pointer transition-colors ${
                    activo
                      ? "border-ys-green bg-ys-green-bg"
                      : "border-ys-border hover:border-ys-green-border"
                  }`}
                >
                  <span
                    className={`w-[18px] h-[18px] rounded-md flex-none flex items-center justify-center border-[1.5px] ${
                      activo ? "bg-ys-green border-ys-green" : "border-[#c9cfcb] bg-white"
                    }`}
                  >
                    {activo && (
                      <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
                        <path d="m3 8.4 3.4 3L13 4.6" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </span>
                  <span className="text-[13px] font-bold text-ys-text truncate">
                    {e.nombre}
                  </span>
                  <span className="ml-auto text-[11.5px] font-mono text-ys-dim flex-none">
                    {e.tenantId}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {sinWhatsapp.length > 0 && (
          <div className="bg-ys-warn-bg border border-[#f0dcb4] rounded-lg px-3 py-2.5 flex flex-col gap-1">
            <span className="text-[12px] font-bold text-ys-warn-text">
              Sin WhatsApp configurado, no pueden recibirlo todavía:
            </span>
            <span className="text-[12px] font-medium text-ys-warn-text">
              {sinWhatsapp.map((e) => e.nombre).join(", ")}
            </span>
          </div>
        )}

        {error && (
          <div className="rounded-lg bg-ys-red-bg border border-ys-red-border text-ys-red-text px-3.5 py-2.5 text-[13px] font-medium">
            {error}
          </div>
        )}

        <div className="flex items-center gap-2.5 border-t border-ys-border-softest pt-4">
          <button
            onClick={onCancel}
            disabled={guardando}
            className="text-[13.5px] font-bold text-[#3f4844] bg-white border border-ys-border rounded-[10px] px-4 py-[11px] cursor-pointer hover:bg-[#f7f9f8] disabled:opacity-40"
          >
            Cancelar
          </button>
          <button
            onClick={handleAgregar}
            disabled={seleccionados.size === 0 || guardando}
            className={`ml-auto text-[13.5px] font-bold rounded-[10px] px-[18px] py-[11px] transition-all ${
              seleccionados.size > 0 && !guardando
                ? "text-white bg-ys-green cursor-pointer hover:bg-ys-green-hover"
                : "bg-ys-el2 text-ys-faint cursor-not-allowed"
            }`}
          >
            {guardando
              ? "Enviando a Meta..."
              : `Sumar (${seleccionados.size})`}
          </button>
        </div>
      </div>
    </div>
  );
}
