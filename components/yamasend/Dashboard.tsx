"use client";

import { useState } from "react";

interface DashboardProps {
  userName: string;
}

const BARRAS = [
  { dia: "Lun", alto: 62, altoFallidos: 4 },
  { dia: "Mar", alto: 88, altoFallidos: 3 },
  { dia: "Mié", alto: 54, altoFallidos: 5 },
  { dia: "Jue", alto: 70, altoFallidos: 4 },
  { dia: "Vie", alto: 95, altoFallidos: 2 },
  { dia: "Sáb", alto: 40, altoFallidos: 3 },
  { dia: "Dom", alto: 30, altoFallidos: 2 },
];

const CAMPANAS_RECIENTES = [
  {
    nombre: "Promo Día del Padre",
    detalle: "8.420 enviados · 14,3% respuestas",
    estado: "COMPLETADA",
    color: "green" as const,
  },
  {
    nombre: "Recordatorio de turnos",
    detalle: "3.180 enviados · 642 respuestas",
    estado: "ENVIANDO",
    color: "warn" as const,
  },
  {
    nombre: "Encuesta de satisfacción",
    detalle: "Programada para 18 jun · 10:00",
    estado: "PROGRAMADA",
    color: "gray" as const,
  },
  {
    nombre: "Reactivación clientes 2024",
    detalle: "6.905 enviados · 12,1% respuestas",
    estado: "COMPLETADA",
    color: "green" as const,
  },
];

const ACTIVIDAD = [
  { texto: "La IA clasificó 52 conversaciones como leads calientes", cuando: "12 min" },
  { texto: "Plantilla “Confirmación de pedido” aprobada por Meta", cuando: "1 h" },
  { texto: "Se importaron 1.240 contactos", cuando: "3 h" },
  { texto: "Grupo “Clientes Premium” creado con 318 contactos", cuando: "Ayer" },
];

function EstadoBadge({ estado, color }: { estado: string; color: "green" | "warn" | "gray" }) {
  const styles =
    color === "green"
      ? "text-ys-green-text bg-ys-green-bg"
      : color === "warn"
        ? "text-ys-warn-text bg-ys-warn-bg"
        : "text-[#5d6560] bg-ys-el2";
  return (
    <div className={`font-mono text-[11px] rounded-md px-[9px] py-[5px] ${styles}`}>
      {estado}
    </div>
  );
}

export default function Dashboard({ userName }: DashboardProps) {
  const [periodo, setPeriodo] = useState<"7d" | "30d" | "ano">("7d");
  const firstName = userName.split(" ")[0] || userName;

  return (
    <div className="flex-1 min-w-0 bg-ys-bg px-4 md:px-[38px] pt-3 md:pt-[34px] pb-7 md:pb-10 flex flex-col gap-5 md:gap-6 overflow-y-auto">
      <div className="flex items-end gap-5 flex-wrap">
        <div className="flex flex-col gap-1.5">
          <div className="text-2xl md:text-[28px] font-extrabold tracking-[-0.025em] text-ys-text">
            Hola, {firstName}
          </div>
          <div className="text-sm md:text-[15px] text-ys-muted font-medium">
            Así viene tu actividad de mensajería.
          </div>
        </div>
        <div className="ml-auto flex items-center gap-3 flex-wrap w-full md:w-auto">
          <div className="flex gap-[3px] bg-ys-el2 rounded-[10px] p-[3px] w-full md:w-auto">
            {(
              [
                { key: "7d", label: "7 días" },
                { key: "30d", label: "30 días" },
                { key: "ano", label: "Año" },
              ] as const
            ).map((p) => (
              <button
                key={p.key}
                onClick={() => setPeriodo(p.key)}
                className={`flex-1 md:flex-none text-[13px] rounded-lg px-[15px] py-[7px] cursor-pointer transition-colors ${
                  periodo === p.key
                    ? "font-bold text-ys-text bg-white shadow-[0_1px_2px_rgba(16,24,20,0.07)]"
                    : "font-semibold text-[#7b837e]"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <button
            disabled
            title="Disponible cuando se implemente Campañas"
            className="w-full md:w-auto justify-center flex items-center gap-2 bg-ys-green text-white text-[13.5px] font-bold px-[17px] py-[11px] rounded-[10px] opacity-60 cursor-not-allowed shadow-[var(--shadow-cta)]"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M8 3v10M3 8h10" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" />
            </svg>
            Nueva campaña
          </button>
        </div>
      </div>

      {/* 4 cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        <KpiCard
          icon={
            <svg width="19" height="19" viewBox="0 0 16 16" fill="none">
              <path d="M14 2 7 9M14 2l-4.5 12L7 9 2 6.5 14 2Z" stroke="#12B76A" strokeWidth="1.5" strokeLinejoin="round" />
            </svg>
          }
          value="24.680"
          label="Mensajes enviados"
          delta="+12,4%"
        />
        <KpiCard
          icon={
            <svg width="19" height="19" viewBox="0 0 16 16" fill="none">
              <path d="m1.5 8.5 3 3 5-6M7 11.5l1 1 6.5-7.5" stroke="#12B76A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          }
          value="96,8%"
          label="Tasa de entrega"
          delta="+0,6%"
        />
        <KpiCard
          dark
          icon={
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none" style={{ animation: "ys-spark 3.2s ease-in-out infinite" }}>
              <path d="m8 2 1.6 3.6L13 7l-3.4 1.4L8 12 6.4 8.4 3 7l3.4-1.4L8 2Z" stroke="#3ddb8f" strokeWidth="1.4" strokeLinejoin="round" />
            </svg>
          }
          value="426"
          label="Leads calificados por IA"
          delta="+58 este período"
        />
        <div className="bg-white border border-ys-green-border rounded-2xl px-5 py-[18px] flex flex-col gap-3 transition-all hover:-translate-y-0.5 hover:shadow-[var(--shadow-card)]">
          <div className="flex items-center gap-[13px]">
            <div className="w-10 h-10 flex-none rounded-[13px] bg-ys-green-bg flex items-center justify-center">
              <svg width="19" height="19" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="5.5" stroke="#12B76A" strokeWidth="1.5" />
                <path d="M8 4.8v6.4M6.3 6.4h3.1a1.3 1.3 0 0 1 0 2.6H6.6a1.3 1.3 0 0 0 0 2.6h3.1" stroke="#12B76A" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
            </div>
            <div className="flex flex-col gap-0.5">
              <div className="flex items-baseline gap-1.5">
                <div className="font-mono text-2xl font-medium tracking-[-0.03em] text-ys-text">3.200</div>
                <div className="font-mono text-[13px] text-ys-dimmer">/ 50.000</div>
              </div>
              <div className="text-[12.5px] text-ys-muted font-semibold">Créditos disponibles</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex-1 h-[5px] rounded-sm bg-ys-border-softest overflow-hidden">
              <div className="h-full bg-ys-green rounded-sm" style={{ width: "6.4%" }} />
            </div>
            <button
              disabled
              title="Disponible próximamente"
              className="text-[12.5px] font-bold text-ys-green-text whitespace-nowrap cursor-not-allowed opacity-70"
            >
              Comprar créditos
            </button>
          </div>
        </div>
      </div>

      {/* Gráfico + Insight */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.85fr_1fr] gap-[18px] items-start">
        <div className="bg-white border border-ys-border rounded-2xl px-5 md:px-6 pt-5 pb-[18px] flex flex-col gap-5">
          <div className="flex items-center justify-between">
            <div className="text-[15px] font-extrabold text-ys-text">Volumen de envíos</div>
            <div className="flex items-center gap-4 text-[11.5px] font-semibold text-[#7b837e]">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-sm bg-ys-green" />
                Entregados
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-sm bg-ys-border-softest" />
                Fallidos
              </span>
            </div>
          </div>
          <div className="flex items-end gap-3 md:gap-4 h-[172px]">
            {BARRAS.map((b) => (
              <div key={b.dia} className="flex-1 flex flex-col items-center gap-2.5">
                <div
                  className="w-full flex flex-col justify-end gap-0.5 h-[140px]"
                  style={{ animation: "ys-grow .6s cubic-bezier(.4,0,.2,1) both", transformOrigin: "bottom" }}
                >
                  <div className="rounded-t-[3px] bg-ys-border-softest" style={{ height: `${b.altoFallidos}%` }} />
                  <div className="rounded-b-[3px] bg-ys-green" style={{ height: `${b.alto}%` }} />
                </div>
                <div className="text-[11.5px] text-ys-dimmer font-medium">{b.dia}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-ys-dark rounded-2xl px-[22px] py-5 flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ animation: "ys-spark 3.2s ease-in-out infinite" }}>
              <path d="m8 2 1.6 3.6L13 7l-3.4 1.4L8 12 6.4 8.4 3 7l3.4-1.4L8 2Z" stroke="#12B76A" strokeWidth="1.5" strokeLinejoin="round" />
            </svg>
            <div className="text-[11px] font-extrabold tracking-[0.12em] uppercase text-ys-green">
              Insight de IA
            </div>
          </div>
          <div className="text-[14.5px] leading-[1.55] text-ys-border-softest font-semibold">
            Los envíos de los martes a las 10:00 obtienen un 31% más de respuestas que el resto de la semana.
          </div>
          <button
            disabled
            title="Disponible cuando se implemente Campañas"
            className="self-start mt-0.5 text-[12.5px] font-extrabold text-[#0b1310] bg-ys-green rounded-[9px] px-3.5 py-2.5 opacity-70 cursor-not-allowed"
          >
            Programar próxima campaña
          </button>
        </div>
      </div>

      {/* Campañas recientes + Actividad */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.85fr_1fr] gap-[18px] items-start">
        <div className="bg-white border border-ys-border rounded-2xl flex flex-col overflow-hidden">
          <div className="px-5 md:px-6 pt-[18px] pb-3.5 flex items-center justify-between">
            <div className="text-[15px] font-extrabold text-ys-text">Campañas recientes</div>
            <span className="text-[12.5px] font-bold text-ys-green-text opacity-60 cursor-not-allowed">
              Ver todas →
            </span>
          </div>
          {CAMPANAS_RECIENTES.map((c) => (
            <div key={c.nombre} className="flex items-center gap-3.5 px-5 md:px-6 py-3.5 border-t border-ys-border-soft">
              <div
                className={`w-9 h-9 flex-none rounded-[11px] flex items-center justify-center ${
                  c.color === "green" ? "bg-ys-green-bg" : c.color === "warn" ? "bg-ys-warn-bg" : "bg-ys-el2"
                }`}
              >
                <svg width="17" height="17" viewBox="0 0 16 16" fill="none">
                  <path
                    d="M2.5 6.5v3l7 3.5v-10l-7 3.5Z"
                    stroke={c.color === "green" ? "#067647" : c.color === "warn" ? "#8a5a00" : "#5d6560"}
                    strokeWidth="1.5"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M12 6v4"
                    stroke={c.color === "green" ? "#067647" : c.color === "warn" ? "#8a5a00" : "#5d6560"}
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
              </div>
              <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                <div className="text-sm font-bold text-ys-text truncate">{c.nombre}</div>
                <div className="text-[12.5px] text-ys-dim font-medium truncate">{c.detalle}</div>
              </div>
              <EstadoBadge estado={c.estado} color={c.color} />
            </div>
          ))}
        </div>

        <div className="bg-white border border-ys-border rounded-2xl px-5 md:px-[22px] pt-[18px] pb-5 flex flex-col gap-1.5">
          <div className="text-[15px] font-extrabold text-ys-text pb-1.5">Actividad reciente</div>
          {ACTIVIDAD.map((a, i) => (
            <div key={i} className="flex gap-3 py-[11px] border-t border-ys-border-softer">
              <div className="w-[26px] h-[26px] flex-none rounded-lg bg-ys-el2 flex items-center justify-center">
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                  <circle cx="8" cy="8" r="3" stroke="#5d6560" strokeWidth="1.4" />
                </svg>
              </div>
              <div className="flex flex-col gap-0.5">
                <div className="text-[13px] font-semibold text-[#2c3531] leading-[1.45]">{a.texto}</div>
                <div className="font-mono text-[11px] text-ys-dimmer">{a.cuando}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function KpiCard({
  icon,
  value,
  label,
  delta,
  dark = false,
}: {
  icon: React.ReactNode;
  value: string;
  label: string;
  delta: string;
  dark?: boolean;
}) {
  return (
    <div className="bg-white border border-ys-border rounded-2xl px-4 md:px-5 py-[18px] flex flex-col gap-3 transition-all hover:-translate-y-0.5 hover:shadow-[var(--shadow-card)]">
      <div className="flex items-center gap-[13px]">
        <div className={`w-10 h-10 flex-none rounded-[13px] flex items-center justify-center ${dark ? "bg-ys-dark" : "bg-ys-green-bg"}`}>
          {icon}
        </div>
        <div className="flex flex-col gap-0.5 min-w-0">
          <div className="font-mono text-xl md:text-2xl font-medium tracking-[-0.03em] text-ys-text">{value}</div>
          <div className="text-[12.5px] text-ys-muted font-semibold truncate">{label}</div>
        </div>
      </div>
      <div className="text-[12.5px] font-bold text-ys-green-text">
        {delta} <span className="text-ys-dimmer font-medium">vs. período anterior</span>
      </div>
    </div>
  );
}
