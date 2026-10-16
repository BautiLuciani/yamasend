"use client";

import type { TipoAviso } from "./useAvisosSidebar";

/**
 * Puntito de aviso del sidebar. Verde = novedad ("pasó algo"); naranja =
 * requiere atención (template rechazado, campaña con error, WhatsApp
 * desvinculado). Al aparecer hace un "ping" corto (no infinito, para no
 * molestar mientras el usuario trabaja en otra sección).
 */
export default function AvisoDot({
  tipo,
  className = "",
  cantidad,
}: {
  tipo: TipoAviso;
  className?: string;
  /** Si viene (y es > 0), se muestra un globo con el número en vez del punto. */
  cantidad?: number;
}) {
  const color = tipo === "atencion" ? "bg-ys-orange" : "bg-ys-green";
  const texto = tipo === "atencion" ? "Requiere atención" : "Hay novedades";
  if (cantidad && cantidad > 0) {
    return (
      <span
        className={`flex-none min-w-[20px] h-5 px-1.5 rounded-full ${color} text-white text-[11px] font-extrabold leading-5 text-center ${className}`}
        title={`${cantidad} ${cantidad === 1 ? "novedad" : "novedades"}`}
        style={{ animation: "ys-aviso-ping 1.6s cubic-bezier(0,0,.2,1) 2" }}
      >
        {cantidad > 99 ? "99+" : cantidad}
      </span>
    );
  }
  return (
    <span className={`relative flex-none w-2 h-2 ${className}`} title={texto}>
      <span
        className={`absolute inset-0 rounded-full ${color}`}
        style={{ animation: "ys-aviso-ping 1.6s cubic-bezier(0,0,.2,1) 3" }}
        aria-hidden="true"
      />
      <span className={`absolute inset-0 rounded-full ${color}`} aria-hidden="true" />
      <span className="sr-only">{texto}</span>
    </span>
  );
}
