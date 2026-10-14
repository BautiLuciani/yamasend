"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Campaign, CampaignStatus } from "@/lib/types";
import {
  ActionBar,
  BarBtn,
  BtnPrimary,
  CheckBox,
  SearchBox,
  SectionBody,
  SectionHeader,
  SectionPage,
  SelectionBar,
  pluralizar,
  type StatusTone,
} from "./SectionChrome";

interface CampanasProps {
  campaigns: Campaign[];
  onNewCampaign: () => void;
  /**
   * false NO esconde el botón: lo deja visible y bloqueado. Esconderlo hacía
   * que el permiso revocado fuera invisible —la sección simplemente perdía el
   * botón sin explicación—. Ahora se ve, y al tocarlo avisa quién puede
   * habilitarlo. El gate real sigue estando en el server action.
   */
  puedeCrear?: boolean;
  /** Se dispara al tocar el botón sin permiso. Muestra el aviso. */
  onSinPermiso?: () => void;
  onOpenCampaign: (campaignId: string) => void;
  /** Arma una campaña nueva con la misma audiencia y template. */
  onDuplicate: (campaign: Campaign) => void;
  /** Borra campañas. Resuelve cuando terminó (el padre refresca la lista). */
  onDelete: (ids: string[]) => Promise<void>;
  /** Campañas sugeridas por IA: se muestran arriba de la lista. */
  sugeridas?: ReactNode;
  /** Series que se repiten (CampanasRecurrentes); null/undefined si no hay. */
  recurrentes?: ReactNode;
}

const ESTADO_CONFIG: Record<CampaignStatus, { label: string; text: string; bg: string }> = {
  borrador: { label: "Borrador", text: "text-ys-muted", bg: "bg-ys-el2" },
  programada: { label: "Programada", text: "text-[#3f4844]", bg: "bg-ys-el2" },
  enviando: { label: "Enviando", text: "text-ys-warn-text", bg: "bg-ys-warn-bg" },
  enviado: { label: "Enviado", text: "text-ys-green-text", bg: "bg-[#d3f2e3]" },
  error: { label: "Error", text: "text-ys-red-text", bg: "bg-ys-red-bg" },
  cancelado: { label: "Cancelado", text: "text-ys-muted", bg: "bg-ys-el2" },
};

const ESTADO_FILTROS: { key: CampaignStatus | "todas"; label: string }[] = [
  { key: "todas", label: "Todos los estados" },
  { key: "borrador", label: "Borrador" },
  { key: "programada", label: "Programadas" },
  { key: "enviando", label: "Enviando" },
  { key: "enviado", label: "Enviadas" },
  { key: "error", label: "Error" },
  { key: "cancelado", label: "Canceladas" },
];

type Periodo = "todo" | "7d" | "30d" | "proximas";

const PERIODO_FILTROS: { key: Periodo; label: string }[] = [
  { key: "todo", label: "Todo el tiempo" },
  { key: "7d", label: "Últimos 7 días" },
  { key: "30d", label: "Últimos 30 días" },
  { key: "proximas", label: "Próximas" },
];

function EstadoBadge({ estado }: { estado: CampaignStatus }) {
  const cfg = ESTADO_CONFIG[estado];
  return (
    <span className={`inline-flex items-center text-xs font-extrabold rounded-full px-[11px] py-1 ${cfg.text} ${cfg.bg}`}>
      {cfg.label}
    </span>
  );
}

function formatFecha(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}`;
}

/** Desplegable de filtro de 44 px, con el mismo aspecto que el resto de la barra. */
function FilterMenu<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { key: T; label: string }[];
  value: T;
  onChange: (k: T) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);
  const actual = options.find((o) => o.key === value)?.label ?? label;
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="inline-flex items-center gap-2 h-11 box-border px-3.5 bg-ys-card border border-ys-border rounded-[10px] text-[13px] font-bold text-ys-text cursor-pointer transition-colors hover:bg-[#f7f9f8]"
      >
        {actual}
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div
          role="listbox"
          className="absolute top-[calc(100%+6px)] left-0 min-w-[184px] bg-ys-card border border-ys-border rounded-xl p-1.5 shadow-[var(--shadow-popover)] flex flex-col gap-0.5 z-30"
        >
          {options.map((o) => (
            <button
              key={o.key}
              type="button"
              role="option"
              aria-selected={o.key === value}
              onClick={() => {
                onChange(o.key);
                setOpen(false);
              }}
              className={`text-left px-[11px] py-2.5 rounded-lg text-[13px] cursor-pointer transition-colors hover:bg-[#f5f7f6] ${
                o.key === value ? "font-extrabold text-ys-green-text" : "font-semibold text-[#3f4844]"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const GRID = "md:grid-cols-[44px_minmax(0,2.2fr)_minmax(0,1.5fr)_minmax(0,1.5fr)_90px_130px]";

export default function Campanas({
  campaigns,
  onNewCampaign,
  onOpenCampaign,
  onDuplicate,
  onDelete,
  puedeCrear = true,
  onSinPermiso,
  sugeridas,
  recurrentes,
}: CampanasProps) {
  const [query, setQuery] = useState("");
  const [estadoFiltro, setEstadoFiltro] = useState<CampaignStatus | "todas">("todas");
  const [periodoFiltro, setPeriodoFiltro] = useState<Periodo>("todo");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [confirmando, setConfirmando] = useState(false);
  const [borrando, setBorrando] = useState(false);

  const [ahora] = useState(() => Date.now());

  const filtered = useMemo(() => {
    const DIA_MS = 24 * 60 * 60 * 1000;
    return campaigns.filter((c) => {
      if (!c.nombre.toLowerCase().includes(query.toLowerCase())) return false;
      if (estadoFiltro !== "todas" && c.status !== estadoFiltro) return false;
      if (periodoFiltro === "proximas") {
        if (!c.fechaProgramada) return false;
        if (new Date(c.fechaProgramada).getTime() < ahora) return false;
      } else if (periodoFiltro === "7d" || periodoFiltro === "30d") {
        const ref = c.enviadoAt ?? c.createdAt;
        if (!ref) return false;
        const dias = periodoFiltro === "7d" ? 7 : 30;
        if (ahora - new Date(ref).getTime() > dias * DIA_MS) return false;
      }
      return true;
    });
  }, [campaigns, query, estadoFiltro, periodoFiltro, ahora]);

  useEffect(() => {
    if (sel.size === 0) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSel(new Set());
        setConfirmando(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sel.size]);

  const seleccionadas = filtered.filter((c) => sel.has(c.id));
  const todasMarcadas = filtered.length > 0 && seleccionadas.length === filtered.length;
  const unica = seleccionadas.length === 1 ? seleccionadas[0] : null;
  const hayEnviando = seleccionadas.some((c) => c.status === "enviando");

  function toggle(id: string) {
    setConfirmando(false);
    setSel((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function eliminar() {
    setBorrando(true);
    await onDelete(seleccionadas.map((c) => c.id));
    setBorrando(false);
    setConfirmando(false);
    setSel(new Set());
  }

  const activas = campaigns.filter((c) => c.status === "enviando").length;
  const programadas = campaigns.filter((c) => c.status === "programada").length;
  const conError = campaigns.filter((c) => c.status === "error").length;
  const tone: StatusTone = conError > 0 ? "warn" : activas > 0 ? "warn" : "neutral";
  const valor =
    campaigns.length === 0
      ? "Sin campañas"
      : [
          `${activas} enviando`,
          `${programadas} programada${programadas === 1 ? "" : "s"}`,
          conError > 0 ? `${conError} con error` : null,
        ]
          .filter(Boolean)
          .join(" · ");

  const hayCampanas = campaigns.length > 0;

  return (
    <SectionPage>
      <SectionHeader
        title="Campañas"
        subtitle="Creá, enviá y analizá tus campañas de WhatsApp."
        status={{
          icon: (
            <svg width="20" height="20" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M2.5 6.5v3l7 3.5v-10l-7 3.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
              <path d="M12 6v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          ),
          label: "Envíos",
          value: valor,
          tone,
        }}
      />

      <ActionBar>
        <BtnPrimary onClick={puedeCrear ? onNewCampaign : onSinPermiso} bloqueado={!puedeCrear}>
          Nueva campaña
        </BtnPrimary>
        {hayCampanas && (
          <>
            <SearchBox value={query} onChange={setQuery} placeholder="Buscar campaña..." />
            <FilterMenu label="Todos los estados" options={ESTADO_FILTROS} value={estadoFiltro} onChange={setEstadoFiltro} />
            <FilterMenu label="Todo el tiempo" options={PERIODO_FILTROS} value={periodoFiltro} onChange={setPeriodoFiltro} />
          </>
        )}
      </ActionBar>

      <SectionBody>
        {sugeridas}
        {recurrentes}

        {!hayCampanas ? (
          <div className="bg-ys-card border border-ys-border rounded-2xl py-16 px-6 flex flex-col items-center gap-3.5">
            <div className="text-[19px] font-extrabold tracking-[-0.02em] text-ys-text">Todavía no se crearon campañas</div>
            <div className="text-sm text-ys-muted font-medium text-center max-w-[440px]">
              Elegí una audiencia, seleccioná un mensaje y empezá a comunicarte con tus contactos.
            </div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-ys-card border border-ys-border rounded-2xl py-[52px] px-6 flex flex-col items-center gap-2.5">
            <div className="text-base font-extrabold text-ys-text">Sin resultados</div>
            <div className="text-[13.5px] text-ys-muted font-medium">Probá con otro nombre o cambiá los filtros.</div>
          </div>
        ) : (
          <div className="bg-ys-card border border-ys-border rounded-2xl overflow-hidden">
            <div
              className={`hidden md:grid ${GRID} items-center px-5 py-3 border-b border-ys-border text-[11px] font-extrabold tracking-[0.06em] uppercase text-ys-muted`}
            >
              <CheckBox
                checked={todasMarcadas}
                indeterminate={!todasMarcadas && seleccionadas.length > 0}
                onChange={() => setSel(todasMarcadas ? new Set() : new Set(filtered.map((c) => c.id)))}
                label="Seleccionar todas las campañas"
              />
              <span>Campaña</span>
              <span>Audiencia</span>
              <span>Template</span>
              <span>Fecha</span>
              <span>Estado</span>
            </div>
            {filtered.map((c, i) => {
              const marcada = sel.has(c.id);
              return (
                <div
                  key={c.id}
                  onClick={() => onOpenCampaign(c.id)}
                  className={`grid grid-cols-[28px_minmax(0,1fr)_auto] ${GRID} items-center gap-x-3 gap-y-1 px-4 md:px-5 py-3.5 cursor-pointer transition-colors ${
                    i > 0 ? "border-t border-ys-border-softer" : ""
                  } ${marcada ? "bg-ys-green-bg" : "hover:bg-[#fbfcfb]"}`}
                >
                  <CheckBox checked={marcada} onChange={() => toggle(c.id)} label={`Seleccionar ${c.nombre}`} />
                  <div className="min-w-0 flex flex-col gap-0.5">
                    <span className="text-sm font-extrabold text-ys-text truncate">{c.nombre}</span>
                    <span className="font-mono text-[11.5px] text-ys-muted">{c.contactosCount} destinatarios</span>
                  </div>
                  <span className="md:hidden">
                    <EstadoBadge estado={c.status} />
                  </span>
                  <span className="hidden md:block text-[13px] font-semibold text-[#3f4844] truncate">{c.listaNombre ?? "—"}</span>
                  <span className="hidden md:block font-mono text-[12.5px] text-ys-muted truncate">{c.templateNombre ?? "—"}</span>
                  <span className="hidden md:block font-mono text-[12.5px] text-ys-muted">
                    {formatFecha(c.fechaProgramada ?? c.enviadoAt ?? c.createdAt)}
                  </span>
                  <span className="hidden md:block">
                    <EstadoBadge estado={c.status} />
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </SectionBody>

      {seleccionadas.length > 0 && (
        <SelectionBar
          texto={
            confirmando
              ? `¿Eliminar ${pluralizar(seleccionadas.length, "campaña", "campañas")}?`
              : pluralizar(seleccionadas.length, "campaña", "campañas")
          }
          onClear={() => {
            setSel(new Set());
            setConfirmando(false);
          }}
        >
          {confirmando ? (
            <>
              <BarBtn onClick={() => setConfirmando(false)} disabled={borrando}>
                Cancelar
              </BarBtn>
              <BarBtn variante="danger" onClick={eliminar} disabled={borrando}>
                {borrando ? "Eliminando…" : "Sí, eliminar"}
              </BarBtn>
            </>
          ) : (
            <>
              {unica && <BarBtn onClick={() => onOpenCampaign(unica.id)}>Ver detalle</BarBtn>}
              {unica && puedeCrear && unica.status !== "borrador" && (
                <BarBtn variante="primary" onClick={() => onDuplicate(unica)}>
                  Duplicar
                </BarBtn>
              )}
              {puedeCrear && !hayEnviando && (
                <BarBtn variante="danger" onClick={() => setConfirmando(true)}>
                  Eliminar
                </BarBtn>
              )}
            </>
          )}
        </SelectionBar>
      )}
    </SectionPage>
  );
}
