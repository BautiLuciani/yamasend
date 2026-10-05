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
      {/* Flecha "ir" en vez de un punto: los puntitos a la derecha del nav
          ahora son avisos de novedades (AvisoDot), y un punto acá se leía
          como una notificación que no es. */}
      <svg
        width="14"
        height="14"
        viewBox="0 0 16 16"
        fill="none"
        className="flex-none mr-0.5 opacity-60 transition-transform group-hover:translate-x-0.5 group-hover:opacity-100"
        aria-hidden="true"
      >
        <path d="m6 3.5 4.5 4.5L6 12.5" stroke="var(--ys-dark-accent)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}
