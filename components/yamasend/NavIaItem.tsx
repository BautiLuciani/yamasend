"use client";

import AvisoDot from "./AvisoDot";

/**
 * Ítem "Asistente" del nav (Sidebar de escritorio y MobileDrawer): verde
 * suave siempre, con la estrellita, para que se distinga del resto del menú.
 * Si el Asistente generó mensajes mientras estabas en otra sección, muestra un
 * globo con la cantidad.
 */
interface NavIaItemProps {
  label: string;
  isActive: boolean;
  onClick: () => void;
  /** "mobile" usa el padding/tamaño de texto del drawer (targets táctiles). */
  variant?: "desktop" | "mobile";
  /** Mensajes del Asistente sin leer. */
  conteo?: number;
}

export default function NavIaItem({ label, isActive, onClick, variant = "desktop", conteo = 0 }: NavIaItemProps) {
  const isMobile = variant === "mobile";
  return (
    <button
      onClick={onClick}
      aria-current={isActive ? "page" : undefined}
      className={`relative w-full flex items-center gap-[11px] rounded-[10px] text-left font-bold transition-colors cursor-pointer bg-ys-green-bg text-ys-green-text hover:brightness-[0.97] ${
        isMobile ? "px-3 py-[13px] text-[15px]" : "px-3 py-2.5 text-sm"
      }`}
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        className="flex-none"
        style={{ animation: "ys-spark 3.2s ease-in-out infinite" }}
        aria-hidden="true"
      >
        <path
          d="m8 2 1.6 3.6L13 7l-3.4 1.4L8 12 6.4 8.4 3 7l3.4-1.4L8 2Z"
          stroke="#12B76A"
          fill="#12B76A"
          fillOpacity={0.25}
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
      </svg>
      <span className="flex-1 min-w-0 truncate">{label}</span>
      {conteo > 0 && <AvisoDot tipo="novedad" cantidad={conteo} className="mr-1" />}
    </button>
  );
}
