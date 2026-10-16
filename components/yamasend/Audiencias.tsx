"use client";

import { useEffect, useMemo, useState } from "react";
import type { Contact, ContactList } from "@/lib/types";
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
} from "./SectionChrome";

interface AudienciasProps {
  lists: ContactList[];
  contacts: Contact[];
  onOpenGroup: (group: ContactList) => void;
  onCreateGroup: () => void;
  /** Arranca una campaña con esta audiencia ya elegida. */
  onCreateCampaign: (group: ContactList) => void;
  /** Borra audiencias. Resuelve cuando terminó (el padre refresca la lista). */
  onDelete: (ids: string[]) => Promise<void>;
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

const GRID = "md:grid-cols-[44px_minmax(0,2fr)_130px_minmax(0,1.4fr)]";

export default function Audiencias({
  lists,
  contacts,
  onOpenGroup,
  onCreateGroup,
  onCreateCampaign,
  onDelete,
  puedeCrear = true,
  onSinPermiso,
}: AudienciasProps) {
  const [query, setQuery] = useState("");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [confirmando, setConfirmando] = useState(false);
  const [borrando, setBorrando] = useState(false);

  const totalContactosOrganizados = useMemo(
    () => new Set(lists.flatMap((l) => l.contactosIds)).size,
    [lists],
  );

  const filtered = lists.filter((l) => l.nombre.toLowerCase().includes(query.toLowerCase()));

  const contactById = useMemo(() => {
    const map = new Map<string, Contact>();
    contacts.forEach((c) => map.set(c.id, c));
    return map;
  }, [contacts]);

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

  const seleccionadas = filtered.filter((l) => sel.has(l.id));
  const todasMarcadas = filtered.length > 0 && seleccionadas.length === filtered.length;
  const unica = seleccionadas.length === 1 ? seleccionadas[0] : null;

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
    await onDelete(seleccionadas.map((l) => l.id));
    setBorrando(false);
    setConfirmando(false);
    setSel(new Set());
  }

  return (
    <SectionPage>
      <SectionHeader
        title="Audiencias"
        subtitle="Organizá tus contactos para crear campañas más efectivas."
        status={{
          icon: (
            <svg width="20" height="20" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <circle cx="5.2" cy="6" r="2.2" stroke="currentColor" strokeWidth="1.5" />
              <circle cx="10.8" cy="6" r="2.2" stroke="currentColor" strokeWidth="1.5" />
              <path d="M1.8 13c0-1.9 1.5-3 3.4-3s3.4 1.1 3.4 3M7.4 13c0-1.9 1.5-3 3.4-3s3.4 1.1 3.4 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          ),
          label: "Audiencias",
          value:
            lists.length === 0
              ? "Sin audiencias"
              : `${lists.length} · ${totalContactosOrganizados} contactos organizados`,
          tone: lists.length > 0 ? "ok" : "neutral",
        }}
      />

      <ActionBar>
        <BtnPrimary onClick={puedeCrear ? onCreateGroup : onSinPermiso} bloqueado={!puedeCrear}>
          Nueva audiencia
        </BtnPrimary>
        {lists.length > 0 && <SearchBox value={query} onChange={setQuery} placeholder="Buscar audiencia..." />}
      </ActionBar>

      <SectionBody>
        {lists.length === 0 ? (
          <div className="bg-ys-card border border-ys-border rounded-2xl py-16 px-6 flex flex-col items-center gap-3.5">
            <div className="text-[19px] font-extrabold tracking-[-0.02em] text-ys-text">Organizá tus contactos</div>
            <div className="text-sm text-ys-muted font-medium text-center max-w-[380px]">
              Agrupá contactos para segmentar mejor tus campañas.
            </div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-ys-card border border-ys-border rounded-2xl py-[52px] px-6 flex flex-col items-center gap-2.5">
            <div className="text-base font-extrabold text-ys-text">No encontramos audiencias con ese nombre.</div>
            <button type="button" onClick={() => setQuery("")} className="text-[12.5px] font-bold text-ys-green-text cursor-pointer">
              Limpiar búsqueda
            </button>
          </div>
        ) : (
          <div className="bg-ys-card border border-ys-border rounded-2xl overflow-hidden">
            <div
              className={`hidden md:grid ${GRID} items-center px-5 py-3 border-b border-ys-border text-[11px] font-extrabold tracking-[0.06em] uppercase text-ys-muted`}
            >
              <CheckBox
                checked={todasMarcadas}
                indeterminate={!todasMarcadas && seleccionadas.length > 0}
                onChange={() => setSel(todasMarcadas ? new Set() : new Set(filtered.map((l) => l.id)))}
                label="Seleccionar todas las audiencias"
              />
              <span>Nombre</span>
              <span>Contactos</span>
              <span>Quiénes son</span>
            </div>
            {filtered.map((l, i) => {
              const marcada = sel.has(l.id);
              const preview = l.contactosIds
                .slice(0, 4)
                .map((id) => contactById.get(id))
                .filter((c): c is Contact => Boolean(c));
              const extra = l.contactosIds.length - preview.length;
              return (
                <div
                  key={l.id}
                  onClick={() => onOpenGroup(l)}
                  className={`grid grid-cols-[28px_minmax(0,1fr)_auto] ${GRID} items-center gap-x-3 gap-y-1 px-4 md:px-5 py-3.5 cursor-pointer transition-colors ${
                    i > 0 ? "border-t border-ys-border-softer" : ""
                  } ${marcada ? "bg-ys-green-bg" : "hover:bg-[#fbfcfb]"}`}
                >
                  <CheckBox checked={marcada} onChange={() => toggle(l.id)} label={`Seleccionar ${l.nombre}`} />
                  <span className="text-sm font-extrabold text-ys-text truncate">{l.nombre}</span>
                  <span className="font-mono text-[13px] text-ys-muted">{l.contactosIds.length}</span>
                  <span className="hidden md:flex items-center gap-2">
                    <span className="flex">
                      {preview.map((c, k) => (
                        <span
                          key={c.id}
                          className="w-[30px] h-[30px] rounded-full bg-ys-green-bg text-ys-green-text text-[10px] font-extrabold flex items-center justify-center border-2 border-ys-card"
                          style={{ marginLeft: k === 0 ? 0 : -6 }}
                        >
                          {initialsOf(c.nombre)}
                        </span>
                      ))}
                    </span>
                    {extra > 0 && <span className="font-mono text-[11.5px] text-ys-muted">+{extra}</span>}
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
              ? `¿Eliminar ${pluralizar(seleccionadas.length, "audiencia", "audiencias")}?`
              : pluralizar(seleccionadas.length, "audiencia", "audiencias")
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
              {unica && <BarBtn onClick={() => onOpenGroup(unica)}>Abrir</BarBtn>}
              {unica && puedeCrear && (
                <BarBtn variante="primary" onClick={() => onCreateCampaign(unica)}>
                  Crear campaña
                </BarBtn>
              )}
              {puedeCrear && (
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
