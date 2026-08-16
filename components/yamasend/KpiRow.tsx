"use client";

import type { KpiFilterKey } from "@/lib/types";

interface KpiCounts {
  total: number;
  clientes: number;
  ai: number;
  h24: number;
  caliente: number;
  tibio: number;
  frio: number;
}

interface KpiRowProps {
  counts: KpiCounts;
  activeFilters: Set<KpiFilterKey>;
  onSelectTotal: () => void;
  onToggleFilter: (key: KpiFilterKey) => void;
  onImportClick: () => void;
  onAnalyzeClick: () => void;
  importing: boolean;
}

export default function KpiRow({
  counts,
  activeFilters,
  onSelectTotal,
  onToggleFilter,
  onImportClick,
  onAnalyzeClick,
  importing,
}: KpiRowProps) {
  const isTotalOn = activeFilters.size === 0;

  return (
    <div
      className={`px-4 md:px-[38px] pt-4 md:pt-6 pb-4 flex flex-col gap-4 md:gap-5 ${
        importing ? "opacity-40 pointer-events-none grayscale" : ""
      }`}
    >
      {/* Acciones principales */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
        <button
          onClick={onImportClick}
          className="bg-white border border-ys-border rounded-2xl px-4 md:px-[18px] py-4 flex items-center gap-3.5 text-left cursor-pointer transition-colors hover:border-ys-green-border"
        >
          <div className="w-10 h-10 flex-none rounded-[13px] bg-ys-green-bg flex items-center justify-center">
            <svg width="19" height="19" viewBox="0 0 16 16" fill="none">
              <path d="M14 7.5c0 3-2.7 5.2-6 5.2-.7 0-1.4-.1-2-.3L2.5 13.5l.8-2.5A5 5 0 0 1 2 7.5C2 4.5 4.7 2.3 8 2.3s6 2.2 6 5.2Z" stroke="#12B76A" strokeWidth="1.5" strokeLinejoin="round" />
            </svg>
          </div>
          <div className="flex-1 min-w-0 flex flex-col gap-0.5">
            <div className="text-sm font-extrabold text-ys-text">Vincular WhatsApp</div>
            <div className="text-[12.5px] text-ys-dim font-medium truncate">
              Conectá tu celular para importar y analizar tus conversaciones.
            </div>
          </div>
          <span className="flex-none text-[13px] font-bold text-white bg-ys-green rounded-[10px] px-4 py-2.5">
            Vincular
          </span>
        </button>

        <button
          onClick={onAnalyzeClick}
          className="bg-white border border-ys-border rounded-2xl px-4 md:px-[18px] py-4 flex items-center gap-3.5 text-left cursor-pointer transition-colors hover:border-ys-green-border"
        >
          <div className="w-10 h-10 flex-none rounded-[13px] bg-ys-dark flex items-center justify-center">
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none" style={{ animation: "ys-spark 3.2s ease-in-out infinite" }}>
              <path d="m8 2 1.6 3.6L13 7l-3.4 1.4L8 12 6.4 8.4 3 7l3.4-1.4L8 2Z" stroke="#3ddb8f" strokeWidth="1.4" strokeLinejoin="round" />
            </svg>
          </div>
          <div className="flex-1 min-w-0 flex flex-col gap-0.5">
            <div className="text-sm font-extrabold text-ys-text">Analizar conversaciones</div>
            <div className="text-[12.5px] text-ys-dim font-medium truncate">
              Usá IA para detectar oportunidades comerciales entre tus contactos.
            </div>
          </div>
          <span className="flex-none text-[13px] font-bold text-ys-text bg-white border border-ys-green-border rounded-[10px] px-4 py-2.5">
            Analizar
          </span>
        </button>
      </div>

      {/* Métricas — también funcionan como filtros (funcionalidad real) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        <MetricCard
          value={counts.total}
          label="Contactos"
          active={isTotalOn}
          onClick={onSelectTotal}
          icon={
            <svg width="19" height="19" viewBox="0 0 16 16" fill="none">
              <circle cx="6" cy="5.5" r="2.5" stroke="currentColor" strokeWidth="1.5" />
              <path d="M2 13.5c0-2.2 1.8-3.5 4-3.5s4 1.3 4 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <path d="M11 4.2a2.5 2.5 0 0 1 0 4.6M12.5 13.5c0-1.5-.5-2.6-1.4-3.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          }
          iconBg="bg-ys-el2"
          iconColor="text-[#5d6560]"
        />
        <MetricCard
          value={counts.caliente}
          label="Leads calientes"
          active={activeFilters.has("caliente")}
          onClick={() => onToggleFilter("caliente")}
          icon={
            <svg width="19" height="19" viewBox="0 0 16 16" fill="none">
              <path d="M8 13.8a3.7 3.7 0 0 0 3.7-3.7c0-3.2-3.7-7.9-3.7-7.9S4.3 6.9 4.3 10.1A3.7 3.7 0 0 0 8 13.8Z" stroke="#12B76A" strokeWidth="1.5" strokeLinejoin="round" />
            </svg>
          }
          iconBg="bg-ys-green-bg"
          iconColor="text-ys-green-text"
        />
        <MetricCard
          value={counts.tibio}
          label="Leads tibios"
          active={activeFilters.has("tibio")}
          onClick={() => onToggleFilter("tibio")}
          icon={
            <svg width="19" height="19" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="2.9" stroke="#c07a12" strokeWidth="1.5" />
              <path d="M8 1.4v1.6M8 13v1.6M1.4 8h1.6M13 8h1.6M3.3 3.3l1.2 1.2M11.5 11.5l1.2 1.2M12.7 3.3l-1.2 1.2M4.5 11.5l-1.2 1.2" stroke="#c07a12" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          }
          iconBg="bg-ys-warn-bg"
          iconColor="text-ys-warn-text"
        />
        <MetricCard
          value={counts.frio}
          label="Leads fríos"
          active={activeFilters.has("frio")}
          onClick={() => onToggleFilter("frio")}
          icon={
            <svg width="19" height="19" viewBox="0 0 16 16" fill="none">
              <path d="M8 1.6v12.8M2.5 4.8l11 6.4M13.5 4.8l-11 6.4M6.4 3.2 8 4.8l1.6-1.6M6.4 12.8 8 11.2l1.6 1.6M3.6 7.1l-1 .9 1 .9M12.4 7.1l1 .9-1 .9" stroke="#8a908c" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          }
          iconBg="bg-ys-el2"
          iconColor="text-ys-dim"
        />
      </div>

      {/* Filtros adicionales reales (Clientes / lista AI / ventana 24h) — no
          tienen equivalente visual en el diseño de Contactos. Comentados a
          pedido de Bauti (2026-08-16): no aportan valor visual en la nueva
          UI, pero se dejan comentados por si Pato prefiere mantenerlos.
          Para reactivarlos, descomentar el bloque de abajo. */}
      {/*
      <div className="flex flex-wrap gap-2">
        <FilterChip
          label={`Clientes (${counts.clientes})`}
          active={activeFilters.has("cliente")}
          onClick={() => onToggleFilter("cliente")}
        />
        <FilterChip
          label={`En lista de IA (${counts.ai})`}
          active={activeFilters.has("ai")}
          onClick={() => onToggleFilter("ai")}
        />
        <FilterChip
          label={`Ventana 24hs (${counts.h24})`}
          active={activeFilters.has("24h")}
          onClick={() => onToggleFilter("24h")}
        />
      </div>
      */}
    </div>
  );
}

function MetricCard({
  value,
  label,
  icon,
  iconBg,
  iconColor,
  active,
  onClick,
}: {
  value: number;
  label: string;
  icon: React.ReactNode;
  iconBg: string;
  iconColor: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`text-left bg-white border rounded-2xl px-4 md:px-5 py-[18px] flex items-center gap-3 md:gap-[13px] cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-[var(--shadow-card)] ${
        active ? "border-ys-green" : "border-ys-border"
      }`}
    >
      <div className={`w-10 h-10 flex-none rounded-[13px] flex items-center justify-center ${iconBg} ${iconColor}`}>
        {icon}
      </div>
      <div className="flex flex-col gap-0.5 min-w-0">
        <div className="font-mono text-xl md:text-2xl font-medium tracking-[-0.03em] text-ys-text">
          {value}
        </div>
        <div className="text-[12.5px] text-ys-muted font-semibold truncate">{label}</div>
      </div>
    </button>
  );
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- se mantiene para reactivar los chips comentados arriba si Pato los quiere de vuelta
function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`text-[12.5px] font-bold rounded-full px-3.5 py-2 cursor-pointer transition-colors ${
        active
          ? "bg-ys-green text-white"
          : "bg-white border border-ys-border text-[#3f4844] hover:border-ys-green-border"
      }`}
    >
      {label}
    </button>
  );
}
