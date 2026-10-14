"use client";

import { useState } from "react";
import type { EmpleadoResumen } from "@/lib/types";
import {
  CATEGORIA_TEMPLATE_UNICA,
  VARIABLES_TEMPLATE_HABILITADAS,
  validarVariablesTemplate,
} from "@/lib/templates/config";

// Selector de categoría desactivado (2026-10): por ahora todos los templates
// son de Marketing (lib/templates/config.ts). Se deja la lista comentada
// para poder reactivarlo.
// const CATEGORIAS = [
//   { key: "marketing", label: "Marketing" },
//   { key: "utility", label: "Utilidad" },
//   { key: "authentication", label: "Autenticación" },
// ] as const;

/**
 * Alta de un template de empresa.
 *
 * La diferencia con el modal del empleado es el paso de reparto: Meta aprueba
 * templates por número de WhatsApp Business, así que hay que elegir a qué
 * empleados va y se dispara una solicitud por cada uno, bajo su propio número.
 * Por eso se muestra explícitamente cuántas solicitudes se van a generar: no
 * es una sola operación, y conviene que la empresa lo sepa antes de confirmar.
 */
export default function EmpresaTemplateCreateModal({
  open,
  empleados,
  onCancel,
  onCrear,
}: {
  open: boolean;
  empleados: EmpleadoResumen[];
  onCancel: () => void;
  onCrear: (
    nombre: string,
    contenido: string,
    categoria: string,
    tenantIds: string[],
  ) => Promise<{ ok: boolean; error: string | null }>;
}) {
  const [nombre, setNombre] = useState("");
  const [contenido, setContenido] = useState("");
  // Fija: el selector ya no se muestra y el servidor fuerza Marketing igual.
  const categoria = CATEGORIA_TEMPLATE_UNICA;
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set());
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  // Un empleado sin WhatsApp configurado no puede recibir la aprobación de
  // Meta, así que se lo muestra deshabilitado y explicado en vez de dejar que
  // la empresa lo elija y el envío falle en silencio.
  const elegibles = empleados.filter(
    (e) => e.estado === "activo" && e.whatsappConfigurado,
  );
  const noElegibles = empleados.filter(
    (e) => e.estado === "activo" && !e.whatsappConfigurado,
  );

  // Variables deshabilitadas: un {{1}} escrito a mano no se puede mandar a
  // Meta (el servidor también lo rechaza).
  const errorVariables = validarVariablesTemplate(contenido);

  const valido =
    nombre.trim().length >= 3 &&
    contenido.trim().length > 10 &&
    seleccionados.size > 0 &&
    !errorVariables;

  function toggle(tenantId: string) {
    setSeleccionados((prev) => {
      const next = new Set(prev);
      if (next.has(tenantId)) next.delete(tenantId);
      else next.add(tenantId);
      return next;
    });
  }

  async function handleCrear() {
    if (!valido) return;
    setGuardando(true);
    setError(null);
    const res = await onCrear(
      nombre.trim(),
      contenido.trim(),
      categoria,
      Array.from(seleccionados),
    );
    setGuardando(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setNombre("");
    setContenido("");
    setSeleccionados(new Set());
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center px-4 py-6">
      <div
        className="absolute inset-0 bg-[rgba(16,24,20,0.45)]"
        onClick={guardando ? undefined : onCancel}
      />
      <div className="relative w-full max-w-[560px] max-h-full overflow-y-auto bg-white border border-ys-border rounded-2xl p-5 md:p-6 flex flex-col gap-4 shadow-[0_20px_48px_rgba(16,24,20,0.18)]">
        <div className="flex flex-col gap-1">
          <h2 className="text-[17px] font-extrabold text-ys-text">
            Nuevo template para el equipo
          </h2>
          <p className="text-[12.5px] text-ys-muted font-medium leading-snug">
            Se envía a aprobar a Meta una vez por cada empleado que elijas, con
            su propio número de WhatsApp. Lo van a poder usar apenas se apruebe.
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-[12.5px] font-extrabold text-ys-text">Nombre</span>
          <input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="promo_verano"
            className="bg-white border border-ys-border rounded-[10px] px-3.5 py-2.5 text-[13.5px] font-semibold text-ys-text outline-none focus:border-ys-green-border font-mono"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-[12.5px] font-extrabold text-ys-text">Mensaje</span>
          <textarea
            value={contenido}
            onChange={(e) => setContenido(e.target.value)}
            rows={4}
            placeholder={
              VARIABLES_TEMPLATE_HABILITADAS
                ? "Hola {{1}}, tenemos novedades para vos..."
                : "Hola, tenemos novedades para vos..."
            }
            className="bg-white border border-ys-border rounded-[10px] px-3.5 py-2.5 text-[13.5px] font-semibold text-ys-text outline-none focus:border-ys-green-border resize-none leading-[1.5]"
          />
          {errorVariables && (
            <span className="text-[12px] text-ys-red-text font-semibold">
              {errorVariables}
            </span>
          )}
        </div>

        <div className="flex flex-col gap-2 border-t border-ys-border-softest pt-4">
          <span className="text-[12.5px] font-extrabold text-ys-text">
            ¿Quiénes lo van a usar?
          </span>

          {elegibles.length === 0 && (
            <p className="text-[12.5px] text-ys-muted font-medium bg-ys-el2 rounded-lg px-3 py-2.5">
              Todavía no tenés empleados activos con WhatsApp configurado.
            </p>
          )}

          <div className="flex flex-col gap-1.5 max-h-[190px] overflow-y-auto">
            {elegibles.map((e) => {
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
                      activo
                        ? "bg-ys-green border-ys-green"
                        : "border-[#c9cfcb] bg-white"
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

          {noElegibles.length > 0 && (
            <div className="bg-ys-warn-bg border border-[#f0dcb4] rounded-lg px-3 py-2.5 flex flex-col gap-1">
              <span className="text-[12px] font-bold text-ys-warn-text">
                Sin WhatsApp configurado, no pueden recibirlo todavía:
              </span>
              <span className="text-[12px] font-medium text-ys-warn-text">
                {noElegibles.map((e) => e.nombre).join(", ")}
              </span>
            </div>
          )}
        </div>

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
            onClick={handleCrear}
            disabled={!valido || guardando}
            className={`ml-auto text-[13.5px] font-bold rounded-[10px] px-[18px] py-[11px] transition-all ${
              valido && !guardando
                ? "text-white bg-ys-green cursor-pointer hover:bg-ys-green-hover"
                : "bg-ys-el2 text-ys-faint cursor-not-allowed"
            }`}
          >
            {guardando
              ? "Enviando a Meta..."
              : `Crear y enviar (${seleccionados.size})`}
          </button>
        </div>
      </div>
    </div>
  );
}
