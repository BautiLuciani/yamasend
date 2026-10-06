"use client";

import { useMemo, useState } from "react";
import type { Contact, ContactList } from "@/lib/types";

interface AudienciasProps {
  lists: ContactList[];
  contacts: Contact[];
  onOpenGroup: (group: ContactList) => void;
  onCreateGroup: () => void;
  /** false esconde los botones de alta. El gate real está en el server action. */
  /**
   * false NO esconde el botón: lo deja visible y bloqueado. Esconderlo hacía
   * que el permiso revocado fuera invisible —la sección simplemente perdía el
   * botón sin explicación—. Ahora se ve, y al tocarlo avisa quién puede
   * habilitarlo. El gate real sigue estando en el server action.
   */
  puedeCrear?: boolean;
  /** Se dispara al tocar el botón sin permiso. Muestra el aviso. */
  onSinPermiso?: () => void;
}

function initialsOf(nombre: string): string {
  const parts = nombre.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "—";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export default function Audiencias({ lists, contacts, onOpenGroup, onCreateGroup, puedeCrear = true, onSinPermiso }: AudienciasProps) {
  const [query, setQuery] = useState("");

  const totalContactosOrganizados = useMemo(
    () => new Set(lists.flatMap((l) => l.contactosIds)).size,
    [lists],
  );

  const filtered = lists.filter((l) =>
    l.nombre.toLowerCase().includes(query.toLowerCase()),
  );

  const contactById = useMemo(() => {
    const map = new Map<string, Contact>();
    contacts.forEach((c) => map.set(c.id, c));
    return map;
  }, [contacts]);

  return (
    <div className="flex-1 min-w-0 bg-ys-bg px-4 md:px-[38px] pt-3 md:pt-[34px] pb-7 md:pb-10 flex flex-col gap-5 md:gap-6 overflow-y-auto">
      <div className="flex items-end gap-5 flex-wrap">
        <div className="flex flex-col gap-1.5">
          <div className="text-2xl md:text-[28px] font-extrabold tracking-[-0.025em] text-ys-text">
            Audiencias
          </div>
          <div className="text-sm md:text-[15px] text-ys-muted font-medium">
            Organizá tus contactos para crear campañas más efectivas.
          </div>
        </div>
        {lists.length > 0 && (
          <div className="ml-auto flex items-center gap-[18px] flex-wrap text-[13px] text-ys-muted font-semibold">
            <span>
              <span className="font-mono text-ys-text">{lists.length}</span> audiencia{lists.length === 1 ? "" : "s"}
            </span>
            <span className="w-px h-3.5 bg-[#e2e5e3]" />
            <span>
              <span className="font-mono text-ys-text">{totalContactosOrganizados}</span> contactos organizados
            </span>
          </div>
        )}
      </div>

      {lists.length === 0 ? (
        <div className="bg-white border border-ys-border rounded-2xl py-16 px-6 flex flex-col items-center gap-3.5">
          <div className="w-[58px] h-[58px] rounded-[18px] bg-ys-green-bg flex items-center justify-center">
            <svg width="26" height="26" viewBox="0 0 16 16" fill="none">
              <circle cx="5.2" cy="6" r="2.2" stroke="#12B76A" strokeWidth="1.5" />
              <circle cx="10.8" cy="6" r="2.2" stroke="#12B76A" strokeWidth="1.5" />
              <path d="M1.8 13c0-1.9 1.5-3 3.4-3s3.4 1.1 3.4 3M7.4 13c0-1.9 1.5-3 3.4-3s3.4 1.1 3.4 3" stroke="#12B76A" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </div>
          <div className="text-[19px] font-extrabold tracking-[-0.02em] text-ys-text">
            Organizá tus contactos
          </div>
          <div className="text-sm text-ys-muted font-medium text-center max-w-[380px]">
            Agrupá contactos para segmentar mejor tus campañas.
          </div>
          <button
            onClick={puedeCrear ? onCreateGroup : onSinPermiso}
            className={`mt-1.5 text-[13.5px] font-bold rounded-[10px] px-[18px] py-[11px] transition-all ${
              puedeCrear
                ? "text-white bg-ys-green cursor-pointer hover:bg-ys-green-hover hover:-translate-y-px"
                : "bg-ys-el2 text-ys-faint cursor-not-allowed"
            }`}
          >
            Crear mi primera audiencia
          </button>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2.5 bg-white border border-ys-border rounded-[10px] px-3.5 py-2.5 w-full md:w-[300px]">
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
              <circle cx="7" cy="7" r="4.5" stroke="#9aa19c" strokeWidth="1.5" />
              <path d="m10.5 10.5 3 3" stroke="#9aa19c" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar audiencia..."
              className="flex-1 min-w-0 border-none outline-none bg-transparent text-[13.5px] font-semibold text-ys-text"
            />
          </div>

          {filtered.length === 0 ? (
            <div className="bg-white border border-ys-border rounded-2xl py-11 px-6 flex flex-col items-center gap-2.5">
              <div className="w-11 h-11 rounded-2xl bg-ys-el2 flex items-center justify-center">
                <svg width="20" height="20" viewBox="0 0 16 16" fill="none">
                  <circle cx="7" cy="7" r="4.5" stroke="#9aa19c" strokeWidth="1.5" />
                  <path d="m10.5 10.5 3 3" stroke="#9aa19c" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </div>
              <div className="text-[14.5px] font-bold text-ys-text">
                No encontramos audiencias con ese nombre.
              </div>
              <button
                onClick={() => setQuery("")}
                className="text-[12.5px] font-bold text-ys-green-text cursor-pointer"
              >
                Limpiar búsqueda
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <button
                onClick={puedeCrear ? onCreateGroup : onSinPermiso}
                className={`text-center border-[1.5px] border-dashed rounded-2xl px-5 py-[18px] min-h-[158px] flex flex-col items-center justify-center gap-2.5 transition-all ${
                  puedeCrear
                    ? "border-[#cfe0d7] bg-[#fbfdfc] cursor-pointer hover:border-ys-green hover:bg-ys-green-bg hover:-translate-y-0.5"
                    : "border-ys-border bg-[#fbfcfb] cursor-not-allowed"
                }`}
              >
                <div
                  className={`w-10 h-10 rounded-[13px] flex items-center justify-center ${
                    puedeCrear ? "bg-ys-green-bg" : "bg-ys-el2"
                  }`}
                >
                  {puedeCrear ? (
                    <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
                      <path d="M8 3v10M3 8h10" stroke="#12B76A" strokeWidth="2.2" strokeLinecap="round" />
                    </svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
                      <path d="M4.2 7.2V5.4a3.8 3.8 0 0 1 7.6 0v1.8" stroke="#9aa19c" strokeWidth="1.6" strokeLinecap="round" />
                      <rect x="3" y="7.2" width="10" height="6.3" rx="1.8" stroke="#9aa19c" strokeWidth="1.6" />
                    </svg>
                  )}
                </div>
                <div
                  className={`text-sm font-extrabold ${
                    puedeCrear ? "text-ys-green-text" : "text-ys-dim"
                  }`}
                >
                  Crear audiencia
                </div>
                <div className="text-[12.5px] text-ys-muted font-medium text-center">
                  {puedeCrear
                    ? "Elegí contactos y armá un segmento"
                    : "No tenés permiso para crear audiencias"}
                </div>
              </button>
              {filtered.map((l) => {
                const preview = l.contactosIds
                  .slice(0, 3)
                  .map((id) => contactById.get(id))
                  .filter((c): c is Contact => Boolean(c));
                const extra = l.contactosIds.length - preview.length;
                return (
                  <button
                    key={l.id}
                    onClick={() => onOpenGroup(l)}
                    className="text-left bg-white border border-ys-border rounded-2xl px-5 py-[18px] flex flex-col gap-3.5 cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-[var(--shadow-card)] hover:border-ys-green-border"
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 flex-none rounded-[13px] bg-ys-green-bg flex items-center justify-center">
                        <svg width="19" height="19" viewBox="0 0 16 16" fill="none">
                          <circle cx="5.2" cy="6" r="2.2" stroke="#12B76A" strokeWidth="1.5" />
                          <circle cx="10.8" cy="6" r="2.2" stroke="#12B76A" strokeWidth="1.5" />
                          <path d="M1.8 13c0-1.9 1.5-3 3.4-3s3.4 1.1 3.4 3M7.4 13c0-1.9 1.5-3 3.4-3s3.4 1.1 3.4 3" stroke="#12B76A" strokeWidth="1.5" strokeLinecap="round" />
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                        <div className="text-[15px] font-extrabold text-ys-text tracking-[-0.01em] truncate">
                          {l.nombre}
                        </div>
                        <div className="text-[12.5px] text-ys-muted font-semibold">
                          <span className="font-mono">{l.contactosIds.length}</span> contactos
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between border-t border-ys-border-softer pt-3">
                      <div className="flex items-center gap-2">
                        <div className="flex">
                          {preview.map((c, i) => (
                            <div
                              key={c.id}
                              className="w-[26px] h-[26px] rounded-full bg-ys-green-bg text-ys-green-text text-[10px] font-extrabold flex items-center justify-center border-2 border-white"
                              style={{ marginLeft: i === 0 ? 0 : -8 }}
                            >
                              {initialsOf(c.nombre)}
                            </div>
                          ))}
                        </div>
                        {extra > 0 && (
                          <span className="font-mono text-[11.5px] text-ys-dimmer">+{extra}</span>
                        )}
                      </div>
                      <div className="text-[12.5px] font-bold text-ys-faint">Ver audiencia →</div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
