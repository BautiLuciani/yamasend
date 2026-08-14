"use client";

import { useState } from "react";

interface TemplateCreateModalProps {
  open: boolean;
  content: string;
  onContentChange: (v: string) => void;
  name: string;
  onNameChange: (v: string) => void;
  onCancel: () => void;
  onSendToMeta: () => void;
  sending: boolean;
}

const CATEGORIAS = [
  { key: "marketing", label: "Marketing" },
  { key: "utility", label: "Utilidad" },
  { key: "authentication", label: "Autenticación" },
  { key: "service", label: "Servicio" },
] as const;

export default function TemplateCreateModal({
  open,
  content,
  onContentChange,
  name,
  onNameChange,
  onCancel,
  onSendToMeta,
  sending,
}: TemplateCreateModalProps) {
  const [categoria, setCategoria] = useState<(typeof CATEGORIAS)[number]["key"]>("marketing");

  if (!open) return null;

  const canSend = content.trim().length > 10 && name.trim().length >= 3;

  return (
    <div
      onClick={(e) => e.target === e.currentTarget && !sending && onCancel()}
      className="fixed inset-0 bg-black/[.34] flex items-center justify-center z-[100] px-4 py-6"
      style={{ animation: "ys-fade .16s ease both" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[920px] max-h-[calc(100vh-64px)] overflow-y-auto bg-white rounded-[18px] flex flex-col shadow-[var(--shadow-modal)]"
        style={{ animation: "ys-modal .19s cubic-bezier(.4,0,.2,1) both" }}
      >
        <div className="px-7 pt-[26px] pb-4 flex flex-col gap-1">
          <div className="text-[19px] font-extrabold tracking-[-0.02em] text-ys-text">
            Nuevo template
          </div>
          <div className="text-[13.5px] text-ys-muted font-medium">
            Creá un mensaje para utilizar en tus campañas de WhatsApp.
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-[1.35fr_1fr] border-t border-ys-border-soft">
          <div className="px-6 md:px-7 py-5 md:border-r border-ys-border-soft flex flex-col gap-5">
            <div className="flex flex-col gap-[7px]">
              <div className="text-[13px] font-extrabold text-ys-text">Nombre del template</div>
              <input
                value={name}
                onChange={(e) => onNameChange(e.target.value)}
                placeholder="Ej: promo_agosto"
                className="border border-ys-border rounded-[10px] px-3.5 py-[11px] font-mono text-[13.5px] text-ys-text outline-none transition-colors focus:border-ys-green"
              />
              <div className="text-xs text-ys-dim font-medium">
                Usá un nombre que te permita identificarlo fácilmente.
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <div className="text-[13px] font-extrabold text-ys-text">Categoría</div>
              <div className="flex gap-2 flex-wrap">
                {CATEGORIAS.map((c) => {
                  const active = categoria === c.key;
                  return (
                    <button
                      key={c.key}
                      onClick={() => setCategoria(c.key)}
                      className={`text-[12.5px] font-bold rounded-full px-3.5 py-2 cursor-pointer transition-colors ${
                        active
                          ? "border-[1.5px] border-ys-green bg-ys-green-bg text-ys-green-text"
                          : "border border-ys-border text-[#3f4844] hover:bg-[#f7fbf9] hover:border-ys-green-border"
                      }`}
                    >
                      {c.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2.5">
                <div className="text-[13px] font-extrabold text-ys-text">Mensaje</div>
              </div>
              <textarea
                value={content}
                onChange={(e) => onContentChange(e.target.value)}
                placeholder="Escribí el mensaje que recibirán tus contactos..."
                className="min-h-[132px] resize-y border border-ys-border rounded-xl px-[15px] py-[13px] text-[13.5px] leading-[1.55] font-medium text-ys-text outline-none transition-colors focus:border-ys-green"
              />
              <div className="text-xs text-ys-dim font-medium">
                Podés usar variables como {"{{1}}"} para personalizar el mensaje por contacto.
              </div>
            </div>
          </div>

          <div className="px-6 md:px-7 py-5 bg-[#fbfcfb] flex flex-col gap-3">
            <div className="text-[12px] font-extrabold tracking-[0.07em] uppercase text-ys-dimmer">
              Vista previa
            </div>
            <div className="border border-ys-border-softest rounded-[14px] bg-[#f4f8f5] px-4 py-[18px] flex flex-col gap-2.5 flex-1">
              <div className="self-start max-w-[92%] bg-white rounded-[14px_14px_14px_4px] px-3.5 py-[11px] pb-2 shadow-[0_1px_2px_rgba(16,24,20,0.08)] flex flex-col gap-1.5">
                <div className="text-[13px] leading-[1.5] font-medium text-ys-text whitespace-pre-wrap">
                  {content || "Escribí el mensaje del template para ver la vista previa."}
                </div>
                <div className="self-end font-mono text-[10.5px] text-ys-dimmer">14:32</div>
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-ys-border-soft px-6 md:px-7 py-4 flex items-center gap-2.5">
          <button
            onClick={onCancel}
            disabled={sending}
            className="text-[13.5px] font-bold text-[#3f4844] border border-ys-border rounded-[10px] px-[18px] py-2.5 cursor-pointer transition-colors hover:bg-[#f7f9f8] disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={onSendToMeta}
            disabled={!canSend || sending}
            className="ml-auto text-[13.5px] font-bold text-white bg-ys-green rounded-[10px] px-[18px] py-2.5 cursor-pointer transition-all hover:bg-ys-green-hover hover:-translate-y-px disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
          >
            {sending ? "Enviando..." : "Enviar a Meta para aprobación"}
          </button>
        </div>
      </div>
    </div>
  );
}
