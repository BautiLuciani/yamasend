"use client";

import type { Contact, ScoreTemp } from "@/lib/types";

interface ContactsTableProps {
  contacts: Contact[];
  selected: Set<string>;
  onToggleRow: (id: string) => void;
  onToggleAll: (checked: boolean) => void;
  onOpenDetail: (contact: Contact) => void;
  modo24h: boolean;
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

export default function ContactsTable({
  contacts,
  selected,
  onToggleRow,
  onToggleAll,
  onOpenDetail,
  modo24h,
}: ContactsTableProps) {
  const visibleSelectable = contacts.filter((c) => !c.bloqueado || modo24h);
  const allChecked =
    visibleSelectable.length > 0 &&
    visibleSelectable.every((c) => selected.has(c.id));

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
      </div>
    );
  }

  return (
    <div className="flex flex-col overflow-visible">
      {/* ── Vista mobile: solo avatar/iniciales + nombre ── */}
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
              <div className="flex-1 min-w-0">
                <div className="text-[14px] font-bold text-ys-text truncate">
                  {c.nombre || <span className="text-ys-muted font-normal">Sin nombre</span>}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Vista desktop: tabla ── */}
      <div className="overflow-visible hidden md:block">
        <div className="grid grid-cols-[44px_1.7fr_1fr_.8fr_.5fr_.6fr] items-center px-6 py-2.5 bg-ys-bg border-t border-b border-ys-border-soft text-[11px] font-extrabold tracking-[0.07em] uppercase text-ys-dimmer">
          <div>
            <div onClick={() => onToggleAll(!allChecked)} className="cursor-pointer inline-flex">
              <Checkbox checked={allChecked} />
            </div>
          </div>
          <div>Nombre</div>
          <div>Tel.</div>
          <div>Score</div>
          <div className="text-right">Msjs</div>
          <div className="text-right">Último</div>
        </div>

        {contacts.map((c) => {
          const bloq = !modo24h && c.bloqueado;
          const isSel = selected.has(c.id) && !bloq;
          return (
            <div
              key={c.id}
              onClick={() => onOpenDetail(c)}
              className={`grid grid-cols-[44px_1.7fr_1fr_.8fr_.5fr_.6fr] items-center px-6 py-[13px] border-b border-ys-border-softer cursor-pointer transition-colors hover:bg-[#f7fbf9] ${
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
              <div className="flex items-center gap-[11px] min-w-0">
                <div className="w-8 h-8 flex-none rounded-full bg-ys-green-bg text-ys-green-text text-[11.5px] font-extrabold flex items-center justify-center">
                  {initialsOf(c.nombre)}
                </div>
                <div className="text-sm font-bold text-ys-text truncate">
                  {c.nombre || <span className="text-ys-muted font-normal">Sin nombre</span>}
                </div>
              </div>
              <div className="font-mono text-[12.5px] text-ys-muted truncate">
                {c.tel || "—"}
              </div>
              <div>
                <ScoreBadge score={c.score} />
              </div>
              <div className="text-right font-mono text-[13px] text-[#3f4844]">
                {c.mensajes}
              </div>
              <div className="text-right font-mono text-[12.5px] text-ys-dim">
                {c.ultimo || "—"}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
