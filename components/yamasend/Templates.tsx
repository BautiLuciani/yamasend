"use client";

import { useMemo, useState } from "react";
import type { Template } from "@/lib/types";

interface TemplatesProps {
  templates: Template[];
  onNewTemplate: () => void;
  /** false esconde los botones de alta. El gate real está en el server action. */
  /**
   * false NO esconde el botón: lo deja visible y bloqueado. Esconderlo hacía
   * que el permiso revocado fuera invisible —la sección simplemente perdía el
   * botón sin explicación—. Ahora se ve, y al tocarlo avisa quién puede
   * habilitarlo. El gate real sigue estando en el server action.
   */
  puedeCrear?: boolean;
  /** Se dispara al tocar el botón sin permiso. Muestra el aviso. */
  onSinPermiso?: () => void;
  onOpenTemplate: (tpl: Template) => void;
}

const CATEGORIA_LABEL: Record<string, string> = {
  marketing: "Marketing",
  utility: "Utilidad",
  authentication: "Autenticación",
  service: "Servicio",
};

function StatusBadge({ status }: { status: Template["status"] }) {
  if (status === "verificado")
    return (
      <span className="inline-flex items-center gap-1.5 flex-none text-[11.5px] font-bold text-ys-green-text bg-ys-green-bg rounded-full px-2.5 py-1">
        <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
          <path d="m3 8.4 3.4 3L13 4.6" stroke="#067647" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Aprobado
      </span>
    );
  if (status === "enviado")
    return (
      <span className="inline-flex items-center gap-1.5 flex-none text-[11.5px] font-bold text-ys-warn-text bg-ys-warn-bg rounded-full px-2.5 py-1">
        <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="8" r="6" stroke="#c07a12" strokeWidth="1.8" />
          <path d="M8 4.6v3.6l2.2 1.3" stroke="#c07a12" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
        En revisión
      </span>
    );
  if (status === "borrador")
    return (
      <span className="inline-flex items-center gap-1.5 flex-none text-[11.5px] font-bold text-ys-dim bg-ys-el2 rounded-full px-2.5 py-1">
        <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
          <path d="M4 12.5V4.5a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v8" stroke="#7b837e" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M4 12.5h8" stroke="#7b837e" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
        Borrador
      </span>
    );
  // rechazado o error
  return (
    <span className="inline-flex items-center gap-1.5 flex-none text-[11.5px] font-bold text-ys-red-text bg-ys-red-bg rounded-full px-2.5 py-1">
      <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
        <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" stroke="#a8443b" strokeWidth="2.2" strokeLinecap="round" />
      </svg>
      {status === "error" ? "Error" : "Rechazado"}
    </span>
  );
}

export default function Templates({ templates, onNewTemplate, onOpenTemplate, puedeCrear = true, onSinPermiso }: TemplatesProps) {
  const [query, setQuery] = useState("");
  const [estado, setEstado] = useState<
    "todos" | "verificado" | "enviado" | "rechazado" | "borrador"
  >("todos");

  const counts = useMemo(
    () => ({
      total: templates.length,
      aprobados: templates.filter((t) => t.status === "verificado").length,
      revision: templates.filter((t) => t.status === "enviado").length,
      rechazados: templates.filter(
        (t) => t.status === "rechazado" || t.status === "error",
      ).length,
    }),
    [templates],
  );

  const filtered = templates.filter((t) => {
    if (estado !== "todos") {
      const matches =
        estado === "rechazado"
          ? t.status === "rechazado" || t.status === "error"
          : t.status === estado;
      if (!matches) return false;
    }
    if (query && !t.nombre.toLowerCase().includes(query.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="flex-1 min-w-0 bg-ys-bg px-4 md:px-[38px] pt-3 md:pt-[34px] pb-7 md:pb-10 flex flex-col gap-[18px] md:gap-[22px] overflow-y-auto">
      <div className="flex items-end gap-5 flex-wrap">
        <div className="flex flex-col gap-1.5">
          <div className="text-2xl md:text-[28px] font-extrabold tracking-[-0.025em] text-ys-text">
            Templates
          </div>
          <div className="text-sm md:text-[15px] text-ys-muted font-medium">
            Creá y administrá tus mensajes de WhatsApp.
          </div>
        </div>
        <button
          onClick={puedeCrear ? onNewTemplate : onSinPermiso}
          className={`ml-auto w-full md:w-auto justify-center flex items-center gap-2 text-[13.5px] font-bold px-[17px] py-[11px] rounded-[10px] transition-all ${
            puedeCrear
              ? "bg-ys-green text-white cursor-pointer hover:bg-ys-green-hover hover:-translate-y-px shadow-[var(--shadow-cta)]"
              : "bg-ys-el2 text-ys-faint cursor-not-allowed"
          }`}
        >
          {puedeCrear ? (
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path d="M4.2 7.2V5.4a3.8 3.8 0 0 1 7.6 0v1.8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                <rect x="3" y="7.2" width="10" height="6.3" rx="1.8" stroke="currentColor" strokeWidth="1.6" />
              </svg>
          )}
          Nuevo template
        </button>
      </div>

      {templates.length > 0 && (
        <div className="flex items-center gap-3.5 flex-wrap text-[13px] text-ys-muted font-semibold">
          <span>
            <span className="font-mono text-ys-text">{counts.total}</span> templates
          </span>
          <span className="w-px h-3.5 bg-[#e2e5e3]" />
          <span className="inline-flex items-center gap-1.5">
            <span className="w-[7px] h-[7px] rounded-full bg-ys-green" />
            <span className="font-mono text-ys-text">{counts.aprobados}</span> aprobados
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-[7px] h-[7px] rounded-full border-[1.5px]" style={{ borderColor: "#c07a12", background: "linear-gradient(90deg,#c07a12 50%,transparent 50%)" }} />
            <span className="font-mono text-ys-text">{counts.revision}</span> en revisión
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-[7px] h-[7px] rounded-full bg-[#c9584f]" />
            <span className="font-mono text-ys-text">{counts.rechazados}</span> rechazado
          </span>
        </div>
      )}

      {templates.length > 0 && (
        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="flex items-center gap-2.5 bg-white border border-ys-border rounded-[10px] px-3.5 py-2.5 w-full md:w-[260px]">
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
              <circle cx="7" cy="7" r="4.5" stroke="#9aa19c" strokeWidth="1.5" />
              <path d="m10.5 10.5 3 3" stroke="#9aa19c" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar template..."
              className="flex-1 min-w-0 border-none outline-none bg-transparent text-[13.5px] font-semibold text-ys-text"
            />
          </div>
          <div className="flex gap-[3px] bg-ys-el2 rounded-[10px] p-[3px] overflow-x-auto">
            {(
              [
                { key: "todos", label: "Todos" },
                { key: "verificado", label: "Aprobados" },
                { key: "enviado", label: "En revisión" },
                { key: "rechazado", label: "Rechazados" },
                { key: "borrador", label: "Borradores" },
              ] as const
            ).map((f) => (
              <button
                key={f.key}
                onClick={() => setEstado(f.key)}
                className={`flex-none text-[12.5px] rounded-lg px-3.5 py-[7px] cursor-pointer transition-colors ${
                  estado === f.key
                    ? "font-bold text-ys-text bg-white shadow-[0_1px_2px_rgba(16,24,20,0.07)]"
                    : "font-semibold text-[#7b837e]"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {templates.length === 0 && (
        <div className="bg-white border border-ys-border rounded-2xl py-16 px-6 flex flex-col items-center gap-3.5">
          <div className="w-[58px] h-[58px] rounded-[18px] bg-ys-green-bg flex items-center justify-center">
            <svg width="26" height="26" viewBox="0 0 16 16" fill="none">
              <rect x="2.5" y="2.5" width="11" height="11" rx="2" stroke="#12B76A" strokeWidth="1.5" />
              <path d="M2.5 6h11M6 6v7.5" stroke="#12B76A" strokeWidth="1.5" />
            </svg>
          </div>
          <div className="text-[19px] font-extrabold tracking-[-0.02em] text-ys-text">
            Creá tu primer template
          </div>
          <div className="text-sm text-ys-muted font-medium text-center max-w-[420px]">
            Los templates son los mensajes que vas a utilizar para comunicarte con tus contactos.
          </div>
          <button
            onClick={puedeCrear ? onNewTemplate : onSinPermiso}
            className={`mt-1.5 flex items-center gap-2 text-[13.5px] font-bold rounded-[10px] px-[18px] py-2.5 transition-all ${
              puedeCrear
                ? "text-white bg-ys-green cursor-pointer hover:bg-ys-green-hover hover:-translate-y-px"
                : "bg-ys-el2 text-ys-faint cursor-not-allowed"
            }`}
          >
            {puedeCrear ? (
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path d="M4.2 7.2V5.4a3.8 3.8 0 0 1 7.6 0v1.8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                <rect x="3" y="7.2" width="10" height="6.3" rx="1.8" stroke="currentColor" strokeWidth="1.6" />
              </svg>
            )}
            Crear template
          </button>
        </div>
      )}

      {templates.length > 0 && filtered.length === 0 && (
        <div className="bg-white border border-ys-border rounded-2xl py-[52px] px-6 flex flex-col items-center gap-2.5">
          <div className="text-base font-extrabold text-ys-text">Sin resultados</div>
          <div className="text-[13.5px] text-ys-muted font-medium">
            Probá con otro nombre o cambiá los filtros.
          </div>
        </div>
      )}

      {filtered.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((t) => (
            <button
              key={t.id}
              onClick={() => onOpenTemplate(t)}
              /* Los que bajó la empresa van en violeta: el empleado no los
                 creó él y no los puede editar, así que necesita distinguirlos
                 de un vistazo. Se cambia el fondo, no solo un detalle, para
                 que la diferencia se lea sin buscarla. */
              className={`text-left border rounded-2xl px-5 py-[18px] flex flex-col gap-3.5 cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-[var(--shadow-card)] ${
                t.esDeEmpresa
                  ? "bg-[#faf8ff] border-[#ddd3f5] hover:border-[#a889e8]"
                  : "bg-white border-ys-border hover:border-ys-green-border"
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0 flex flex-col gap-1">
                  <div className="font-mono text-sm text-ys-text truncate">{t.nombre}</div>
                  <div className="text-xs text-ys-dim font-semibold">
                    {CATEGORIA_LABEL[t.tipo ?? "marketing"] ?? "Marketing"}
                  </div>
                </div>
                <StatusBadge status={t.status} />
              </div>

              {t.esDeEmpresa && (
                <span className="inline-flex items-center gap-1.5 self-start text-[11.5px] font-bold text-[#5b3fa8] bg-[#f0eafd] border border-[#ddd3f5] rounded-full px-2.5 py-1">
                  <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
                    <rect x="2.5" y="2.5" width="11" height="11" rx="1.5" stroke="#5b3fa8" strokeWidth="1.6" />
                    <path d="M5.5 5.5h1.2M9.3 5.5h1.2M5.5 8h1.2M9.3 8h1.2M6.5 13.5V11h3v2.5" stroke="#5b3fa8" strokeWidth="1.6" strokeLinecap="round" />
                  </svg>
                  De tu empresa
                </span>
              )}

              <div
                className={`border rounded-xl px-3.5 py-3 text-[13px] text-[#3f4844] leading-[1.5] font-medium line-clamp-3 ${
                  t.esDeEmpresa
                    ? "bg-white border-[#e6dffa]"
                    : "bg-[#fbfcfb] border-ys-border-soft"
                }`}
              >
                {t.contenido}
              </div>
              <div
                className={`flex items-center justify-end border-t pt-3 ${
                  t.esDeEmpresa ? "border-[#e6dffa]" : "border-ys-border-softer"
                }`}
              >
                {/* Sin precio en USD: la app se maneja con créditos (oct 2026). */}
                <div className="text-[12.5px] font-bold text-ys-faint">Ver detalle →</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
