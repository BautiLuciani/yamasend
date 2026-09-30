"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Image from "next/image";
import { useLang } from "./LangContext";

/**
 * Modal de Configuración (se abre desde el menú del usuario → "Configuración").
 *
 * Mismo esqueleto que MyProfileModal: sidebar de secciones a la izquierda y
 * contenido a la derecha; en mobile son dos pantallas (menú → contenido).
 * Por ahora tiene una sola sección, "Conector IA", pero las secciones salen
 * de SECCIONES para que sumar Tema, Idioma o Documentación sea agregar una
 * entrada y su contenido, sin tocar el layout.
 */

type Seccion = "mcp";

/** Cantidad de páginas de la guía. Si se regenera con más o menos páginas
 *  (docs/guia-conector/generar.py), actualizar este número. */
const PAGINAS_GUIA_CONECTOR = 7;
const CARPETA_GUIA = "/guias/conector-ia";
const PDF_GUIA = `${CARPETA_GUIA}/YamaSend-Guia-Conector-IA.pdf`;

/** Origen de la app (ej. https://yamasend.vercel.app). En el servidor no
 *  existe window: se devuelve vacío y se completa al hidratar. */
const sinSuscripcion = () => () => {};
function useOrigen(): string {
  return useSyncExternalStore(
    sinSuscripcion,
    () => window.location.origin,
    () => "",
  );
}

const SECCIONES: {
  key: Seccion;
  labelKey: "config_nav_mcp";
  icon: React.ReactNode;
}[] = [
  {
    key: "mcp",
    labelKey: "config_nav_mcp",
    icon: (
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
        <path d="M6 2.5v3M10 2.5v3M4.5 5.5h7v2.5a3.5 3.5 0 0 1-7 0V5.5ZM8 11.5v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
];

function NavItem({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[13.5px] font-semibold text-left cursor-pointer transition-colors w-full ${
        active ? "bg-ys-green-bg text-ys-green-text" : "text-[#3f4844] hover:bg-ys-el2"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

export default function ConfiguracionModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useLang();
  const [seccion, setSeccion] = useState<Seccion>("mcp");
  // Solo en mobile: menú de secciones o contenido (una pantalla a la vez).
  const [mobileView, setMobileView] = useState<"menu" | "content">("menu");
  const [copiado, setCopiado] = useState(false);
  const origen = useOrigen();

  // Cada apertura arranca desde el menú (mismo patrón de "ajustar estado
  // cuando cambia una prop" que usa MyProfileModal, sin useEffect).
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setMobileView("menu");
      setCopiado(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  // Se arma con el dominio desde el que se usa la app: es el mismo al que
  // hay que conectarse (producción → yamasend.vercel.app).
  const urlConector = `${origen}/api/mcp`;

  async function copiarUrl() {
    try {
      await navigator.clipboard.writeText(urlConector);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1800);
    } catch {
      // Sin permiso de portapapeles: la dirección queda visible para copiar a mano.
    }
  }

  function elegir(s: Seccion) {
    setSeccion(s);
    setMobileView("content");
  }

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[9000] bg-[rgba(16,24,20,0.34)] flex items-center justify-center p-4"
      style={{ animation: "ys-fade .16s ease both" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={t("config_title")}
        className="w-full max-w-[920px] h-[680px] max-h-[90dvh] bg-ys-card rounded-[18px] shadow-[var(--shadow-modal)] flex overflow-hidden"
        style={{ animation: "ys-modal .19s cubic-bezier(.4,0,.2,1) both" }}
      >
        {/* Sidebar interno */}
        <div
          className={`${mobileView === "menu" ? "flex" : "hidden"} md:flex w-full md:w-[220px] flex-none bg-ys-el2 border-r border-ys-border-soft p-4 flex-col gap-1`}
        >
          <div className="flex items-center justify-between px-2 pb-3">
            <div className="text-[15px] font-extrabold text-ys-text">{t("config_title")}</div>
            <button
              onClick={onClose}
              className="md:hidden w-8 h-8 rounded-lg flex items-center justify-center text-ys-dimmer hover:bg-ys-card hover:text-ys-text transition-colors cursor-pointer text-xl leading-none"
              aria-label={t("logout_cancel")}
            >
              ×
            </button>
          </div>

          {SECCIONES.map((s) => (
            <NavItem
              key={s.key}
              active={seccion === s.key}
              onClick={() => elegir(s.key)}
              label={t(s.labelKey)}
              icon={s.icon}
            />
          ))}

          <div className="hidden md:block mt-auto pt-3 border-t border-ys-border-softest">
            <button
              onClick={onClose}
              className="w-full text-[12.5px] font-bold text-ys-muted hover:text-ys-text transition-colors px-2 py-2 text-left cursor-pointer"
            >
              {t("logout_cancel")}
            </button>
          </div>
        </div>

        {/* Contenido */}
        <div
          className={`${mobileView === "content" ? "flex" : "hidden"} md:flex flex-1 min-w-0 overflow-y-auto p-5 md:p-7 flex-col gap-5 relative`}
        >
          <button
            onClick={() => setMobileView("menu")}
            className="flex md:hidden items-center gap-1.5 self-start text-[13px] font-bold text-ys-muted hover:text-ys-text transition-colors cursor-pointer -mt-1"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M10 3.5 5 8l5 4.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {t("config_title")}
          </button>

          <button
            onClick={onClose}
            aria-label={t("logout_cancel")}
            className="absolute top-5 right-5 w-8 h-8 rounded-lg flex items-center justify-center text-ys-dimmer hover:bg-ys-el2 hover:text-ys-text transition-colors cursor-pointer text-xl leading-none"
          >
            ×
          </button>

          {seccion === "mcp" && (
            <>
              <div className="flex flex-col gap-1 pr-10">
                <div className="text-[19px] font-extrabold tracking-[-0.02em] text-ys-text">
                  {t("config_mcp_title")}
                </div>
                <div className="text-[13.5px] text-ys-muted font-medium">{t("config_mcp_desc")}</div>
              </div>

              <div className="flex flex-col sm:flex-row gap-2.5 sm:items-end">
                <div className="flex-1 min-w-0 flex flex-col gap-[7px]">
                  <div className="text-[12.5px] font-bold text-ys-text">{t("config_mcp_url_label")}</div>
                  <div className="flex items-center gap-2 bg-ys-el2 border border-ys-border rounded-[10px] pl-3.5 pr-1.5 py-1.5 min-w-0">
                    <code className="flex-1 min-w-0 truncate font-mono text-[12.5px] text-ys-text">{urlConector}</code>
                    <button
                      onClick={copiarUrl}
                      className={`flex-none text-[12px] font-bold rounded-lg px-3 py-1.5 transition-colors cursor-pointer ${
                        copiado
                          ? "bg-ys-green-bg text-ys-green-text"
                          : "bg-ys-card text-ys-text border border-ys-border hover:bg-ys-el2"
                      }`}
                    >
                      {copiado ? t("config_mcp_copied") : t("config_mcp_copy")}
                    </button>
                  </div>
                </div>

                {/* color en style: la regla global `a { color }` de globals.css
                    le gana a las utilidades de Tailwind. */}
                <a
                  href={PDF_GUIA}
                  download
                  style={{ color: "#fff" }}
                  className="flex-none inline-flex items-center justify-center gap-2 bg-ys-green text-white text-[13px] font-bold px-4 py-[11px] rounded-[10px] transition-all hover:bg-ys-green-hover shadow-[var(--shadow-cta)]"
                >
                  <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                    <path d="M8 2.5v7.5M4.8 7 8 10.2 11.2 7M3 13h10" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  {t("config_mcp_download")}
                </a>
              </div>

              {/* La guía se muestra como imágenes por página y no con un visor
                  de PDF embebido: así se ve igual en cualquier navegador,
                  incluidos los celulares, que no muestran PDFs dentro de la
                  página. El PDF original queda en el botón de descarga. */}
              <div className="rounded-xl bg-ys-el2 border border-ys-border-soft p-3 sm:p-4 flex flex-col gap-3 sm:gap-4">
                {Array.from({ length: PAGINAS_GUIA_CONECTOR }, (_, i) => i + 1).map((n) => (
                  <Image
                    key={n}
                    src={`${CARPETA_GUIA}/pagina-${n}.webp`}
                    alt={t("config_mcp_page_alt").replace("{n}", String(n))}
                    width={1240}
                    height={1754}
                    sizes="(min-width: 768px) 640px, 100vw"
                    priority={n === 1}
                    className="w-full h-auto rounded-lg bg-white shadow-[0_2px_10px_rgba(16,24,20,0.08)]"
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
