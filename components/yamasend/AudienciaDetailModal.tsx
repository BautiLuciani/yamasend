"use client";

import { useEffect, useRef, useState } from "react";
import type { Campaign, Contact, ContactList } from "@/lib/types";
import { ScoreBadge } from "./ContactsTable";

interface AudienciaDetailModalProps {
  group: ContactList | null;
  contacts: Contact[];
  campaigns: Campaign[];
  onClose: () => void;
  onRename: (id: string, nombre: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onRemoveContacts: (id: string, contactIds: string[]) => Promise<void>;
  onAddContacts: (id: string, contactIds: string[]) => Promise<void>;
  onCreateCampaign: (group: ContactList) => void;
}

function initialsOf(nombre: string): string {
  const parts = nombre.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "—";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function formatFecha(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function formatModificado(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const hoy = new Date();
  const esHoy =
    d.getFullYear() === hoy.getFullYear() &&
    d.getMonth() === hoy.getMonth() &&
    d.getDate() === hoy.getDate();
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  if (esHoy) return `Hoy, ${hh}:${min}`;
  return formatFecha(iso);
}

export default function AudienciaDetailModal({
  group,
  contacts,
  campaigns,
  onClose,
  onRename,
  onDelete,
  onRemoveContacts,
  onAddContacts,
  onCreateCampaign,
}: AudienciaDetailModalProps) {
  const [editing, setEditing] = useState(false);
  const [nombreDraft, setNombreDraft] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saving, setSaving] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [addingContacts, setAddingContacts] = useState(false);
  const [addQuery, setAddQuery] = useState("");
  const [addSelected, setAddSelected] = useState<Set<string>>(new Set());
  const [addSaving, setAddSaving] = useState(false);

  useEffect(() => {
    if (!menuOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [menuOpen]);

  if (!group) return null;

  const groupContacts = contacts.filter((c) => group.contactosIds.includes(c.id));
  const groupCampaigns = campaigns.filter((c) => c.listaId === group.id);
  const availableContacts = contacts.filter((c) => !group.contactosIds.includes(c.id));
  const filteredAvailable = availableContacts.filter(
    (c) =>
      c.nombre.toLowerCase().includes(addQuery.toLowerCase()) ||
      c.tel.includes(addQuery),
  );

  function startEdit() {
    setNombreDraft(group!.nombre);
    setEditing(true);
    setMenuOpen(false);
  }

  async function handleSaveRename() {
    const trimmed = nombreDraft.trim();
    if (!trimmed || !group) return;
    setSaving(true);
    await onRename(group.id, trimmed);
    setSaving(false);
    setEditing(false);
  }

  async function handleRemoveContact(contactId: string) {
    if (!group) return;
    setRemovingId(contactId);
    await onRemoveContacts(group.id, [contactId]);
    setRemovingId(null);
  }

  async function handleConfirmDelete() {
    if (!group) return;
    setSaving(true);
    await onDelete(group.id);
    setSaving(false);
  }

  function openAddContacts() {
    setAddingContacts(true);
    setAddQuery("");
    setAddSelected(new Set());
    setMenuOpen(false);
  }

  function toggleAddContact(id: string) {
    setAddSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleConfirmAddContacts() {
    if (!group || addSelected.size === 0) return;
    setAddSaving(true);
    await onAddContacts(group.id, Array.from(addSelected));
    setAddSaving(false);
    setAddingContacts(false);
    setAddSelected(new Set());
    setAddQuery("");
  }

  return (
    <div
      onClick={(e) => e.target === e.currentTarget && onClose()}
      className="fixed inset-0 bg-black/[.34] flex items-center justify-center z-[100] px-4"
      style={{ animation: "ys-fade .16s ease both" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[560px] max-h-[85vh] overflow-y-auto bg-white rounded-[18px] px-7 py-[22px] flex flex-col gap-5 shadow-[var(--shadow-modal)]"
        style={{ animation: "ys-modal .19s cubic-bezier(.4,0,.2,1) both" }}
      >
        <div className="flex items-start gap-3.5">
          <div className="w-11 h-11 flex-none rounded-[14px] bg-ys-green-bg flex items-center justify-center">
            <svg width="20" height="20" viewBox="0 0 16 16" fill="none">
              <circle cx="5.2" cy="6" r="2.2" stroke="#12B76A" strokeWidth="1.5" />
              <circle cx="10.8" cy="6" r="2.2" stroke="#12B76A" strokeWidth="1.5" />
              <path d="M1.8 13c0-1.9 1.5-3 3.4-3s3.4 1.1 3.4 3M7.4 13c0-1.9 1.5-3 3.4-3s3.4 1.1 3.4 3" stroke="#12B76A" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            {editing ? (
              <div className="flex items-center gap-2">
                <input
                  value={nombreDraft}
                  onChange={(e) => setNombreDraft(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSaveRename()}
                  autoFocus
                  className="flex-1 border border-ys-green rounded-lg px-3 py-1.5 text-lg font-extrabold text-ys-text outline-none"
                />
                <button
                  onClick={handleSaveRename}
                  disabled={saving}
                  className="text-xs font-bold text-white bg-ys-green rounded-lg px-3 py-2 cursor-pointer disabled:opacity-60"
                >
                  Guardar
                </button>
                <button
                  onClick={() => setEditing(false)}
                  className="text-xs font-bold text-ys-muted cursor-pointer px-2"
                >
                  Cancelar
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2.5">
                <h3 className="text-lg font-extrabold tracking-[-0.015em] text-ys-text truncate">
                  {group.nombre}
                </h3>
                <button
                  onClick={startEdit}
                  title="Editar nombre"
                  className="flex-none text-ys-dimmer hover:text-ys-text transition-colors cursor-pointer"
                >
                  <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                    <path d="M11 2.5 13.5 5 5 13.5H2.5V11L11 2.5Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
                  </svg>
                </button>
              </div>
            )}
            <div className="text-[13px] text-ys-muted font-medium mt-0.5">
              {groupContacts.length} contacto{groupContacts.length === 1 ? "" : "s"}
            </div>
          </div>

          {!editing && (
            <div ref={menuRef} className="relative flex-shrink-0">
              <button
                onClick={() => setMenuOpen((v) => !v)}
                title="Más opciones"
                className="w-[34px] h-[34px] rounded-[10px] border border-ys-border flex items-center justify-center cursor-pointer transition-colors hover:bg-[#f7f9f8]"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <circle cx="8" cy="3.5" r="1.2" fill="#5d6560" />
                  <circle cx="8" cy="8" r="1.2" fill="#5d6560" />
                  <circle cx="8" cy="12.5" r="1.2" fill="#5d6560" />
                </svg>
              </button>
              {menuOpen && (
                <div className="absolute top-[calc(100%+6px)] right-0 w-[196px] bg-white border border-ys-border rounded-xl p-1.5 shadow-[var(--shadow-card)] flex flex-col gap-0.5 z-30">
                  <button
                    onClick={startEdit}
                    className="text-left px-[11px] py-2.5 rounded-lg text-[13px] font-semibold text-[#3f4844] cursor-pointer transition-colors hover:bg-[#f5f7f6]"
                  >
                    Renombrar
                  </button>
                  <button
                    onClick={openAddContacts}
                    className="text-left px-[11px] py-2.5 rounded-lg text-[13px] font-semibold text-[#3f4844] cursor-pointer transition-colors hover:bg-[#f5f7f6]"
                  >
                    Agregar contactos
                  </button>
                  <div className="h-px bg-ys-border-softer my-1 mx-1.5" />
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      setConfirmDelete(true);
                    }}
                    className="text-left px-[11px] py-2.5 rounded-lg text-[13px] font-semibold text-ys-orange cursor-pointer transition-colors hover:bg-ys-warn-bg"
                  >
                    Eliminar audiencia
                  </button>
                </div>
              )}
            </div>
          )}

          <button
            onClick={onClose}
            className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-ys-dimmer hover:bg-ys-el2 hover:text-ys-text transition-colors cursor-pointer text-xl leading-none"
          >
            ×
          </button>
        </div>

        <div className="grid grid-cols-3 gap-3.5 bg-[#fbfcfb] border border-ys-border-soft rounded-xl px-4 py-3.5">
          <div className="flex flex-col gap-0.5">
            <div className="text-[11px] font-extrabold tracking-[0.07em] uppercase text-ys-dimmer">Nombre</div>
            <div className="text-[13.5px] font-bold text-ys-text truncate">{group.nombre}</div>
          </div>
          <div className="flex flex-col gap-0.5">
            <div className="text-[11px] font-extrabold tracking-[0.07em] uppercase text-ys-dimmer">Creación</div>
            <div className="font-mono text-[13px] text-[#3f4844]">{formatFecha(group.createdAt)}</div>
          </div>
          <div className="flex flex-col gap-0.5">
            <div className="text-[11px] font-extrabold tracking-[0.07em] uppercase text-ys-dimmer">Modificado</div>
            <div className="font-mono text-[13px] text-[#3f4844]">{formatModificado(group.updatedAt)}</div>
          </div>
        </div>

        {addingContacts && (
          <div className="flex flex-col gap-[9px] border border-ys-border-soft rounded-xl p-3.5 bg-[#fbfcfb]">
            <div className="flex items-center gap-2.5">
              <div className="text-[13px] font-extrabold text-ys-text">Agregar contactos</div>
              <div className="ml-auto text-xs font-bold text-ys-green-text bg-ys-green-bg rounded-full px-2.5 py-1">
                {addSelected.size} seleccionado{addSelected.size === 1 ? "" : "s"}
              </div>
            </div>
            <div className="flex items-center gap-2.5 border border-ys-border rounded-[10px] px-3.5 py-2.5 bg-white">
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                <circle cx="7" cy="7" r="4.5" stroke="#9aa19c" strokeWidth="1.5" />
                <path d="m10.5 10.5 3 3" stroke="#9aa19c" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              <input
                value={addQuery}
                onChange={(e) => setAddQuery(e.target.value)}
                placeholder="Buscar contacto..."
                autoFocus
                className="flex-1 min-w-0 border-none outline-none bg-transparent text-[13.5px] font-semibold text-ys-text"
              />
            </div>
            <div className="max-h-[220px] overflow-y-auto flex flex-col gap-0.5">
              {filteredAvailable.length === 0 && (
                <div className="text-center text-[13px] text-ys-muted font-medium py-5">
                  {availableContacts.length === 0
                    ? "Todos tus contactos ya están en esta audiencia."
                    : "No encontramos contactos con ese nombre."}
                </div>
              )}
              {filteredAvailable.map((c) => {
                const active = addSelected.has(c.id);
                return (
                  <button
                    key={c.id}
                    onClick={() => toggleAddContact(c.id)}
                    className="flex items-center gap-3 px-2.5 py-2 rounded-lg cursor-pointer transition-colors text-left hover:bg-white"
                  >
                    <div className="w-[18px] h-[18px] flex-none rounded-[5px] border-[1.5px] border-ys-border bg-white flex items-center justify-center">
                      {active && (
                        <div className="w-[18px] h-[18px] -m-[1.5px] rounded-[5px] bg-ys-green flex items-center justify-center">
                          <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
                            <path d="m3 8.4 3.4 3L13 4.6" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </div>
                      )}
                    </div>
                    <div className="w-7 h-7 flex-none rounded-full bg-ys-el2 text-[#5d6560] text-[10.5px] font-extrabold flex items-center justify-center">
                      {initialsOf(c.nombre)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-bold text-ys-text truncate">{c.nombre || "Sin nombre"}</div>
                      <div className="font-mono text-[11px] text-ys-dim truncate">{c.tel || "—"}</div>
                    </div>
                    <ScoreBadge score={c.score} />
                  </button>
                );
              })}
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button
                onClick={() => {
                  setAddingContacts(false);
                  setAddSelected(new Set());
                  setAddQuery("");
                }}
                className="text-[12.5px] font-bold text-[#3f4844] border border-ys-border rounded-lg px-3.5 py-2 cursor-pointer bg-white"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmAddContacts}
                disabled={addSelected.size === 0 || addSaving}
                className="text-[12.5px] font-bold text-white bg-ys-green rounded-lg px-3.5 py-2 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {addSaving ? "Agregando..." : "Agregar a la audiencia"}
              </button>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-2">
          <div className="text-sm font-extrabold text-ys-text">Contactos</div>
          <div className="flex flex-col border border-ys-border-soft rounded-xl overflow-hidden">
            {groupContacts.length === 0 && (
              <div className="text-center text-[13px] text-ys-muted font-medium py-8">
                Esta audiencia no tiene contactos.
              </div>
            )}
            {groupContacts.map((c) => (
              <div
                key={c.id}
                className="flex items-center gap-3 px-4 py-2.5 border-b border-ys-border-softer last:border-b-0"
              >
                <div className="w-8 h-8 flex-none rounded-full bg-ys-green-bg text-ys-green-text text-[11px] font-extrabold flex items-center justify-center">
                  {initialsOf(c.nombre)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13.5px] font-bold text-ys-text truncate">
                    {c.nombre || "Sin nombre"}
                  </div>
                  <div className="font-mono text-[11.5px] text-ys-dim truncate">{c.tel || "—"}</div>
                </div>
                <button
                  onClick={() => handleRemoveContact(c.id)}
                  disabled={removingId === c.id}
                  title="Quitar de la audiencia"
                  className="flex-none text-ys-dimmer hover:text-ys-red-text transition-colors cursor-pointer disabled:opacity-40"
                >
                  <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                    <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <div className="text-sm font-extrabold text-ys-text">Campañas</div>
          {groupCampaigns.length === 0 ? (
            <div className="text-center text-[13px] text-ys-muted font-medium py-6 border-t border-ys-border-softer">
              No hay campañas con esta audiencia.
            </div>
          ) : (
            <div className="flex flex-col">
              {groupCampaigns.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center gap-3 py-2.5 border-t border-ys-border-softer"
                >
                  <div className="w-8 h-8 flex-none rounded-[10px] bg-ys-green-bg flex items-center justify-center">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <path d="M2.5 6.5v3l7 3.5v-10l-7 3.5Z" stroke="#067647" strokeWidth="1.5" strokeLinejoin="round" />
                      <path d="M12 6v4" stroke="#067647" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0 text-[13.5px] font-bold text-ys-text truncate">
                    {c.nombre}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {confirmDelete ? (
          <div className="rounded-xl bg-ys-red-bg border border-ys-red-border px-4 py-3.5 flex flex-col gap-3">
            <div className="text-[13px] text-ys-red-text font-semibold leading-[1.5]">
              ¿Eliminar la audiencia &ldquo;{group.nombre}&rdquo;? Esta acción no se puede deshacer.
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmDelete(false)}
                className="text-[12.5px] font-bold text-[#3f4844] border border-ys-border rounded-lg px-3.5 py-2 cursor-pointer bg-white"
              >
                Volver
              </button>
              <button
                onClick={handleConfirmDelete}
                disabled={saving}
                className="text-[12.5px] font-bold text-white bg-ys-orange rounded-lg px-3.5 py-2 cursor-pointer disabled:opacity-60"
              >
                {saving ? "Eliminando..." : "Sí, eliminar"}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex justify-end items-center border-t border-ys-border-soft pt-4">
            <button
              onClick={() => onCreateCampaign(group)}
              className="text-[13.5px] font-bold text-white bg-ys-green rounded-[10px] px-[18px] py-2.5 cursor-pointer transition-all hover:bg-ys-green-hover hover:-translate-y-px"
            >
              Crear campaña con esta audiencia
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
