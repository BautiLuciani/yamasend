"use client";

import { useState } from "react";
import type { Contact, ScoreTemp } from "@/lib/types";
import EtiquetaChip from "./EtiquetaChip";
import type { OrdenKey } from "./ContactosBarra";

interface ContactsTableProps {
  contacts: Contact[];
  selected: Set<string>;
  onToggleRow: (id: string) => void;
  onToggleAll: (checked: boolean) => void;
  onOpenDetail: (contact: Contact) => void;
  modo24h: boolean;
  ordenKey?: OrdenKey | null;
  ordenDir?: "asc" | "desc";
  onOrden?: (k: OrdenKey) => void;
  /** Se muestra en el estado vacío para conectar el WhatsApp. */
  onVincular?: () => void;
  /** Guarda un nombre editado. Devuelve un mensaje de error, o null si salió bien. */
  onRenombrar?: (id: string, nombre: string) => Promise<string | null>;
}

function initialsOf(nombre: string): string {
  const parts = nombre.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "—";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export function ScoreBadge({ score }: { score: ScoreTemp }) {
  if (score === "caliente")
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold text-ys-green-text bg-ys-green-bg">
        <span className="w-[7px] h-[7px] rounded-full bg-ys-green" />
        Caliente
      </span>
    );
  if (score === "tibio")
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold text-ys-warn-text bg-ys-warn-bg">
        <span
          className="w-[7px] h-[7px] rounded-full border-[1.5px]"
          style={{ borderColor: "#c07a12", background: "linear-gradient(90deg,#c07a12 50%,transparent 50%)" }}
        />
        Tibio
      </span>
    );
  if (score === "frio")
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold text-[#5d6560] bg-ys-el2">
        <span className="w-[7px] h-[7px] rounded-full border-[1.5px] border-[#8a908c]" />
        Frío
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold text-ys-dimmer bg-ys-el2">
      Sin analizar
    </span>
  );
}

/** Colores del score como etiqueta fija (Caliente, Tibio y Frío están siempre). */
export const SCORE_PILL: Record<"caliente" | "tibio" | "frio", { label: string; solido: string; suave: string }> = {
  caliente: { label: "Caliente", solido: "#e5383b", suave: "#fdecec" },
  tibio: { label: "Tibio", solido: "#12a150", suave: "#e7f7ee" },
  frio: { label: "Frío", solido: "#2f6fe0", suave: "#e8f0fd" },
};

function ScorePill({ score }: { score: ScoreTemp }) {
  if (score !== "caliente" && score !== "tibio" && score !== "frio") {
    return (
      <span className="inline-flex items-center rounded-full px-2.5 py-[1px] text-[10.5px] font-bold text-ys-dimmer bg-ys-el2 whitespace-nowrap">
        Sin analizar
      </span>
    );
  }
  const c = SCORE_PILL[score];
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-[1px] text-[10.5px] font-bold text-white whitespace-nowrap"
      style={{ background: c.solido }}
    >
      {c.label}
    </span>
  );
}

function Checkbox({ checked, disabled }: { checked: boolean; disabled?: boolean }) {
  return (
    <div
      className={`w-[19px] h-[19px] rounded-[6px] border-[1.5px] flex items-center justify-center flex-shrink-0 transition-colors ${
        checked ? "bg-ys-green border-ys-green" : "bg-white border-ys-border2"
      } ${disabled ? "opacity-50" : ""}`}
    >
      {checked && (
        <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
          <path d="m3 8.4 3.4 3L13 4.6" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </div>
  );
}

const GRID = "grid-cols-[44px_1.6fr_1fr_2.4fr_.5fr_.6fr]";

export default function ContactsTable({
  contacts,
  selected,
  onToggleRow,
  onToggleAll,
  onOpenDetail,
  modo24h,
  ordenKey = null,
  ordenDir = "asc",
  onOrden,
  onVincular,
  onRenombrar,
}: ContactsTableProps) {
  const [editId, setEditId] = useState<string | null>(null);
  const [editVal, setEditVal] = useState("");
  const [errorNombre, setErrorNombre] = useState<string | null>(null);

  const visibleSelectable = contacts.filter((c) => !c.bloqueado || modo24h);
  const allChecked = visibleSelectable.length > 0 && visibleSelectable.every((c) => selected.has(c.id));

  function empezarEdicion(c: Contact) {
    setEditId(c.id);
    setEditVal(c.nombre || "");
    setErrorNombre(null);
  }

  async function guardarNombre(c: Contact) {
    const nuevo = editVal.replace(/\s+/g, " ").trim();
    setEditId(null);
    if (!nuevo || nuevo === (c.nombre || "").trim() || !onRenombrar) return;
    const e = await onRenombrar(c.id, nuevo);
    if (e) setErrorNombre(e);
  }

  function th(k: OrdenKey, label: string, derecha?: boolean) {
    const activo = ordenKey === k;
    return (
      <button
        type="button"
        onClick={() => onOrden?.(k)}
        className={`inline-flex items-center gap-1 uppercase tracking-[0.07em] font-extrabold cursor-pointer hover:text-ys-text ${
          derecha ? "justify-end" : "justify-start"
        } ${activo ? "text-ys-text" : ""}`}
      >
        {label}
        <span className={activo ? "" : "opacity-30"}>{activo ? (ordenDir === "asc" ? "▲" : "▼") : "↕"}</span>
      </button>
    );
  }

  function etiquetasDe(c: Contact, max: number) {
    const e = c.etiquetas ?? [];
    return (
      <>
        {e.slice(0, max).map((x) => (
          <EtiquetaChip key={x} nombre={x} chica />
        ))}
        {e.length > max && <span className="text-[10.5px] font-bold text-ys-dimmer">+{e.length - max}</span>}
        <ScorePill score={c.score} />
      </>
    );
  }

  function celdaNombre(c: Contact) {
    if (editId === c.id) {
      return (
        <input
          value={editVal}
          onChange={(e) => setEditVal(e.target.value)}
          onClick={(e) => e.stopPropagation()}
          onBlur={() => guardarNombre(c)}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") setEditId(null);
          }}
          maxLength={80}
          autoFocus
          className="w-full min-w-0 border border-ys-green rounded-lg px-2 py-1 text-sm font-bold text-ys-text outline-none"
        />
      );
    }
    return (
      <div className="flex items-center gap-1.5 min-w-0">
        <div className="text-sm font-bold text-ys-text truncate">
          {c.nombre || <span className="text-ys-muted font-normal">Sin nombre</span>}
        </div>
        {onRenombrar && (
          <button
            type="button"
            title="Editar nombre"
            aria-label="Editar nombre"
            onClick={(e) => {
              e.stopPropagation();
              empezarEdicion(c);
            }}
            className="flex-none w-6 h-6 rounded-md flex items-center justify-center text-ys-dimmer opacity-60 hover:opacity-100 hover:bg-ys-el2 cursor-pointer"
          >
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
              <path d="m11 2.5 2.5 2.5L5.5 13H3v-2.5L11 2.5Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
            </svg>
          </button>
        )}
      </div>
    );
  }

  if (contacts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16 px-6">
        <div className="w-11 h-11 rounded-2xl bg-ys-el2 flex items-center justify-center">
          <svg width="20" height="20" viewBox="0 0 16 16" fill="none">
            <circle cx="6" cy="5.5" r="2.5" stroke="#9aa19c" strokeWidth="1.5" />
            <path d="M2 13.5c0-2.2 1.8-3.5 4-3.5s4 1.3 4 3.5" stroke="#9aa19c" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </div>
        <div className="text-sm font-bold text-ys-text">No hay contactos para mostrar</div>
        <div className="text-[13px] text-ys-muted font-medium text-center">
          Vinculá tu WhatsApp e importá tus contactos para empezar.
        </div>
        {onVincular && (
          <button
            type="button"
            onClick={onVincular}
            className="mt-1 text-[13px] font-bold text-white bg-ys-green rounded-[10px] px-4 py-2.5 cursor-pointer transition-all hover:bg-ys-green-hover"
          >
            Vincular WhatsApp
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col overflow-visible">
      {errorNombre && (
        <div
          onClick={() => setErrorNombre(null)}
          className="text-[12.5px] font-semibold text-ys-red-text bg-ys-red-bg px-4 md:px-6 py-2 cursor-pointer"
        >
          {errorNombre}
        </div>
      )}

      {/* ── Vista mobile ── */}
      <div className="overflow-visible md:hidden">
        {contacts.map((c) => {
          const bloq = !modo24h && c.bloqueado;
          const isSel = selected.has(c.id) && !bloq;
          return (
            <div
              key={c.id}
              onClick={() => onOpenDetail(c)}
              className={`flex items-center gap-3 px-4 py-3 border-b border-ys-border-softer cursor-pointer transition-colors active:bg-[#f7fbf9] ${
                isSel ? "bg-ys-green-bg" : ""
              } ${bloq ? "opacity-60" : ""}`}
            >
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  if (!bloq) onToggleRow(c.id);
                }}
              >
                <Checkbox checked={isSel} disabled={bloq} />
              </div>
              <div className="w-[34px] h-[34px] flex-none rounded-full bg-ys-el2 text-[#5d6560] text-[11.5px] font-extrabold flex items-center justify-center">
                {initialsOf(c.nombre)}
              </div>
              <div className="flex-1 min-w-0 flex flex-col gap-1">
                {celdaNombre(c)}
                <div className="flex flex-wrap items-center gap-1">{etiquetasDe(c, 2)}</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Vista desktop: tabla ── */}
      <div className="overflow-visible hidden md:block">
        <div className={`grid ${GRID} items-center px-6 py-2.5 bg-ys-bg border-t border-b border-ys-border-soft text-[11px] font-extrabold tracking-[0.07em] uppercase text-ys-dimmer`}>
          <div>
            <div onClick={() => onToggleAll(!allChecked)} className="cursor-pointer inline-flex">
              <Checkbox checked={allChecked} />
            </div>
          </div>
          {th("nombre", "Nombre")}
          {th("tel", "Tel.")}
          <div className="flex items-center gap-3">
            {th("etiquetas", "Etiquetas")}
            {th("score", "Score")}
          </div>
          {th("mensajes", "Msjs", true)}
          {th("ultimo", "Último", true)}
        </div>

        {contacts.map((c) => {
          const bloq = !modo24h && c.bloqueado;
          const isSel = selected.has(c.id) && !bloq;
          return (
            <div
              key={c.id}
              onClick={() => onOpenDetail(c)}
              className={`grid ${GRID} items-center px-6 py-[13px] border-b border-ys-border-softer cursor-pointer transition-colors hover:bg-[#f7fbf9] ${
                isSel ? "bg-ys-green-bg" : ""
              } ${bloq ? "opacity-60" : ""}`}
            >
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  if (!bloq) onToggleRow(c.id);
                }}
              >
                <Checkbox checked={isSel} disabled={bloq} />
              </div>
              <div className="flex items-center gap-[11px] min-w-0 pr-2">
                <div className="w-8 h-8 flex-none rounded-full bg-ys-green-bg text-ys-green-text text-[11.5px] font-extrabold flex items-center justify-center">
                  {initialsOf(c.nombre)}
                </div>
                <div className="min-w-0 flex-1">{celdaNombre(c)}</div>
              </div>
              <div className="font-mono text-[12.5px] text-ys-muted truncate">{c.tel || "—"}</div>
              <div className="flex flex-wrap items-center gap-1 min-w-0 pr-2">{etiquetasDe(c, 3)}</div>
              <div className="text-right font-mono text-[13px] text-[#3f4844]">{c.mensajes}</div>
              <div className="text-right font-mono text-[12.5px] text-ys-dim">{c.ultimo || "—"}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
