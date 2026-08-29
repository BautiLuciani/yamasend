"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Campaign, CampaignStatus } from "@/lib/types";

interface CampanasProps {
  campaigns: Campaign[];
  onNewCampaign: () => void;
  /** false esconde los botones de alta. El gate real está en el server action. */
  puedeCrear?: boolean;
  onOpenCampaign: (campaignId: string) => void;
}

const ESTADO_CONFIG: Record<
  CampaignStatus,
  { label: string; text: string; bg: string; dot: string }
> = {
  borrador: { label: "Borrador", text: "text-[#5d6560]", bg: "bg-ys-el2", dot: "border-[#8a908c]" },
  programada: { label: "Programada", text: "text-[#3f4844]", bg: "bg-ys-el2", dot: "border-[#5d6560]" },
  enviando: { label: "Enviando", text: "text-ys-warn-text", bg: "bg-ys-warn-bg", dot: "bg-[#c07a12]" },
  enviado: { label: "Enviado", text: "text-ys-green-text", bg: "bg-ys-green-bg", dot: "bg-ys-green" },
  error: { label: "Error", text: "text-ys-red-text", bg: "bg-ys-red-bg", dot: "bg-[#a8443b]" },
  cancelado: { label: "Cancelado", text: "text-[#5d6560]", bg: "bg-ys-el2", dot: "bg-[#8a908c]" },
};

const ESTADO_FILTROS: { key: CampaignStatus | "todas"; label: string; menuLabel: string }[] = [
  { key: "todas", label: "Todos los estados", menuLabel: "Todas" },
  { key: "borrador", label: "Borrador", menuLabel: "Borrador" },
  { key: "programada", label: "Programadas", menuLabel: "Programadas" },
  { key: "enviando", label: "Enviando", menuLabel: "Enviando" },
  { key: "enviado", label: "Enviadas", menuLabel: "Enviadas" },
  { key: "error", label: "Error", menuLabel: "Error" },
  { key: "cancelado", label: "Canceladas", menuLabel: "Canceladas" },
];

type Periodo = "todo" | "7d" | "30d" | "proximas";

const PERIODO_FILTROS: { key: Periodo; label: string }[] = [
  { key: "todo", label: "Todo el tiempo" },
  { key: "7d", label: "Últimos 7 días" },
  { key: "30d", label: "Últimos 30 días" },
  { key: "proximas", label: "Próximas" },
];

function EstadoBadge({ estado }: { estado: CampaignStatus }) {
  const cfg = ESTADO_CONFIG[estado];
  const isDotOutline = estado === "borrador" || estado === "programada";
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11.5px] font-bold rounded-full px-2.5 py-1 ${cfg.text} ${cfg.bg}`}>
      <span className={`w-[6px] h-[6px] rounded-full ${isDotOutline ? `border-[1.5px] ${cfg.dot}` : cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

function formatFecha(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}`;
}

function useClickOutside(onOutside: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onOutside();
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onOutside]);
  return ref;
}

export default function Campanas({ campaigns, onNewCampaign, onOpenCampaign, puedeCrear = true }: CampanasProps) {
  const [query, setQuery] = useState("");
  const [estadoFiltro, setEstadoFiltro] = useState<CampaignStatus | "todas">("todas");
  const [periodoFiltro, setPeriodoFiltro] = useState<Periodo>("todo");
  const [estadoMenuOpen, setEstadoMenuOpen] = useState(false);
  const [periodoMenuOpen, setPeriodoMenuOpen] = useState(false);

  const estadoMenuRef = useClickOutside(() => setEstadoMenuOpen(false));
  const periodoMenuRef = useClickOutside(() => setPeriodoMenuOpen(false));

  const [ahora] = useState(() => Date.now());

  const filtered = useMemo(() => {
    const DIA_MS = 24 * 60 * 60 * 1000;

    return campaigns.filter((c) => {
      if (!c.nombre.toLowerCase().includes(query.toLowerCase())) return false;
      if (estadoFiltro !== "todas" && c.status !== estadoFiltro) return false;

      if (periodoFiltro === "proximas") {
        if (!c.fechaProgramada) return false;
        if (new Date(c.fechaProgramada).getTime() < ahora) return false;
      } else if (periodoFiltro === "7d" || periodoFiltro === "30d") {
        const ref = c.enviadoAt ?? c.createdAt;
        if (!ref) return false;
        const dias = periodoFiltro === "7d" ? 7 : 30;
        if (ahora - new Date(ref).getTime() > dias * DIA_MS) return false;
      }

      return true;
    });
  }, [campaigns, query, estadoFiltro, periodoFiltro, ahora]);

  const activas = campaigns.filter((c) => c.status === "enviando").length;
  const programadas = campaigns.filter((c) => c.status === "programada").length;

  const estadoLabel = ESTADO_FILTROS.find((f) => f.key === estadoFiltro)?.label ?? "Todos los estados";
  const periodoLabel = PERIODO_FILTROS.find((f) => f.key === periodoFiltro)?.label ?? "Todo el tiempo";

  const hayCampanas = campaigns.length > 0;

  return (
    <div className="flex-1 min-w-0 bg-ys-bg px-4 md:px-[38px] pt-3 md:pt-[34px] pb-7 md:pb-10 flex flex-col gap-[18px] md:gap-[22px] overflow-y-auto">
      <div className="flex items-end gap-5 flex-wrap">
        <div className="flex flex-col gap-1.5">
          <div className="text-2xl md:text-[28px] font-extrabold tracking-[-0.025em] text-ys-text">
            Campañas
          </div>
          <div className="text-sm md:text-[15px] text-ys-muted font-medium">
            Creá, enviá y analizá tus campañas de WhatsApp.
          </div>
        </div>
        {puedeCrear && (
          <button
            onClick={onNewCampaign}
            className="ml-auto w-full md:w-auto justify-center flex items-center gap-2 bg-ys-green text-white text-[13.5px] font-bold px-[17px] py-[11px] rounded-[10px] cursor-pointer transition-all hover:bg-ys-green-hover hover:-translate-y-px shadow-[var(--shadow-cta)]"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M8 3v10M3 8h10" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" />
            </svg>
            Nueva campaña
          </button>
        )}
      </div>

      <div className="flex items-center gap-3.5 flex-wrap text-[13px] text-ys-muted font-semibold">
        <span>
          <span className="font-mono text-ys-text">{campaigns.length}</span> campañas
        </span>
        <span className="w-px h-3.5 bg-[#e2e5e3]" />
        <span className="inline-flex items-center gap-1.5">
          <span className="w-[7px] h-[7px] rounded-full bg-[#c07a12]" />
          <span className="font-mono text-ys-text">{activas}</span> activas
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-[7px] h-[7px] rounded-full border-[1.5px] border-[#8a908c]" />
          <span className="font-mono text-ys-text">{programadas}</span> programadas
        </span>
      </div>

      <div className="flex items-center gap-2.5 flex-wrap">
        <div className="flex items-center gap-2.5 bg-white border border-ys-border rounded-[10px] px-3.5 py-2.5 w-full md:w-[260px]">
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
            <circle cx="7" cy="7" r="4.5" stroke="#9aa19c" strokeWidth="1.5" />
            <path d="m10.5 10.5 3 3" stroke="#9aa19c" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar campaña..."
            className="flex-1 min-w-0 border-none outline-none bg-transparent text-[13.5px] font-semibold text-ys-text"
          />
        </div>

        {/* Filtro de Estado */}
        <div className="relative" ref={estadoMenuRef}>
          <button
            onClick={() => {
              setEstadoMenuOpen((v) => !v);
              setPeriodoMenuOpen(false);
            }}
            className="flex items-center gap-2 bg-white border border-ys-border rounded-[10px] px-3.5 py-2.5 text-[13px] font-bold text-[#3f4844] cursor-pointer transition-colors hover:bg-[#f7f9f8] hover:border-[#d8ded9]"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M2.5 4h11M4.5 8h7M6.5 12h3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
            {estadoLabel}
          </button>
          {estadoMenuOpen && (
            <div className="absolute top-[calc(100%+6px)] left-0 w-[184px] bg-white border border-ys-border rounded-xl p-1.5 shadow-[0_12px_28px_rgba(16,24,20,0.12)] flex flex-col gap-0.5 z-30">
              {ESTADO_FILTROS.map((f) => (
                <div
                  key={f.key}
                  onClick={() => {
                    setEstadoFiltro(f.key);
                    setEstadoMenuOpen(false);
                  }}
                  className="px-[11px] py-2.5 rounded-lg text-[13px] font-semibold text-[#3f4844] cursor-pointer transition-colors hover:bg-[#f5f7f6]"
                >
                  {f.menuLabel}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Filtro de Período */}
        <div className="relative" ref={periodoMenuRef}>
          <button
            onClick={() => {
              setPeriodoMenuOpen((v) => !v);
              setEstadoMenuOpen(false);
            }}
            className="flex items-center gap-2 bg-white border border-ys-border rounded-[10px] px-3.5 py-2.5 text-[13px] font-bold text-[#3f4844] cursor-pointer transition-colors hover:bg-[#f7f9f8] hover:border-[#d8ded9]"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <rect x="2.5" y="3.5" width="11" height="10" rx="2" stroke="currentColor" strokeWidth="1.5" />
              <path d="M2.5 6.5h11M5.5 2v3M10.5 2v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            {periodoLabel}
          </button>
          {periodoMenuOpen && (
            <div className="absolute top-[calc(100%+6px)] left-0 w-[170px] bg-white border border-ys-border rounded-xl p-1.5 shadow-[0_12px_28px_rgba(16,24,20,0.12)] flex flex-col gap-0.5 z-30">
              {PERIODO_FILTROS.map((f) => (
                <div
                  key={f.key}
                  onClick={() => {
                    setPeriodoFiltro(f.key);
                    setPeriodoMenuOpen(false);
                  }}
                  className="px-[11px] py-2.5 rounded-lg text-[13px] font-semibold text-[#3f4844] cursor-pointer transition-colors hover:bg-[#f5f7f6]"
                >
                  {f.label}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {!hayCampanas ? (
        <div className="bg-white border border-ys-border rounded-2xl py-16 px-6 flex flex-col items-center gap-3.5">
          <div className="w-[58px] h-[58px] rounded-[18px] bg-ys-green-bg flex items-center justify-center">
            <svg width="26" height="26" viewBox="0 0 16 16" fill="none">
              <path d="M2.5 6.5v3l7 3.5v-10l-7 3.5Z" stroke="#12B76A" strokeWidth="1.5" strokeLinejoin="round" />
              <path d="M12 6v4" stroke="#12B76A" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </div>
          <div className="text-[19px] font-extrabold tracking-[-0.02em] text-ys-text">
            Todavía no se crearon campañas
          </div>
          <div className="text-sm text-ys-muted font-medium text-center max-w-[440px]">
            Elegí una audiencia, seleccioná un mensaje y empezá a comunicarte con tus contactos.
          </div>
          {puedeCrear && (
            <button
              onClick={onNewCampaign}
              className="mt-1.5 flex items-center gap-2 text-[13.5px] font-bold text-white bg-ys-green rounded-[10px] px-[18px] py-2.5 cursor-pointer transition-all hover:bg-ys-green-hover hover:-translate-y-px"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path d="M8 3v10M3 8h10" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" />
              </svg>
              Nueva campaña
            </button>
          )}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white border border-ys-border rounded-2xl py-16 px-6 flex flex-col items-center gap-3.5">
          <div className="w-[58px] h-[58px] rounded-[18px] bg-ys-green-bg flex items-center justify-center">
            <svg width="26" height="26" viewBox="0 0 16 16" fill="none">
              <circle cx="7" cy="7" r="4.5" stroke="#12B76A" strokeWidth="1.5" />
              <path d="m10.5 10.5 3 3" stroke="#12B76A" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </div>
          <div className="text-[19px] font-extrabold tracking-[-0.02em] text-ys-text">
            Sin resultados
          </div>
          <div className="text-sm text-ys-muted font-medium text-center max-w-[440px]">
            Probá con otro nombre o cambiá los filtros.
          </div>
        </div>
      ) : (
        <div className="bg-white border border-ys-border rounded-2xl overflow-hidden">
          <div className="hidden md:grid grid-cols-[2.4fr_1.5fr_1.5fr_1.25fr_1.15fr] items-center px-6 py-[11px] bg-[#fbfcfb] border-b border-ys-border-soft text-[11px] font-extrabold tracking-[0.07em] uppercase text-ys-dimmer">
            <div>Campaña</div>
            <div>Audiencia</div>
            <div>Template</div>
            <div>Fecha</div>
            <div>Estado</div>
          </div>
          {filtered.map((c, i) => (
            <div
              key={c.id}
              onClick={() => onOpenCampaign(c.id)}
              className={`grid grid-cols-1 md:grid-cols-[2.4fr_1.5fr_1.5fr_1.25fr_1.15fr] items-center gap-1.5 md:gap-0 px-4 md:px-6 py-3.5 cursor-pointer transition-colors hover:bg-[#fbfcfb] ${
                i > 0 ? "border-t border-ys-border-softer" : ""
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-[34px] h-[34px] flex-none rounded-[11px] bg-ys-green-bg hidden md:flex items-center justify-center">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M2.5 6.5v3l7 3.5v-10l-7 3.5Z" stroke="#067647" strokeWidth="1.5" strokeLinejoin="round" />
                    <path d="M12 6v4" stroke="#067647" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </div>
                <div className="min-w-0 flex flex-col gap-0.5">
                  <div className="text-sm font-bold text-ys-text truncate">{c.nombre}</div>
                  <div className="hidden md:block font-mono text-[11.5px] text-ys-dimmer">
                    {c.contactosCount} destinatarios
                  </div>
                </div>
                <div className="md:hidden ml-auto flex-none">
                  <EstadoBadge estado={c.status} />
                </div>
              </div>
              <div className="hidden md:block text-[13px] font-semibold text-[#3f4844]">
                {c.listaNombre ?? "—"}
              </div>
              <div className="hidden md:block font-mono text-[12.5px] text-ys-muted">
                {c.templateNombre ?? "—"}
              </div>
              <div className="hidden md:block font-mono text-[12.5px] text-ys-muted">
                {formatFecha(c.fechaProgramada ?? c.enviadoAt ?? c.createdAt)}
              </div>
              <div className="hidden md:block">
                <EstadoBadge estado={c.status} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
