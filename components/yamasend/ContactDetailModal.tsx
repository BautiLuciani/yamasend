"use client";

import { useState } from "react";
import type { Contact, ScoreTemp } from "@/lib/types";
import { normalizarEtiqueta } from "@/lib/etiquetas/etiquetas";
import EtiquetaChip from "./EtiquetaChip";

interface ContactDetailModalProps {
  contact: Contact | null;
  onClose: () => void;
  onSetTemperaturaManual: (
    contactId: string,
    temperatura: "caliente" | "tibio" | "frio" | null,
  ) => Promise<void>;
  /** Etiquetas: si no se pasan, la sección se muestra solo de lectura. */
  onEtiquetar?: (contactId: string, etiqueta: string) => Promise<void>;
  onQuitarEtiqueta?: (contactId: string, etiqueta: string) => Promise<void>;
  /** Etiquetas que ya existen en la cuenta, para elegir en vez de escribir. */
  etiquetasExistentes?: string[];
}

const TEMP_CONFIG: Record<
  "caliente" | "tibio" | "frio",
  { label: string; dotColor: string; text: string; bg: string; border: string }
> = {
  caliente: {
    label: "Caliente",
    dotColor: "#12B76A",
    text: "text-ys-green-text",
    bg: "bg-ys-green-bg",
    border: "border-ys-green",
  },
  tibio: {
    label: "Tibio",
    dotColor: "#c07a12",
    text: "text-ys-warn-text",
    bg: "bg-ys-warn-bg",
    border: "border-ys-warn",
  },
  frio: {
    label: "Frío",
    dotColor: "#8a908c",
    text: "text-[#5d6560]",
    bg: "bg-ys-el2",
    border: "border-[#8a908c]",
  },
};

function TemperaturaBadgeGrande({ score }: { score: ScoreTemp }) {
  if (!score || !(score in TEMP_CONFIG)) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-bold text-ys-dimmer bg-ys-el2">
        Sin analizar
      </span>
    );
  }
  const cfg = TEMP_CONFIG[score as "caliente" | "tibio" | "frio"];
  return (
    <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-bold ${cfg.bg} ${cfg.text}`}>
      <span className="w-2 h-2 rounded-full" style={{ background: cfg.dotColor }} />
      {cfg.label}
    </span>
  );
}

function ScoreBar({ score }: { score: number }) {
  const color = score >= 70 ? "#12B76A" : score >= 40 ? "#c07a12" : "#3b82f6";
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex-1 h-1.5 rounded-full bg-ys-border-softest overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${Math.min(100, Math.max(0, score))}%`, backgroundColor: color }}
        />
      </div>
      <span className="font-mono text-[12px] font-medium text-ys-muted w-8 text-right">
        {score}
      </span>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="text-[11px] font-extrabold tracking-[0.05em] uppercase text-ys-dimmer">
        {label}
      </div>
      {children}
    </div>
  );
}

export default function ContactDetailModal({
  contact,
  onClose,
  onSetTemperaturaManual,
  onEtiquetar,
  onQuitarEtiqueta,
  etiquetasExistentes = [],
}: ContactDetailModalProps) {
  const [savingOverride, setSavingOverride] = useState(false);
  const [nuevaEtiqueta, setNuevaEtiqueta] = useState("");
  const [guardandoEtiqueta, setGuardandoEtiqueta] = useState(false);

  if (!contact) return null;

  const overrideActivo = contact.scoreManual !== "";

  async function handleOverride(temp: "caliente" | "tibio" | "frio") {
    if (!contact) return;
    setSavingOverride(true);
    const nuevoValor = contact.scoreManual === temp ? null : temp;
    await onSetTemperaturaManual(contact.id, nuevoValor);
    setSavingOverride(false);
  }

  return (
    <div
      onClick={(e) => e.target === e.currentTarget && onClose()}
      className="fixed inset-0 bg-black/[.34] flex items-center justify-center z-[100] px-4"
      style={{ animation: "ys-fade .16s ease both" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[460px] max-h-[85vh] overflow-y-auto bg-white rounded-[18px] px-7 py-[22px] flex flex-col gap-5 shadow-[var(--shadow-modal)]"
        style={{ animation: "ys-modal .19s cubic-bezier(.4,0,.2,1) both" }}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-lg font-extrabold tracking-[-0.015em] text-ys-text truncate">
              {contact.nombre || "Sin nombre"}
            </h3>
            <div className="font-mono text-[13px] text-ys-muted mt-0.5">
              {contact.tel || "—"}
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-ys-dimmer hover:bg-ys-el2 hover:text-ys-text transition-colors cursor-pointer text-xl leading-none"
          >
            ×
          </button>
        </div>

        {/* Temperatura + score */}
        <div className="flex items-center justify-between">
          <TemperaturaBadgeGrande score={contact.score} />
          {overrideActivo && (
            <span className="text-[11px] text-ys-dim italic font-medium">
              ajustado manualmente
            </span>
          )}
        </div>

        {contact.aiScore > 0 && (
          <Field label="Score de interés">
            <ScoreBar score={contact.aiScore} />
          </Field>
        )}

        {contact.resumen && (
          <Field label="Resumen">
            <p className="text-[13px] leading-[1.55] text-[#2c3531] font-medium">
              {contact.resumen}
            </p>
          </Field>
        )}

        {contact.necesidad && (
          <Field label="Necesidad detectada">
            <p className="text-[13px] leading-[1.55] text-ys-muted font-medium">
              {contact.necesidad}
            </p>
          </Field>
        )}

        <div className="grid grid-cols-2 gap-3.5">
          {contact.productoServicio && (
            <Field label="Producto / servicio">
              <span className="text-[13px] font-semibold text-ys-text">
                {contact.productoServicio}
              </span>
            </Field>
          )}
          <Field label="Etapa de interés">
            <span className="text-[13px] font-semibold text-ys-text capitalize">
              {contact.etapa || "—"}
            </span>
          </Field>
          {contact.sentimiento && (
            <Field label="Sentimiento">
              <span className="text-[13px] font-semibold text-ys-text capitalize">
                {contact.sentimiento}
              </span>
            </Field>
          )}
          {contact.urgencia && (
            <Field label="Urgencia">
              <span className="text-[13px] font-semibold text-ys-text capitalize">
                {contact.urgencia}
              </span>
            </Field>
          )}
        </div>

        {contact.keywords && contact.keywords.length > 0 && (
          <Field label="Palabras clave">
            <div className="flex flex-wrap gap-1.5">
              {contact.keywords.map((kw) => (
                <span
                  key={kw}
                  className="rounded-full px-2.5 py-1 text-[11px] font-semibold bg-ys-el2 text-[#5d6560]"
                >
                  {kw}
                </span>
              ))}
            </div>
          </Field>
        )}

        {((contact.etiquetas?.length ?? 0) > 0 || onEtiquetar) && (
          <Field label="Etiquetas">
            <div className="flex flex-wrap items-center gap-1.5">
              {(contact.etiquetas ?? []).map((e) => (
                <EtiquetaChip
                  key={e}
                  nombre={e}
                  onQuitar={
                    onQuitarEtiqueta
                      ? async () => {
                          setGuardandoEtiqueta(true);
                          await onQuitarEtiqueta(contact.id, e);
                          setGuardandoEtiqueta(false);
                        }
                      : undefined
                  }
                />
              ))}
              {(contact.etiquetas?.length ?? 0) === 0 && (
                <span className="text-[12px] font-medium text-ys-dim">Sin etiquetas</span>
              )}
            </div>
            {onEtiquetar && (
              <form
                className="flex gap-2 mt-1"
                onSubmit={async (ev) => {
                  ev.preventDefault();
                  const n = normalizarEtiqueta(nuevaEtiqueta);
                  if (!n || guardandoEtiqueta) return;
                  setGuardandoEtiqueta(true);
                  await onEtiquetar(contact.id, n);
                  setGuardandoEtiqueta(false);
                  setNuevaEtiqueta("");
                }}
              >
                <input
                  value={nuevaEtiqueta}
                  onChange={(ev) => setNuevaEtiqueta(ev.target.value)}
                  list="etiquetas-existentes"
                  maxLength={30}
                  placeholder="Agregar etiqueta"
                  className="flex-1 min-w-0 border border-ys-border rounded-[10px] px-3 py-2 text-[13px] font-medium text-ys-text outline-none focus:border-ys-green"
                />
                <datalist id="etiquetas-existentes">
                  {etiquetasExistentes
                    .filter((e) => !(contact.etiquetas ?? []).includes(e))
                    .map((e) => (
                      <option key={e} value={e} />
                    ))}
                </datalist>
                <button
                  type="submit"
                  disabled={guardandoEtiqueta || !normalizarEtiqueta(nuevaEtiqueta)}
                  className="text-[12.5px] font-bold text-white bg-ys-green rounded-[10px] px-3.5 py-2 cursor-pointer hover:bg-ys-green-hover disabled:opacity-60 disabled:cursor-default"
                >
                  Agregar
                </button>
              </form>
            )}
          </Field>
        )}

        <div className="grid grid-cols-2 gap-3.5">
          <Field label="Mensajes analizados">
            <span className="text-[13px] font-semibold text-ys-text">{contact.mensajes}</span>
          </Field>
          <Field label="Último mensaje">
            <span className="text-[13px] font-semibold text-ys-text">
              {contact.ultimo || "—"}
              {typeof contact.diasInactivo === "number" && (
                <span className="text-ys-muted font-medium"> · hace {contact.diasInactivo}d</span>
              )}
            </span>
          </Field>
        </div>

        {/* Override manual */}
        <div className="border-t border-ys-border-soft pt-4 flex flex-col gap-2.5">
          <div className="text-[11px] font-extrabold tracking-[0.05em] uppercase text-ys-dimmer">
            ¿No estás de acuerdo con la clasificación?
          </div>
          <div className="flex gap-2">
            {(["caliente", "tibio", "frio"] as const).map((temp) => {
              const cfg = TEMP_CONFIG[temp];
              const active = contact.scoreManual === temp;
              return (
                <button
                  key={temp}
                  disabled={savingOverride}
                  onClick={() => handleOverride(temp)}
                  className={`flex-1 rounded-[10px] border px-2 py-2 text-[12px] font-bold cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5 ${
                    active
                      ? `${cfg.border} ${cfg.bg} ${cfg.text}`
                      : "border-ys-border text-ys-muted hover:border-ys-green-border hover:bg-[#f7fbf9]"
                  }`}
                >
                  <span className="w-2 h-2 rounded-full" style={{ background: cfg.dotColor }} />
                  {cfg.label}
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-ys-dim font-medium leading-[1.5]">
            Tu ajuste queda guardado y se prioriza sobre el cálculo de la IA. Click de nuevo en la misma opción para volver a usar el valor automático.
          </p>
        </div>
      </div>
    </div>
  );
}
