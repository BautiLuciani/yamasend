"use client";

import { useState } from "react";
import type { Contact, ChatPayload } from "@/lib/types";
import { ScoreBadge } from "./ContactsTable";

function initialsOf(nombre: string): string {
  const parts = nombre.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "—";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

// -------------------------------------------------------------------------
// Tarjeta: seleccionar_contactos
// Tabla de contactos con checkboxes dentro del chat, con posible
// preselección (cuando vino de un análisis de IA por consulta).
// -------------------------------------------------------------------------
interface SeleccionarContactosCardProps {
  contacts: Contact[];
  preselectedIds: string[];
  consultaUsada?: string | null;
  onConfirm: (contactosIds: string[]) => void;
  disabled?: boolean;
}

export function SeleccionarContactosCard({
  contacts,
  preselectedIds,
  consultaUsada,
  onConfirm,
  disabled,
}: SeleccionarContactosCardProps) {
  const [selected, setSelected] = useState<Set<string>>(
    new Set(preselectedIds),
  );
  const [query, setQuery] = useState("");
  const [confirmed, setConfirmed] = useState(false);

  function toggle(id: string) {
    if (confirmed) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const filtered = contacts.filter(
    (c) =>
      c.nombre.toLowerCase().includes(query.toLowerCase()) ||
      c.tel.includes(query),
  );

  return (
    <div className="bg-white border border-ys-border rounded-2xl overflow-hidden flex flex-col">
      {consultaUsada && (
        <div className="px-4 py-2.5 bg-ys-green-bg text-xs font-bold text-ys-green-text border-b border-ys-border-softest">
          Filtrado por: &ldquo;{consultaUsada}&rdquo;
        </div>
      )}
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-ys-border-softest">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="flex-none">
          <circle cx="7" cy="7" r="4.5" stroke="#9aa19c" strokeWidth="1.5" />
          <path d="m10.5 10.5 3 3" stroke="#9aa19c" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar contacto..."
          disabled={confirmed}
          className="flex-1 min-w-0 border-none outline-none bg-transparent text-[13px] font-semibold text-ys-text disabled:opacity-60"
        />
        <div className="flex-none text-xs font-bold text-ys-green-text bg-ys-green-bg rounded-full px-2.5 py-1">
          {selected.size} seleccionado{selected.size === 1 ? "" : "s"}
        </div>
      </div>

      <div className="max-h-[280px] overflow-y-auto flex flex-col">
        {filtered.length === 0 && (
          <div className="text-center text-[13px] text-ys-muted font-medium py-6">
            No encontramos contactos con ese nombre.
          </div>
        )}
        {filtered.map((c) => {
          const active = selected.has(c.id);
          return (
            <button
              key={c.id}
              onClick={() => toggle(c.id)}
              disabled={confirmed}
              className="flex items-center gap-3 px-4 py-2.5 border-b border-ys-border-softest last:border-b-0 text-left transition-colors hover:bg-[#f7fbf9] disabled:hover:bg-transparent disabled:cursor-default"
            >
              <div className="w-[18px] h-[18px] flex-none rounded-[6px] border-[1.5px] border-ys-border bg-white flex items-center justify-center">
                {active && (
                  <div className="w-[18px] h-[18px] -m-[1.5px] rounded-[6px] bg-ys-green flex items-center justify-center">
                    <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
                      <path d="m3 8.4 3.4 3L13 4.6" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                )}
              </div>
              <div className="w-[30px] h-[30px] flex-none rounded-full bg-ys-el2 text-[#5d6560] text-[11px] font-extrabold flex items-center justify-center">
                {initialsOf(c.nombre)}
              </div>
              <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                <div className="text-[13.5px] font-bold text-ys-text truncate">
                  {c.nombre || "Sin nombre"}
                </div>
                <div className="font-mono text-[11.5px] text-ys-dim truncate">
                  {c.tel || "—"}
                </div>
              </div>
              <ScoreBadge score={c.score} />
            </button>
          );
        })}
      </div>

      <div className="px-4 py-3 border-t border-ys-border-softest">
        <button
          onClick={() => {
            setConfirmed(true);
            onConfirm(Array.from(selected));
          }}
          disabled={confirmed || disabled || selected.size === 0}
          className="w-full text-[13px] font-bold text-white bg-ys-green rounded-[10px] py-2.5 cursor-pointer transition-all hover:bg-ys-green-hover disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {confirmed ? "Selección confirmada" : "Confirmar selección"}
        </button>
      </div>
    </div>
  );
}

// -------------------------------------------------------------------------
// Tarjeta: confirmar_grupo
// Resumen final antes de escribir en Supabase — el usuario tiene que hacer
// click explícito, el bot nunca crea el grupo solo.
// -------------------------------------------------------------------------
interface ConfirmarGrupoCardProps {
  nombre: string;
  contactosIds: string[];
  onConfirm: () => void;
  disabled?: boolean;
}

export function ConfirmarGrupoCard({
  nombre,
  contactosIds,
  onConfirm,
  disabled,
}: ConfirmarGrupoCardProps) {
  const [confirmed, setConfirmed] = useState(false);

  return (
    <div className="bg-white border border-ys-border rounded-2xl px-5 py-[18px] flex flex-col gap-3.5">
      <div className="flex items-center gap-3">
        <div className="w-[38px] h-[38px] flex-none rounded-xl bg-ys-green-bg flex items-center justify-center">
          <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
            <circle cx="5.2" cy="6" r="2.2" stroke="#12B76A" strokeWidth="1.5" />
            <circle cx="10.8" cy="6" r="2.2" stroke="#12B76A" strokeWidth="1.5" />
            <path d="M1.8 13c0-1.9 1.5-3 3.4-3s3.4 1.1 3.4 3M7.4 13c0-1.9 1.5-3 3.4-3s3.4 1.1 3.4 3" stroke="#12B76A" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </div>
        <div className="flex-1 min-w-0 flex flex-col gap-0.5">
          <div className="text-[15px] font-extrabold text-ys-text truncate">{nombre}</div>
          <div className="text-xs text-ys-dim font-semibold">
            {contactosIds.length} contacto{contactosIds.length === 1 ? "" : "s"}
          </div>
        </div>
      </div>
      <button
        onClick={() => {
          setConfirmed(true);
          onConfirm();
        }}
        disabled={confirmed || disabled}
        className="text-[13px] font-bold text-white bg-ys-green rounded-[10px] py-2.5 cursor-pointer transition-all hover:bg-ys-green-hover disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {confirmed ? "Creando..." : "Crear grupo"}
      </button>
    </div>
  );
}

// -------------------------------------------------------------------------
// Tarjeta: grupo_creado
// Confirmación final + follow-ups, en el mismo espíritu que hasFollowUps
// del prototipo.
// -------------------------------------------------------------------------
interface GrupoCreadoCardProps {
  nombre: string;
  totalContactos: number;
  onVerGrupo: () => void;
}

export function GrupoCreadoCard({
  nombre,
  totalContactos,
  onVerGrupo,
}: GrupoCreadoCardProps) {
  return (
    <div className="bg-white border border-ys-border rounded-2xl px-5 py-[18px] flex items-center gap-3">
      <div className="w-[38px] h-[38px] flex-none rounded-xl bg-ys-green-bg flex items-center justify-center">
        <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
          <path d="m3 8.4 4 4L14 3.6" stroke="#12B76A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <div className="flex-1 min-w-0 flex flex-col gap-0.5">
        <div className="text-[14.5px] font-extrabold text-ys-text truncate">{nombre}</div>
        <div className="text-xs text-ys-dim font-semibold">
          {totalContactos} contacto{totalContactos === 1 ? "" : "s"} · Grupo creado
        </div>
      </div>
      <button
        onClick={onVerGrupo}
        className="flex-none text-[12.5px] font-bold text-ys-green-text cursor-pointer transition-colors hover:text-ys-green"
      >
        Ver grupo →
      </button>
    </div>
  );
}

/** Selector genérico según el `kind` del payload — usado desde IA.tsx. */
export function renderChatCard(
  payload: ChatPayload,
  contacts: Contact[],
  handlers: {
    onConfirmSeleccion: (ids: string[]) => void;
    onConfirmGrupo: () => void;
    onVerGrupo: (grupoId: string) => void;
  },
  isLatest: boolean,
) {
  if (payload.kind === "seleccionar_contactos") {
    return (
      <SeleccionarContactosCard
        contacts={contacts}
        preselectedIds={payload.preselectedIds}
        consultaUsada={payload.consultaUsada}
        onConfirm={handlers.onConfirmSeleccion}
        disabled={!isLatest}
      />
    );
  }
  if (payload.kind === "confirmar_grupo") {
    return (
      <ConfirmarGrupoCard
        nombre={payload.nombre}
        contactosIds={payload.contactosIds}
        onConfirm={handlers.onConfirmGrupo}
        disabled={!isLatest}
      />
    );
  }
  if (payload.kind === "grupo_creado") {
    return (
      <GrupoCreadoCard
        nombre={payload.nombre}
        totalContactos={payload.totalContactos}
        onVerGrupo={() => handlers.onVerGrupo(payload.grupoId)}
      />
    );
  }
  return null;
}
