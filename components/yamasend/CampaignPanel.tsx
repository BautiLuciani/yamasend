"use client";

import { useState } from "react";
import type { StatusState, Template } from "@/lib/types";

interface CampaignPanelProps {
  templates: Template[];
  selectedTplId: string | null;
  onSelectTpl: (id: string | null) => void;
  isCreatingNew: boolean;
  onStartNewTpl: () => void;
  onCancelNewTpl: () => void;
  newTplContent: string;
  onNewTplContentChange: (v: string) => void;
  newTplName: string;
  onNewTplNameChange: (v: string) => void;
  onSendToMeta: () => void;
  selectedCount: number;
  costEstimate: string;
  status: StatusState;
  onEnviar: () => void;
  modo24h: boolean;
  freeTextValue: string;
  onFreeTextChange: (v: string) => void;
}

export default function CampaignPanel({
  templates,
  selectedTplId,
  onSelectTpl,
  isCreatingNew,
  onStartNewTpl,
  onCancelNewTpl,
  newTplContent,
  onNewTplContentChange,
  newTplName,
  onNewTplNameChange,
  onSendToMeta,
  selectedCount,
  costEstimate,
  status,
  onEnviar,
  modo24h,
  freeTextValue,
  onFreeTextChange,
}: CampaignPanelProps) {
  const [tipo, setTipo] = useState("marketing");
  const [idioma, setIdioma] = useState("es_AR");

  const selectedTpl = templates.find((t) => t.id === selectedTplId) || null;
  const canSendToMeta =
    newTplContent.trim().length > 10 && newTplName.trim().length >= 3;

  const btnEnviarActive = status === "ready";
  const btnEnviarLabel =
    status === "approving"
      ? "⏳ Esperando a Meta..."
      : status === "approving-check"
        ? "⏳ Chequear status template"
        : "Enviar campaña";

  return (
    <div className="flex flex-col overflow-hidden min-h-0">
      <div className="text-[9px] font-semibold text-ys-dim uppercase tracking-[0.8px] px-[18px] pt-2.5 pb-1.5 flex-shrink-0">
        Campaña
      </div>

      <div className="flex-1 overflow-y-auto px-[18px] pb-2.5 min-h-0 flex flex-col">
        {/* Template selector */}
        <div className="mb-3">
          <div
            className={`rounded-lg border border-ys-border bg-ys-card px-[13px] py-2.5 ${
              modo24h ? "opacity-35 pointer-events-none grayscale" : ""
            }`}
          >
            <div className="text-[9px] font-semibold text-ys-dim uppercase tracking-[0.6px] mb-[7px]">
              Template
            </div>

            {!isCreatingNew ? (
              <select
                value={selectedTplId ?? ""}
                onChange={(e) => {
                  if (e.target.value === "__nuevo__") onStartNewTpl();
                  else onSelectTpl(e.target.value || null);
                }}
                className={`w-full rounded-md border bg-ys-el px-2.5 py-2 text-[13px] outline-none cursor-pointer ${
                  selectedTpl
                    ? "border-ys-green text-ys-green"
                    : "border-ys-border text-ys-text"
                }`}
              >
                <option value="">— elegí un template aprobado —</option>
                <option value="__nuevo__">Crear nuevo template...</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nombre}
                  </option>
                ))}
              </select>
            ) : (
              <div className="flex items-center gap-1.5">
                <button
                  onClick={onCancelNewTpl}
                  title="Cancelar y volver al desplegable"
                  className="flex-shrink-0 rounded-md border border-ys-border bg-ys-el text-ys-muted px-2.5 py-1.5 leading-none hover:border-ys-dim hover:text-ys-text transition-colors"
                >
                  ←
                </button>
                <input
                  type="text"
                  value={newTplName}
                  onChange={(e) => onNewTplNameChange(e.target.value)}
                  placeholder="Nombre del template (ej: promo_abril_2026)"
                  autoComplete="off"
                  className="flex-1 rounded-md border border-ys-red bg-ys-el px-2.5 py-2 text-[13px] outline-none focus:shadow-[0_0_0_2px_rgba(255,61,61,.12)]"
                />
              </div>
            )}
          </div>
        </div>

        {/* Preview / edición */}
        <div className="mb-3 flex flex-col gap-1.5">
          {modo24h ? (
            <textarea
              value={freeTextValue}
              onChange={(e) => onFreeTextChange(e.target.value)}
              placeholder="Escribí el mensaje. Pedile a la AI que genere un texto especial para estos contactos."
              className="w-full min-h-[100px] rounded-lg border border-ys-border bg-ys-el px-[13px] py-[11px] text-[13px] leading-relaxed outline-none resize-none focus:border-[rgba(255,61,61,.4)]"
            />
          ) : isCreatingNew ? (
            <>
              <textarea
                value={newTplContent}
                onChange={(e) => onNewTplContentChange(e.target.value)}
                placeholder="Escribí el mensaje. Pedile a la AI que genere un texto especial para estos contactos."
                className="w-full min-h-[100px] rounded-lg border border-ys-border bg-ys-el px-[13px] py-[11px] text-[13px] leading-relaxed outline-none resize-none focus:border-[rgba(255,61,61,.4)]"
              />
              <div className="flex gap-1.5">
                <select
                  value={tipo}
                  onChange={(e) => setTipo(e.target.value)}
                  title="Tipo de template"
                  className="flex-1 rounded-md border border-ys-border bg-ys-el px-2.5 py-[7px] text-xs outline-none cursor-pointer"
                >
                  <option value="marketing">📣 Marketing</option>
                  <option value="utility">🔧 Utilidad</option>
                  <option value="authentication">🔐 Autenticación</option>
                  <option value="service">💬 Servicio</option>
                </select>
                <select
                  value={idioma}
                  onChange={(e) => setIdioma(e.target.value)}
                  title="Idioma"
                  className="flex-1 rounded-md border border-ys-border bg-ys-el px-2.5 py-[7px] text-xs outline-none cursor-pointer"
                >
                  <option value="es_AR">🇦🇷 Español (AR)</option>
                  <option value="es">🌎 Español</option>
                  <option value="es_MX">🇲🇽 Español (MX)</option>
                  <option value="pt_BR">🇧🇷 Portugués (BR)</option>
                  <option value="en_US">🇺🇸 English (US)</option>
                </select>
              </div>
              <button
                onClick={onSendToMeta}
                disabled={!canSendToMeta}
                className={`w-full rounded-md py-2 text-xs font-medium transition-colors ${
                  canSendToMeta
                    ? "bg-ys-red border border-ys-red text-white cursor-pointer hover:shadow-[0_4px_14px_rgba(255,61,61,.35)]"
                    : "bg-ys-el border border-ys-dimmer text-ys-dimmer cursor-not-allowed"
                }`}
              >
                Enviar a Meta para aprobación
              </button>
            </>
          ) : (
            <div className="rounded-lg border border-ys-border bg-ys-el px-[13px] py-[11px] text-xs leading-relaxed min-h-[100px]">
              {selectedTpl ? (
                <div className="text-ys-muted whitespace-pre-wrap">
                  {selectedTpl.contenido}
                </div>
              ) : (
                <span className="block text-center py-4 text-ys-dim leading-relaxed">
                  Seleccioná un template o creamos uno especial con AI para tu
                  lista de contactos
                </span>
              )}
            </div>
          )}
        </div>

        {/* Estimación */}
        <div className="mb-3">
          <span className="block text-[9px] font-semibold text-ys-dim uppercase tracking-[0.6px] mb-1.5">
            Estimación Meta
          </span>
          <div className="rounded-lg border border-ys-border bg-ys-el px-[13px] py-[11px]">
            {selectedTpl && (
              <div className="flex justify-between items-center text-xs text-ys-muted py-[3px] border-t border-white/[.04] first:border-t-0">
                <span>Tipo</span>
                <span className="font-display font-semibold text-ys-text text-[11px]">
                  {selectedTpl.tipo} · USD {selectedTpl.precio}
                </span>
              </div>
            )}
            <div className="flex justify-between items-center text-xs text-ys-muted py-[3px] border-t border-white/[.04] first:border-t-0">
              <span>Contactos</span>
              <span className="font-display font-semibold text-ys-text text-xs">
                {selectedCount}
              </span>
            </div>
            <div className="flex justify-between items-center text-xs text-ys-muted py-[3px] border-t border-white/[.04]">
              <span>Total estimado</span>
              <span className="font-display font-semibold text-ys-green text-xs">
                {costEstimate}
              </span>
            </div>
          </div>
        </div>

        {/* Enviar */}
        <div>
          <button
            onClick={onEnviar}
            disabled={!btnEnviarActive}
            className={`w-full rounded-lg py-3 font-display text-sm font-bold flex items-center justify-center gap-1.5 transition-all ${
              btnEnviarActive
                ? "bg-ys-red border border-ys-red text-white cursor-pointer hover:shadow-[0_6px_20px_rgba(255,61,61,.35)] hover:-translate-y-px"
                : "bg-ys-el border border-ys-dimmer text-ys-dimmer cursor-not-allowed"
            }`}
          >
            {btnEnviarLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
