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
}: {
  tipo: TipoAviso;
  className?: string;
}) {
  const color = tipo === "atencion" ? "bg-ys-orange" : "bg-ys-green";
  const texto = tipo === "atencion" ? "Requiere atención" : "Hay novedades";
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
