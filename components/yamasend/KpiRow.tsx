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
  importing: boolean;
}

export default function KpiRow({
  counts,
  activeFilters,
  onSelectTotal,
  onToggleFilter,
  onImportClick,
  importing,
}: KpiRowProps) {
  const isTotalOn = activeFilters.size === 0;

  return (
    <div
      className={`flex gap-1.5 px-4 py-2 border-b border-ys-border flex-shrink-0 ${
        importing ? "[&>*]:opacity-35 [&>*]:pointer-events-none [&>*]:grayscale" : ""
      }`}
    >
      <button
        onClick={onImportClick}
        title="Importar contactos de WhatsApp"
        className="flex-none w-[72px] flex flex-col items-center justify-center gap-1 rounded-lg border-[1.5px] border-dashed border-ys-dim hover:border-ys-muted cursor-pointer transition-colors"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--ys-muted)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="5" y="2" width="14" height="20" rx="2" />
          <circle cx="12" cy="17" r="1" fill="var(--ys-muted)" />
        </svg>
        <div className="text-[8px] text-ys-muted uppercase tracking-[0.4px]">
          importar
        </div>
      </button>

      <div className="w-px bg-ys-border my-1" />

      <Kpi
        n={counts.total}
        label="Total"
        active={isTotalOn}
        onClick={onSelectTotal}
      />
      <Kpi
        n={counts.clientes}
        label="Clientes"
        color="var(--ys-green)"
        active={activeFilters.has("cliente")}
        onClick={() => onToggleFilter("cliente")}
      />

      <div className="w-px bg-ys-border my-1" />

      <Kpi
        n={counts.ai}
        label="🤖 AI"
        color="#34d399"
        active={activeFilters.has("ai")}
        onClick={() => onToggleFilter("ai")}
        borderTint="rgba(52,211,153,.2)"
      />
      <Kpi
        n={counts.h24}
        label="⏱️ 24hs"
        color="#a78bfa"
        active={activeFilters.has("24h")}
        onClick={() => onToggleFilter("24h")}
        borderTint="rgba(167,139,250,.3)"
      />
      <Kpi
        n={counts.caliente}
        label="🔥 Calientes"
        color="var(--ys-red)"
        active={activeFilters.has("caliente")}
        onClick={() => onToggleFilter("caliente")}
      />
      <Kpi
        n={counts.tibio}
        label="🌡️ Tibios"
        color="var(--ys-warn)"
        active={activeFilters.has("tibio")}
        onClick={() => onToggleFilter("tibio")}
      />
      <Kpi
        n={counts.frio}
        label="❄️ Fríos"
        color="var(--ys-blue)"
        active={activeFilters.has("frio")}
        onClick={() => onToggleFilter("frio")}
      />
    </div>
  );
}

function Kpi({
  n,
  label,
  color,
  active,
  onClick,
  borderTint,
}: {
  n: number;
  label: string;
  color?: string;
  active?: boolean;
  onClick: () => void;
  borderTint?: string;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        borderColor: active
          ? "var(--ys-red)"
          : borderTint
            ? borderTint
            : undefined,
        backgroundColor: active ? "var(--ys-red-bg)" : undefined,
      }}
      className="flex-1 rounded-lg border border-ys-border bg-ys-card px-3 py-2.5 text-left select-none transition-colors hover:border-ys-border2 cursor-pointer"
    >
      <div
        className="font-display text-xl font-bold leading-none"
        style={{ color }}
      >
        {n}
      </div>
      <div className="text-[9px] text-ys-muted mt-1 uppercase tracking-[0.4px]">
        {label}
      </div>
    </button>
  );
}
