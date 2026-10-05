"use client";

/**
 * Ítem destacado de "IA" para el nav (Sidebar de escritorio y MobileDrawer).
 *
 * Pedido de Bauti y Pato (2026-10): que la sección IA llame más la atención
 * que el resto. En vez de ser una fila más (texto gris, sin fondo), se dibuja
 * como una tarjeta oscura con el destello verde animado — el mismo lenguaje
 * visual que ya usa la app para la IA (botón "Analizar conversaciones").
 *
 * Usa solo tokens del tema (ys-dark / ys-card / ys-dark-accent), así que se
 * invierte sola en modo oscuro: tarjeta clara con texto oscuro.
 */
interface NavIaItemProps {
  label: string;
  isActive: boolean;
  onClick: () => void;
  /** "mobile" usa el padding/tamaño de texto del drawer (targets táctiles). */
  variant?: "desktop" | "mobile";
}

export default function NavIaItem({
  label,
  isActive,
  onClick,
  variant = "desktop",
}: NavIaItemProps) {
  const isMobile = variant === "mobile";

  return (
    <button
      onClick={onClick}
      aria-current={isActive ? "page" : undefined}
      className={`group relative w-full flex items-center gap-3 rounded-xl text-left cursor-pointer transition-all bg-ys-dark text-ys-card shadow-[var(--shadow-card)] outline-none focus-visible:ring-2 focus-visible:ring-ys-green focus-visible:ring-offset-2 focus-visible:ring-offset-ys-card ${
        isMobile ? "px-3 py-[13px] text-[15px]" : "px-3 py-[11px] text-sm hover:-translate-y-px"
      } font-bold ${
        isActive
          ? "ring-2 ring-ys-green ring-offset-2 ring-offset-ys-card"
          : "hover:ring-2 hover:ring-ys-green-border hover:ring-offset-2 hover:ring-offset-ys-card"
      }`}
    >
      <span
        className="w-7 h-7 flex-none rounded-lg flex items-center justify-center"
        style={{ background: "color-mix(in srgb, var(--ys-dark-accent) 22%, transparent)" }}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          style={{ animation: "ys-spark 3.2s ease-in-out infinite" }}
        >
          <path
            d="m8 2 1.6 3.6L13 7l-3.4 1.4L8 12 6.4 8.4 3 7l3.4-1.4L8 2Z"
            stroke="var(--ys-dark-accent)"
            fill="var(--ys-dark-accent)"
            fillOpacity={0.25}
            strokeWidth="1.4"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      <span className="flex-1 min-w-0 truncate">{label}</span>
      {/* Indicador "vivo": punto verde que pulsa, refuerza que es el
          asistente y no una sección estática. */}
      <span className="relative flex-none w-2 h-2 mr-1">
        <span
          className="absolute inset-0 rounded-full bg-ys-green opacity-60"
          style={{ animation: "ys-spark 1.8s ease-in-out infinite" }}
        />
        <span className="absolute inset-[1px] rounded-full bg-ys-green" />
      </span>
    </button>
  );
}
