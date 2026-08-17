"use client";

import type { Template } from "@/lib/types";

interface TemplateDetailModalProps {
  template: Template | null;
  onClose: () => void;
}

const CATEGORIA_LABEL: Record<string, string> = {
  marketing: "Marketing",
  utility: "Utilidad",
  authentication: "Autenticación",
  service: "Servicio",
};

const STATUS_LABEL: Record<string, string> = {
  verificado: "Aprobado",
  enviado: "En revisión",
  rechazado: "Rechazado",
  borrador: "Borrador",
  error: "Error al enviar",
};

export default function TemplateDetailModal({ template, onClose }: TemplateDetailModalProps) {
  if (!template) return null;

  return (
    <div
      onClick={(e) => e.target === e.currentTarget && onClose()}
      className="fixed inset-0 bg-black/[.34] flex items-center justify-center z-[100] px-4"
      style={{ animation: "ys-fade .16s ease both" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[580px] max-h-[85vh] overflow-y-auto bg-white rounded-[18px] px-7 py-[22px] flex flex-col gap-5 shadow-[var(--shadow-modal)]"
        style={{ animation: "ys-modal .19s cubic-bezier(.4,0,.2,1) both" }}
      >
        <div className="flex items-start gap-3.5">
          <div className="w-11 h-11 flex-none rounded-[14px] bg-ys-green-bg flex items-center justify-center">
            <svg width="21" height="21" viewBox="0 0 16 16" fill="none">
              <rect x="2.5" y="2.5" width="11" height="11" rx="2" stroke="#12B76A" strokeWidth="1.5" />
              <path d="M2.5 6h11M6 6v7.5" stroke="#12B76A" strokeWidth="1.5" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-mono text-lg text-ys-text truncate">{template.nombre}</h3>
            <div className="text-[13px] text-ys-muted font-semibold mt-0.5">
              {CATEGORIA_LABEL[template.tipo ?? "marketing"] ?? "Marketing"}
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-ys-dimmer hover:bg-ys-el2 hover:text-ys-text transition-colors cursor-pointer text-xl leading-none"
          >
            ×
          </button>
        </div>

        <div className="bg-[#fbfcfb] border border-ys-border-softest rounded-xl px-4 py-3.5 grid grid-cols-2 gap-3.5">
          <div className="flex flex-col gap-0.5">
            <div className="text-[11px] font-extrabold tracking-[0.05em] uppercase text-ys-dimmer">
              Estado
            </div>
            <div className="text-[13.5px] font-bold text-ys-text">
              {STATUS_LABEL[template.status] ?? template.status}
            </div>
          </div>
          <div className="flex flex-col gap-0.5">
            <div className="text-[11px] font-extrabold tracking-[0.05em] uppercase text-ys-dimmer">
              Costo estimado
            </div>
            <div className="font-mono text-[13px] text-[#3f4844]">USD {template.precio ?? "0.0618"}</div>
          </div>
        </div>

        {(template.status === "rechazado" || template.status === "error") &&
          template.rechazoMotivo && (
            <div className="bg-ys-red-bg border border-[#f1cdc8] rounded-xl px-4 py-3 flex flex-col gap-0.5">
              <div className="text-[11px] font-extrabold tracking-[0.05em] uppercase text-ys-red-text">
                Motivo
              </div>
              <div className="text-[13px] text-[#3f4844] font-medium">{template.rechazoMotivo}</div>
            </div>
          )}

        <div className="flex flex-col gap-2">
          <div className="text-sm font-extrabold text-ys-text">Mensaje</div>
          <div className="border border-ys-border-softest rounded-[14px] bg-[#f4f8f5] px-4 py-[18px]">
            <div className="max-w-[92%] bg-white rounded-[14px_14px_14px_4px] px-3.5 py-[11px] pb-2 shadow-[0_1px_2px_rgba(16,24,20,0.08)] flex flex-col gap-1.5">
              <div className="text-[13px] leading-[1.5] font-medium text-ys-text whitespace-pre-wrap">
                {template.contenido}
              </div>
              <div className="self-end font-mono text-[10.5px] text-ys-dimmer">14:32</div>
            </div>
          </div>
        </div>

        <div className="border-t border-ys-border-soft pt-4">
          <button
            onClick={onClose}
            className="text-[13.5px] font-bold text-[#3f4844] border border-ys-border rounded-[10px] px-[18px] py-2.5 cursor-pointer transition-colors hover:bg-[#f7f9f8]"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
