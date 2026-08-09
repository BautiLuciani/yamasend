"use client";

import type { Campaign, ContactList } from "@/lib/types";

interface FooterProps {
  selectedCount: number;
  onClearSel: () => void;
  lists: ContactList[];
  onLoadList: (id: string) => void;
  onSaveList: () => void;
  onConfirmList: () => void;
  campaigns: Campaign[];
  onLoadCampaign: (id: string) => void;
  onSaveCampaign: () => void;
}

type ListActionsProps = Pick<
  FooterProps,
  "selectedCount" | "onClearSel" | "lists" | "onLoadList" | "onSaveList" | "onConfirmList"
>;

type CampaignActionsProps = Pick<
  FooterProps,
  "campaigns" | "onLoadCampaign" | "onSaveCampaign"
>;

// Mitad izquierda del footer original: selección + lista. Se usa tal cual en
// desktop (dentro de Footer) y se reutiliza suelta en el tab "Contactos" mobile.
export function ListActionsBar({
  selectedCount,
  onClearSel,
  lists,
  onLoadList,
  onSaveList,
  onConfirmList,
}: ListActionsProps) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <span className="text-xs text-ys-muted whitespace-nowrap">
        <strong className="text-ys-text">{selectedCount}</strong> sel.
      </span>
      <button
        onClick={onClearSel}
        className="rounded-md border border-ys-border text-ys-muted px-2.5 py-[3px] text-xs hover:border-ys-border2 hover:text-ys-text transition-colors cursor-pointer"
      >
        Limpiar
      </button>
      <div className="w-px h-3 bg-ys-border flex-shrink-0" />
      <span className="text-[11px] text-ys-dim whitespace-nowrap flex-shrink-0">
        Cargar lista
      </span>
      <select
        onChange={(e) => e.target.value && onLoadList(e.target.value)}
        defaultValue=""
        className="rounded-md border border-ys-border bg-ys-card px-[9px] py-1 text-[11px] text-ys-muted outline-none cursor-pointer"
      >
        <option value="">— elegí —</option>
        {lists.map((l) => (
          <option key={l.id} value={l.id}>
            {l.nombre} ({l.contactosIds.length})
          </option>
        ))}
      </select>
      <div className="ml-auto" />
      <button
        onClick={onSaveList}
        className="rounded-md bg-[#222226] text-[#a1a1aa] px-[11px] py-1 text-[11px] font-medium hover:bg-[#2a2a2e] hover:text-ys-text transition-colors cursor-pointer whitespace-nowrap"
      >
        Guardar lista
      </button>
      <div className="w-px h-3 bg-ys-border flex-shrink-0" />
      <button
        onClick={onConfirmList}
        disabled={selectedCount === 0}
        className={`rounded-md px-[18px] py-1 pl-2.5 text-[11px] font-bold whitespace-nowrap transition-all flex-shrink-0 ${
          selectedCount > 0
            ? "bg-ys-red border border-ys-red text-white cursor-pointer hover:shadow-[0_2px_10px_rgba(255,61,61,.3)]"
            : "bg-ys-el border border-ys-dimmer text-ys-dimmer cursor-not-allowed"
        }`}
      >
        OK
      </button>
    </div>
  );
}

// Mitad derecha del footer original: campaña. Misma reutilización que ListActionsBar.
export function CampaignActionsBar({
  campaigns,
  onLoadCampaign,
  onSaveCampaign,
}: CampaignActionsProps) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <span className="text-[11px] text-ys-dim whitespace-nowrap">
        Campaña
      </span>
      <div className="w-px h-3 bg-ys-border flex-shrink-0" />
      <span className="text-[11px] text-ys-dim whitespace-nowrap">
        Cargar
      </span>
      <select
        onChange={(e) => e.target.value && onLoadCampaign(e.target.value)}
        defaultValue=""
        className="rounded-md border border-ys-border bg-ys-card px-[9px] py-1 text-[11px] text-ys-muted outline-none cursor-pointer"
      >
        <option value="">— elegí —</option>
        {campaigns.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nombre}
          </option>
        ))}
      </select>
      <div className="ml-auto" />
      <button
        onClick={onSaveCampaign}
        className="rounded-md bg-[#222226] text-[#a1a1aa] px-[11px] py-1 text-[11px] font-medium hover:bg-[#2a2a2e] hover:text-ys-text transition-colors cursor-pointer whitespace-nowrap"
      >
        Guardar
      </button>
    </div>
  );
}

export default function Footer(props: FooterProps) {
  return (
    <div className="hidden md:flex h-[38px] bg-ys-el border-t border-ys-border items-center flex-shrink-0">
      <div className="flex-[2] flex items-center pl-[18px] min-w-0">
        <ListActionsBar {...props} />
      </div>
      <div className="flex-1 flex items-center px-[18px] border-l border-ys-border min-w-0">
        <CampaignActionsBar {...props} />
      </div>
    </div>
  );
}
