"use client";

import { useState } from "react";
import type { ContactList } from "@/lib/types";

interface CreateGroupModalProps {
  open: boolean;
  selectedCount: number;
  onClose: () => void;
  onCreate: (nombre: string) => Promise<void>;
}

export function CreateGroupModal({
  open,
  selectedCount,
  onClose,
  onCreate,
}: CreateGroupModalProps) {
  const [nombre, setNombre] = useState("");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  if (!open) return null;

  function handleClose() {
    if (saving) return;
    setNombre("");
    setErr("");
    onClose();
  }

  async function handleCreate() {
    const trimmed = nombre.trim();
    if (!trimmed) {
      setErr("Ponele un nombre al grupo.");
      return;
    }
    setSaving(true);
    setErr("");
    await onCreate(trimmed);
    setSaving(false);
    setNombre("");
  }

  return (
    <div
      onClick={(e) => e.target === e.currentTarget && handleClose()}
      className="fixed inset-0 bg-black/[.34] flex items-center justify-center z-[100] px-4"
      style={{ animation: "ys-fade .16s ease both" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[420px] bg-white rounded-[18px] px-7 py-[22px] flex flex-col gap-[18px] shadow-[var(--shadow-modal)]"
        style={{ animation: "ys-modal .19s cubic-bezier(.4,0,.2,1) both" }}
      >
        <div className="flex flex-col gap-1.5">
          <div className="text-[19px] font-extrabold tracking-[-0.02em] text-ys-text">
            Crear grupo
          </div>
          <div className="text-[13px] font-bold text-ys-green-text bg-ys-green-bg rounded-full px-3 py-1 self-start">
            {selectedCount} contacto{selectedCount === 1 ? "" : "s"} seleccionado{selectedCount === 1 ? "" : "s"}
          </div>
        </div>

        {err && (
          <div className="rounded-lg bg-ys-red-bg border border-ys-red-border text-ys-red-text px-3.5 py-2.5 text-[13px] font-medium">
            {err}
          </div>
        )}

        <div className="flex flex-col gap-[7px]">
          <div className="text-[13px] font-extrabold text-ys-text">Nombre del grupo</div>
          <input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            placeholder="Ej: Clientes interesados"
            autoFocus
            className="border border-ys-border rounded-[10px] px-3.5 py-[11px] text-[13.5px] text-ys-text outline-none transition-colors focus:border-ys-green"
          />
        </div>

        <div className="flex justify-end gap-2.5">
          <button
            onClick={handleClose}
            className="text-[13.5px] font-bold text-[#3f4844] border border-ys-border rounded-[10px] px-[18px] py-2.5 cursor-pointer transition-colors hover:bg-[#f7f9f8]"
          >
            Cancelar
          </button>
          <button
            onClick={handleCreate}
            disabled={saving}
            className="text-[13.5px] font-bold text-white bg-ys-green rounded-[10px] px-[18px] py-2.5 cursor-pointer transition-all hover:bg-ys-green-hover hover:-translate-y-px disabled:opacity-60 disabled:cursor-not-allowed disabled:transform-none"
          >
            {saving ? "Creando..." : "Crear grupo"}
          </button>
        </div>
      </div>
    </div>
  );
}

interface AddToGroupModalProps {
  open: boolean;
  lists: ContactList[];
  selectedCount: number;
  onClose: () => void;
  onAdd: (listaId: string) => Promise<void>;
}

export function AddToGroupModal({
  open,
  lists,
  selectedCount,
  onClose,
  onAdd,
}: AddToGroupModalProps) {
  const [query, setQuery] = useState("");
  const [chosenId, setChosenId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (!open) return null;

  function handleClose() {
    if (saving) return;
    setQuery("");
    setChosenId(null);
    onClose();
  }

  async function handleAdd() {
    if (!chosenId) return;
    setSaving(true);
    await onAdd(chosenId);
    setSaving(false);
    setChosenId(null);
    setQuery("");
  }

  const filtered = lists.filter((l) =>
    l.nombre.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <div
      onClick={(e) => e.target === e.currentTarget && handleClose()}
      className="fixed inset-0 bg-black/[.34] flex items-center justify-center z-[100] px-4"
      style={{ animation: "ys-fade .16s ease both" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[440px] bg-white rounded-[18px] px-7 py-[22px] flex flex-col gap-[18px] shadow-[var(--shadow-modal)]"
        style={{ animation: "ys-modal .19s cubic-bezier(.4,0,.2,1) both" }}
      >
        <div className="flex flex-col gap-1.5">
          <div className="text-[19px] font-extrabold tracking-[-0.02em] text-ys-text">
            Agregar a grupo
          </div>
          <div className="text-[13px] font-bold text-ys-green-text bg-ys-green-bg rounded-full px-3 py-1 self-start">
            {selectedCount} contacto{selectedCount === 1 ? "" : "s"} seleccionado{selectedCount === 1 ? "" : "s"}
          </div>
        </div>

        <div className="flex items-center gap-2.5 border border-ys-border rounded-[10px] px-3.5 py-2.5">
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
            <circle cx="7" cy="7" r="4.5" stroke="#9aa19c" strokeWidth="1.5" />
            <path d="m10.5 10.5 3 3" stroke="#9aa19c" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar grupo..."
            className="flex-1 min-w-0 border-none outline-none bg-transparent text-[13.5px] font-semibold text-ys-text"
          />
        </div>

        <div className="flex flex-col gap-1.5 max-h-[280px] overflow-y-auto">
          {filtered.length === 0 && (
            <div className="text-center text-[13px] text-ys-muted font-medium py-6">
              {lists.length === 0
                ? "Todavía no creaste ningún grupo."
                : "No encontramos grupos con ese nombre."}
            </div>
          )}
          {filtered.map((l) => {
            const active = chosenId === l.id;
            return (
              <button
                key={l.id}
                onClick={() => setChosenId(l.id)}
                className={`flex items-center gap-3 border rounded-xl px-3.5 py-3 cursor-pointer transition-colors text-left ${
                  active ? "border-ys-green-border bg-[#f7fbf9]" : "border-ys-border hover:border-ys-green-border hover:bg-[#f7fbf9]"
                }`}
              >
                <div className="w-[34px] h-[34px] flex-none rounded-[11px] bg-ys-green-bg flex items-center justify-center">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <circle cx="5.2" cy="6" r="2.2" stroke="#067647" strokeWidth="1.5" />
                    <circle cx="10.8" cy="6" r="2.2" stroke="#067647" strokeWidth="1.5" />
                    <path d="M1.8 13c0-1.9 1.5-3 3.4-3s3.4 1.1 3.4 3M7.4 13c0-1.9 1.5-3 3.4-3s3.4 1.1 3.4 3" stroke="#067647" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </div>
                <div className="flex-1 flex flex-col gap-0.5 min-w-0">
                  <div className="text-[13.5px] font-bold text-ys-text truncate">{l.nombre}</div>
                  <div className="text-xs text-ys-dim font-medium">
                    {l.contactosIds.length} contacto{l.contactosIds.length === 1 ? "" : "s"}
                  </div>
                </div>
                {active && (
                  <svg width="17" height="17" viewBox="0 0 16 16" fill="none">
                    <circle cx="8" cy="8" r="7" fill="#12B76A" />
                    <path d="m4.6 8.3 2.3 2.2L11.4 6" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>

        <div className="flex justify-end gap-2.5">
          <button
            onClick={handleClose}
            className="text-[13.5px] font-bold text-[#3f4844] border border-ys-border rounded-[10px] px-[18px] py-2.5 cursor-pointer transition-colors hover:bg-[#f7f9f8]"
          >
            Cancelar
          </button>
          <button
            onClick={handleAdd}
            disabled={!chosenId || saving}
            className="text-[13.5px] font-bold text-white bg-ys-green rounded-[10px] px-[18px] py-2.5 cursor-pointer transition-all hover:bg-ys-green-hover hover:-translate-y-px disabled:opacity-60 disabled:cursor-not-allowed disabled:transform-none"
          >
            {saving ? "Agregando..." : "Agregar contactos"}
          </button>
        </div>
      </div>
    </div>
  );
}
