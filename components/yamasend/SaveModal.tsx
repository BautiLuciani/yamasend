"use client";

import { useState } from "react";

interface SaveModalProps {
  open: boolean;
  context: "lista" | "campaña" | null;
  selectedCount: number;
  onClose: () => void;
  onSave: (name: string) => void;
}

export default function SaveModal({
  open,
  context,
  selectedCount,
  onClose,
  onSave,
}: SaveModalProps) {
  const [name, setName] = useState("");

  if (!open || !context) return null;

  function handleSave() {
    const trimmed = name.trim();
    if (!trimmed) return;
    onSave(trimmed);
    setName("");
  }

  return (
    <div
      onClick={(e) => e.target === e.currentTarget && onClose()}
      className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center z-[1000]"
    >
      <div className="rounded-2xl border border-ys-border2 bg-ys-card p-6 max-w-[360px] w-[90%]">
        <h3 className="font-display text-base font-semibold mb-1.5">
          Guardar {context}
        </h3>
        <p className="text-[13px] text-ys-muted mb-3.5">
          {context === "lista"
            ? `Nombre para guardar la selección actual (${selectedCount} contactos).`
            : "Nombre para guardar la campaña actual."}
        </p>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSave()}
          placeholder="Nombre..."
          autoFocus
          className="w-full rounded-lg border border-ys-border bg-ys-el px-3 py-2.5 text-sm outline-none mb-3.5 focus:border-ys-red transition-colors"
        />
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg border border-ys-border text-ys-muted px-4 py-[7px] text-[13px] hover:border-ys-border2 hover:text-ys-text transition-colors cursor-pointer"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            className="rounded-lg bg-ys-red text-white px-4.5 py-[7px] text-[13px] font-semibold hover:shadow-[0_2px_10px_rgba(255,61,61,.3)] transition-shadow cursor-pointer"
          >
            Guardar
          </button>
        </div>
      </div>
    </div>
  );
}
