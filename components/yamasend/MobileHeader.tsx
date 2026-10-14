"use client";

import Image from "next/image";
import AvisoDot from "./AvisoDot";
import type { TipoAviso } from "./useAvisosSidebar";

interface MobileHeaderProps {
  onOpenDrawer: () => void;
  /** Si hay algún aviso en el menú, se marca la hamburguesa (atención gana a novedad). */
  aviso?: TipoAviso | null;
}

export default function MobileHeader({ onOpenDrawer, aviso = null }: MobileHeaderProps) {
  return (
    <div
      className="flex md:hidden fixed top-0 left-0 right-0 z-[60] items-center gap-3 bg-ys-card border-b border-ys-border-softest px-4 pr-3.5"
      style={{
        height: "calc(58px + env(safe-area-inset-top))",
        paddingTop: "env(safe-area-inset-top)",
      }}
    >
      <Image
        src="/brand/logo-sidebar.png"
        alt="YamaSend"
        width={150}
        height={60}
        className="h-[30px] w-auto max-w-[150px] object-contain"
        priority
      />
      <button
        onClick={onOpenDrawer}
        aria-label={aviso ? "Abrir menú (hay novedades)" : "Abrir menú"}
        className="relative ml-auto w-11 h-11 rounded-[11px] flex items-center justify-center cursor-pointer"
      >
        <svg width="21" height="21" viewBox="0 0 16 16" fill="none">
          <path d="M2.5 4h11M2.5 8h11M2.5 12h11" stroke="#16211b" strokeWidth="1.7" strokeLinecap="round" />
        </svg>
        {aviso && (
          <span className="absolute top-2.5 right-2 flex">
            <AvisoDot tipo={aviso} />
          </span>
        )}
      </button>
    </div>
  );
}
