"use client";

import type { ReactNode } from "react";

/**
 * Estructura común de TODAS las secciones del panel (diseño de oct 2026):
 *
 *   SectionHeader   título + subtítulo a la izquierda, ícono + estado a la derecha
 *   ActionBar       una fila de 44 px: acción principal, secundarias, buscador, filtros
 *   (contenido)     tabla o tarjetas
 *   SelectionBar    barra flotante de un renglón al seleccionar filas
 *
 * Los tamaños no se repiten en cada pantalla: viven acá. Si una sección
 * necesita algo distinto, primero se pregunta si debería cambiar para todas.
 */

export function SectionPage({ children }: { children: ReactNode }) {
  return (
    <div className="flex-1 min-w-0 bg-ys-bg flex flex-col overflow-y-auto pt-[58px] md:pt-0">
      {children}
    </div>
  );
}

export type StatusTone = "ok" | "warn" | "off" | "neutral";

export interface SectionStatus {
  /** Ícono de la sección (SVG 20 px, usa currentColor). */
  icon: ReactNode;
  /** Qué se está midiendo: "WhatsApp", "Estado en Meta"… */
  label: string;
  /** El valor: "Vinculado", "4 aprobados · 1 en revisión"… */
  value: string;
  tone?: StatusTone;
  /** Si hay acción, el estado se vuelve botón (ej: "Vincular WhatsApp"). */
  onClick?: () => void;
}

const TONE: Record<StatusTone, { dot: string; text: string; box: string }> = {
  ok: { dot: "bg-ys-green", text: "text-ys-green-text", box: "bg-ys-green-bg text-ys-green-text" },
  warn: { dot: "bg-[#c07a12]", text: "text-ys-warn-text", box: "bg-ys-warn-bg text-ys-warn-text" },
  off: { dot: "bg-[#9aa19c]", text: "text-ys-muted", box: "bg-ys-el2 text-ys-muted" },
  neutral: { dot: "bg-[#9aa19c]", text: "text-ys-text", box: "bg-ys-el2 text-ys-muted" },
};

function StatusCard({ status }: { status: SectionStatus }) {
  const tone = TONE[status.tone ?? "neutral"];
  const inner = (
    <>
      <span className={`w-10 h-10 flex-none rounded-[11px] flex items-center justify-center ${tone.box}`}>
        {status.icon}
      </span>
      <span className="flex flex-col gap-0.5 text-left min-w-0">
        <span className="text-[11px] font-extrabold tracking-[0.06em] uppercase text-ys-muted">{status.label}</span>
        <span className={`flex items-center gap-[7px] text-[13.5px] font-extrabold ${tone.text}`}>
          <span className={`w-2 h-2 rounded-full flex-none ${tone.dot}`} />
          <span className="truncate">{status.value}</span>
        </span>
      </span>
    </>
  );
  const cls =
    "flex items-center gap-3 pl-2 pr-4 py-2 border border-ys-border rounded-[14px] bg-ys-bg max-w-full";
  if (status.onClick) {
    return (
      <button
        type="button"
        onClick={status.onClick}
        className={`${cls} cursor-pointer transition-colors hover:border-ys-green-border`}
      >
        {inner}
      </button>
    );
  }
  return <div className={cls}>{inner}</div>;
}

export function SectionHeader({
  title,
  subtitle,
  status,
}: {
  title: string;
  subtitle: string;
  status?: SectionStatus;
}) {
  return (
    <header className="flex-none bg-ys-card border-b border-ys-border px-4 md:px-[38px] pt-5 md:pt-[30px] pb-4 md:pb-[22px] flex items-center justify-between gap-4 md:gap-5 flex-wrap">
      <div className="flex flex-col gap-1.5 min-w-0">
        <h1 className="m-0 text-2xl md:text-[28px] font-extrabold tracking-[-0.025em] text-ys-text">{title}</h1>
        <p className="m-0 text-sm md:text-[15px] font-semibold text-ys-muted">{subtitle}</p>
      </div>
      {status && <StatusCard status={status} />}
    </header>
  );
}

export function ActionBar({ children }: { children: ReactNode }) {
  return (
    <div className="flex-none px-4 md:px-[38px] py-4 md:py-[18px] flex items-center gap-3 flex-wrap border-b border-ys-border">
      {children}
    </div>
  );
}

/** Franja opcional debajo de la barra de acciones: filtros activos, etiquetas. */
export function FilterBand({ children }: { children: ReactNode }) {
  return (
    <div className="flex-none px-4 md:px-[38px] py-3 flex items-center gap-2 flex-wrap border-b border-ys-border">
      {children}
    </div>
  );
}

export function SectionBody({ children }: { children: ReactNode }) {
  return <div className="px-4 md:px-[38px] pt-5 md:pt-[22px] pb-28 flex flex-col gap-4">{children}</div>;
}

const PlusIcon = (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
  </svg>
);
const LockIcon = (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d="M4.2 7.2V5.4a3.8 3.8 0 0 1 7.6 0v1.8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    <rect x="3" y="7.2" width="10" height="6.3" rx="1.8" stroke="currentColor" strokeWidth="1.6" />
  </svg>
);

/**
 * Botón principal verde. Con `bloqueado` queda visible pero deshabilitado: el
 * permiso revocado no puede ser invisible. `onClick` debería mostrar el aviso
 * de quién puede habilitarlo.
 */
export function BtnPrimary({
  children,
  onClick,
  bloqueado = false,
  disabled = false,
  icon = true,
  title,
}: {
  children: ReactNode;
  onClick?: () => void;
  bloqueado?: boolean;
  disabled?: boolean;
  icon?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`inline-flex items-center justify-center gap-2 h-11 px-[18px] rounded-[10px] text-sm font-extrabold whitespace-nowrap transition-all disabled:opacity-50 disabled:cursor-default ${
        bloqueado
          ? "bg-ys-el2 text-ys-faint cursor-not-allowed"
          : "bg-ys-green text-[#04210f] cursor-pointer hover:bg-ys-green-hover hover:-translate-y-px shadow-[var(--shadow-cta)]"
      }`}
    >
      {icon && (bloqueado ? LockIcon : PlusIcon)}
      {children}
    </button>
  );
}

export function BtnSecondary({
  children,
  onClick,
  disabled = false,
  icon,
  title,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  /** Ícono propio; `"plus"` pone el + de "agregar". */
  icon?: ReactNode | "plus";
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="inline-flex items-center justify-center gap-2 h-11 px-[18px] rounded-[10px] text-sm font-bold whitespace-nowrap text-ys-text bg-ys-card border border-ys-border cursor-pointer transition-colors hover:bg-[#f7f9f8] disabled:opacity-50 disabled:cursor-default"
    >
      {icon === "plus" ? PlusIcon : icon}
      {children}
    </button>
  );
}

export function SearchBox({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <label className="flex items-center gap-2.5 h-11 box-border px-3.5 border border-ys-border rounded-[10px] bg-ys-card w-full sm:w-[260px] transition-colors focus-within:border-ys-green-border">
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none" className="flex-none" aria-hidden="true">
        <circle cx="7" cy="7" r="4.5" stroke="#6b736e" strokeWidth="1.5" />
        <path d="m10.5 10.5 3 3" stroke="#6b736e" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="flex-1 min-w-0 border-none outline-none bg-transparent text-[13.5px] font-semibold text-ys-text placeholder:text-[#6b736e] placeholder:font-medium"
      />
    </label>
  );
}

/** Filtro segmentado de 44 px (Todos | Aprobados | …). */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { key: T; label: string }[];
  value: T;
  onChange: (key: T) => void;
}) {
  return (
    <div className="flex gap-[3px] bg-ys-el2 rounded-[10px] p-[3px] h-11 box-border overflow-x-auto max-w-full">
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          onClick={() => onChange(o.key)}
          aria-pressed={value === o.key}
          className={`flex-none flex items-center px-3.5 rounded-lg text-[13px] cursor-pointer transition-colors ${
            value === o.key
              ? "font-extrabold text-ys-text bg-ys-card shadow-[0_1px_2px_rgba(16,24,20,0.07)]"
              : "font-bold text-ys-muted hover:text-ys-text"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Casilla de selección de fila / de "seleccionar todo". */
export function CheckBox({
  checked,
  onChange,
  label,
  indeterminate = false,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
  indeterminate?: boolean;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={indeterminate ? "mixed" : checked}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        onChange();
      }}
      className={`w-5 h-5 flex-none rounded-md flex items-center justify-center cursor-pointer transition-colors ${
        checked || indeterminate ? "bg-ys-green" : "border-[1.5px] border-[#b7c0ba] bg-ys-card hover:border-ys-green"
      }`}
    >
      {checked && (
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="m3 8.4 3.4 3L13 4.6" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
      {!checked && indeterminate && <span className="w-2.5 h-0.5 bg-white rounded" />}
    </button>
  );
}

/**
 * Barra flotante de un renglón. Solo el contador y las acciones: para
 * deseleccionar se sale de la selección (ver SelectionBar en cada lista), no
 * hay botón. Se pega al borde de abajo del área que scrollea.
 */
export function SelectionBar({ children, texto }: { children: ReactNode; texto: string }) {
  return (
    <div
      className="sticky bottom-4 md:bottom-6 z-[9] mx-4 md:mx-[38px] mt-auto flex items-center gap-2 flex-nowrap bg-ys-dark text-[#eef1ef] rounded-xl py-1.5 pl-[18px] pr-1.5 shadow-[0_14px_34px_rgba(16,24,20,0.28)] overflow-x-auto"
      style={{ animation: "ys-bar-up .18s cubic-bezier(.4,0,.2,1) both" }}
      role="toolbar"
      aria-label="Acciones sobre la selección"
    >
      <span className="text-sm font-extrabold whitespace-nowrap">{texto}</span>
      <span className="flex-1" />
      {children}
    </div>
  );
}

const BAR_BTN = "h-9 px-3.5 rounded-lg text-[13px] whitespace-nowrap cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-default";

export function BarBtn({
  children,
  onClick,
  variante = "outline",
  disabled,
}: {
  children: ReactNode;
  onClick?: () => void;
  variante?: "outline" | "primary" | "danger";
  disabled?: boolean;
}) {
  const cls =
    variante === "primary"
      ? "bg-ys-green text-[#04210f] font-extrabold hover:bg-[#3ddb8f]"
      : variante === "danger"
        ? "bg-[#f0bb66] text-[#2c1a00] font-extrabold hover:bg-[#f5c67d]"
        : "border border-[#384139] text-[#eef1ef] font-bold hover:bg-[#1e2a24]";
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={`${BAR_BTN} ${cls}`}>
      {children}
    </button>
  );
}

export function pluralizar(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`;
}
