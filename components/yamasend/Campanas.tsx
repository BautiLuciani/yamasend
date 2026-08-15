"use client";

import { useState } from "react";

interface CampanasProps {
  onNewCampaign: () => void;
}

type EstadoCampana =
  | "borrador"
  | "programada"
  | "enviando"
  | "completada"
  | "pausada"
  | "error";

const CAMPANAS_MOCK: {
  nombre: string;
  dest: string;
  grupo: string;
  template: string;
  fecha: string;
  estado: EstadoCampana;
}[] = [
  {
    nombre: "Promo Día del Padre",
    dest: "8.420",
    grupo: "Clientes Premium",
    template: "promo_dia_padre",
    fecha: "12/08",
    estado: "completada",
  },
  {
    nombre: "Recordatorio de turnos",
    dest: "3.180",
    grupo: "Seguimiento Agosto",
    template: "recordatorio_turno",
    fecha: "13/08",
    estado: "enviando",
  },
  {
    nombre: "Encuesta de satisfacción",
    dest: "1.240",
    grupo: "Clientes calientes",
    template: "encuesta_sat",
    fecha: "18/08",
    estado: "programada",
  },
  {
    nombre: "Reactivación clientes 2024",
    dest: "6.905",
    grupo: "Reactivación 2024",
    template: "reactivacion_2024",
    fecha: "05/08",
    estado: "completada",
  },
  {
    nombre: "Lanzamiento catálogo nuevo",
    dest: "—",
    grupo: "Mayoristas",
    template: "lanzamiento_cat",
    fecha: "—",
    estado: "borrador",
  },
];

const ESTADO_CONFIG: Record<
  EstadoCampana,
  { label: string; text: string; bg: string; dot: string }
> = {
  borrador: { label: "Borrador", text: "text-[#5d6560]", bg: "bg-ys-el2", dot: "border-[#8a908c]" },
  programada: { label: "Programada", text: "text-[#3f4844]", bg: "bg-ys-el2", dot: "border-[#5d6560]" },
  enviando: { label: "Enviando", text: "text-ys-warn-text", bg: "bg-ys-warn-bg", dot: "bg-[#c07a12]" },
  completada: { label: "Completada", text: "text-ys-green-text", bg: "bg-ys-green-bg", dot: "bg-ys-green" },
  pausada: { label: "Pausada", text: "text-ys-warn-text", bg: "bg-ys-warn-bg", dot: "bg-[#c07a12]" },
  error: { label: "Error", text: "text-ys-red-text", bg: "bg-ys-red-bg", dot: "bg-[#a8443b]" },
};

function EstadoBadge({ estado }: { estado: EstadoCampana }) {
  const cfg = ESTADO_CONFIG[estado];
  const isDotOutline = estado === "borrador" || estado === "programada";
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11.5px] font-bold rounded-full px-2.5 py-1 ${cfg.text} ${cfg.bg}`}>
      <span className={`w-[6px] h-[6px] rounded-full ${isDotOutline ? `border-[1.5px] ${cfg.dot}` : cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

export default function Campanas({ onNewCampaign }: CampanasProps) {
  const [query, setQuery] = useState("");

  const filtered = CAMPANAS_MOCK.filter((c) =>
    c.nombre.toLowerCase().includes(query.toLowerCase()),
  );

  const activas = CAMPANAS_MOCK.filter((c) => c.estado === "enviando").length;
  const programadas = CAMPANAS_MOCK.filter((c) => c.estado === "programada").length;

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
        <button
          onClick={onNewCampaign}
          className="ml-auto w-full md:w-auto justify-center flex items-center gap-2 bg-ys-green text-white text-[13.5px] font-bold px-[17px] py-[11px] rounded-[10px] cursor-pointer transition-all hover:bg-ys-green-hover hover:-translate-y-px shadow-[var(--shadow-cta)]"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path d="M8 3v10M3 8h10" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" />
          </svg>
          Nueva campaña
        </button>
      </div>

      <div className="flex items-center gap-3.5 flex-wrap text-[13px] text-ys-muted font-semibold">
        <span>
          <span className="font-mono text-ys-text">{CAMPANAS_MOCK.length}</span> campañas
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
        <span className="w-px h-3.5 bg-[#e2e5e3]" />
        <span>
          <span className="font-mono text-ys-text">18.492</span> mensajes enviados este mes
        </span>
      </div>

      <div className="flex items-center gap-2.5">
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
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white border border-ys-border rounded-2xl py-16 px-6 flex flex-col items-center gap-3.5">
          <div className="w-[58px] h-[58px] rounded-[18px] bg-ys-green-bg flex items-center justify-center">
            <svg width="26" height="26" viewBox="0 0 16 16" fill="none">
              <path d="M2.5 6.5v3l7 3.5v-10l-7 3.5Z" stroke="#12B76A" strokeWidth="1.5" strokeLinejoin="round" />
              <path d="M12 6v4" stroke="#12B76A" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </div>
          <div className="text-[19px] font-extrabold tracking-[-0.02em] text-ys-text">
            Sin resultados
          </div>
          <div className="text-sm text-ys-muted font-medium text-center max-w-[440px]">
            Probá con otro nombre.
          </div>
        </div>
      ) : (
        <div className="bg-white border border-ys-border rounded-2xl overflow-hidden">
          <div className="hidden md:grid grid-cols-[2.4fr_1.5fr_1.5fr_1.25fr_1.15fr] items-center px-6 py-[11px] bg-[#fbfcfb] border-b border-ys-border-soft text-[11px] font-extrabold tracking-[0.07em] uppercase text-ys-dimmer">
            <div>Campaña</div>
            <div>Grupo</div>
            <div>Template</div>
            <div>Fecha</div>
            <div>Estado</div>
          </div>
          {filtered.map((c, i) => (
            <div
              key={c.nombre}
              className={`grid grid-cols-1 md:grid-cols-[2.4fr_1.5fr_1.5fr_1.25fr_1.15fr] items-center gap-1.5 md:gap-0 px-4 md:px-6 py-3.5 ${
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
                    {c.dest} destinatarios
                  </div>
                </div>
                <div className="md:hidden ml-auto flex-none">
                  <EstadoBadge estado={c.estado} />
                </div>
              </div>
              <div className="hidden md:block text-[13px] font-semibold text-[#3f4844]">{c.grupo}</div>
              <div className="hidden md:block font-mono text-[12.5px] text-ys-muted">{c.template}</div>
              <div className="hidden md:block font-mono text-[12.5px] text-ys-muted">{c.fecha}</div>
              <div className="hidden md:block">
                <EstadoBadge estado={c.estado} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
