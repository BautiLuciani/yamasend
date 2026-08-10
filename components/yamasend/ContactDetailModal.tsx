"use client";

import { useState } from "react";
import type { Contact, ScoreTemp } from "@/lib/types";

interface ContactDetailModalProps {
  contact: Contact | null;
  onClose: () => void;
  onSetTemperaturaManual: (
    contactId: string,
    temperatura: "caliente" | "tibio" | "frio" | null,
  ) => Promise<void>;
}

const TEMP_CONFIG: Record<
  "caliente" | "tibio" | "frio",
  { label: string; emoji: string; bg: string; text: string; border: string }
> = {
  caliente: {
    label: "Caliente",
    emoji: "🔥",
    bg: "bg-[rgba(255,61,61,.15)]",
    text: "text-[#ff7070]",
    border: "border-[#ff7070]",
  },
  tibio: {
    label: "Tibio",
    emoji: "🌡️",
    bg: "bg-[rgba(245,158,11,.15)]",
    text: "text-ys-warn",
    border: "border-ys-warn",
  },
  frio: {
    label: "Frío",
    emoji: "❄️",
    bg: "bg-[rgba(59,130,246,.15)]",
    text: "text-ys-blue",
    border: "border-ys-blue",
  },
};

function TemperaturaBadgeGrande({ score }: { score: ScoreTemp }) {
  if (!score || !(score in TEMP_CONFIG)) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold bg-[rgba(113,113,122,.12)] text-ys-muted">
        Sin analizar
      </span>
    );
  }
  const cfg = TEMP_CONFIG[score as "caliente" | "tibio" | "frio"];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold ${cfg.bg} ${cfg.text}`}
    >
      {cfg.emoji} {cfg.label}
    </span>
  );
}

function ScoreBar({ score }: { score: number }) {
  const color =
    score >= 70 ? "#ff7070" : score >= 40 ? "var(--ys-warn)" : "var(--ys-blue)";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-ys-el overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${Math.min(100, Math.max(0, score))}%`, backgroundColor: color }}
        />
      </div>
      <span className="text-[11px] font-semibold text-ys-muted w-8 text-right">
        {score}
      </span>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] font-semibold text-ys-dim uppercase tracking-[0.5px] mb-1">
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
}: ContactDetailModalProps) {
  const [savingOverride, setSavingOverride] = useState(false);

  if (!contact) return null;

  const overrideActivo = contact.scoreManual !== "";

  async function handleOverride(temp: "caliente" | "tibio" | "frio") {
    if (!contact) return;
    setSavingOverride(true);
    // Si ya está seleccionada esa misma temperatura como override, lo limpiamos
    // (vuelve a mostrar el valor calculado por la IA).
    const nuevoValor = contact.scoreManual === temp ? null : temp;
    await onSetTemperaturaManual(contact.id, nuevoValor);
    setSavingOverride(false);
  }

  return (
    <div
      onClick={(e) => e.target === e.currentTarget && onClose()}
      className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center z-[1000] px-4"
    >
      <div className="rounded-2xl border border-ys-border2 bg-ys-card p-6 max-w-[440px] w-full max-h-[85vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="min-w-0">
            <h3 className="font-display text-lg font-bold truncate">
              {contact.nombre || "Sin nombre"}
            </h3>
            <div className="text-[13px] text-ys-muted mt-0.5">{contact.tel || "—"}</div>
          </div>
          <button
            onClick={onClose}
            className="flex-shrink-0 text-ys-muted hover:text-ys-text transition-colors cursor-pointer text-xl leading-none"
          >
            ×
          </button>
        </div>

        {/* Temperatura + score */}
        <div className="flex items-center justify-between mb-4">
          <TemperaturaBadgeGrande score={contact.score} />
          {overrideActivo && (
            <span className="text-[10px] text-ys-muted italic">
              ajustado manualmente
            </span>
          )}
        </div>

        {contact.aiScore > 0 && (
          <div className="mb-5">
            <Field label="Score de interés">
              <ScoreBar score={contact.aiScore} />
            </Field>
          </div>
        )}

        {/* Resumen */}
        {contact.resumen && (
          <div className="mb-4">
            <Field label="Resumen">
              <p className="text-[13px] leading-relaxed">{contact.resumen}</p>
            </Field>
          </div>
        )}

        {/* Necesidad */}
        {contact.necesidad && (
          <div className="mb-4">
            <Field label="Necesidad detectada">
              <p className="text-[13px] leading-relaxed text-ys-muted">
                {contact.necesidad}
              </p>
            </Field>
          </div>
        )}

        {/* Grid de metadatos */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          {contact.productoServicio && (
            <Field label="Producto / servicio">
              <span className="text-[13px]">{contact.productoServicio}</span>
            </Field>
          )}
          <Field label="Etapa de interés">
            <span className="text-[13px] capitalize">{contact.etapa || "—"}</span>
          </Field>
          {contact.sentimiento && (
            <Field label="Sentimiento">
              <span className="text-[13px] capitalize">{contact.sentimiento}</span>
            </Field>
          )}
          {contact.urgencia && (
            <Field label="Urgencia">
              <span className="text-[13px] capitalize">{contact.urgencia}</span>
            </Field>
          )}
        </div>

        {/* Keywords */}
        {contact.keywords && contact.keywords.length > 0 && (
          <div className="mb-4">
            <Field label="Palabras clave">
              <div className="flex flex-wrap gap-1.5">
                {contact.keywords.map((kw) => (
                  <span
                    key={kw}
                    className="rounded-full px-2 py-0.5 text-[11px] bg-ys-el border border-ys-border text-ys-muted"
                  >
                    {kw}
                  </span>
                ))}
              </div>
            </Field>
          </div>
        )}

        {/* Actividad */}
        <div className="grid grid-cols-2 gap-3 mb-5">
          <Field label="Mensajes analizados">
            <span className="text-[13px]">{contact.mensajes}</span>
          </Field>
          <Field label="Último mensaje">
            <span className="text-[13px]">
              {contact.ultimo || "—"}
              {typeof contact.diasInactivo === "number" && (
                <span className="text-ys-muted">
                  {" "}
                  · hace {contact.diasInactivo}d
                </span>
              )}
            </span>
          </Field>
        </div>

        {/* Override manual */}
        <div className="border-t border-ys-border pt-4">
          <div className="text-[10px] font-semibold text-ys-dim uppercase tracking-[0.5px] mb-2">
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
                  className={`flex-1 rounded-lg border px-2 py-2 text-[12px] font-medium transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                    active
                      ? `${cfg.border} ${cfg.bg} ${cfg.text}`
                      : "border-ys-border text-ys-muted hover:border-ys-border2 hover:text-ys-text"
                  }`}
                >
                  {cfg.emoji} {cfg.label}
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-ys-muted mt-2 leading-relaxed">
            Tu ajuste queda guardado y se prioriza sobre el cálculo de la IA. Click de
            nuevo en la misma opción para volver a usar el valor automático.
          </p>
        </div>
      </div>
    </div>
  );
}
