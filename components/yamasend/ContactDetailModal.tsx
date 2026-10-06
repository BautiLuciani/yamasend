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
  /**
   * Excluye este contacto del Motor (ej: es otra sucursal, no un cliente).
   * Si no se pasa, la sección no se muestra.
   */
  onExcluirMotor?: (contact: Contact) => Promise<void>;
  /**
   * Le pone nombre al contacto (sobre todo a los "Sin nombre"). Devuelve
   * true si se guardó. Si no se pasa (sin permiso), el nombre es de solo lectura.
   */
  onRenombrar?: (contactId: string, nombre: string) => Promise<boolean>;
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
  onExcluirMotor,
  onRenombrar,
}: ContactDetailModalProps) {
  const [savingOverride, setSavingOverride] = useState(false);
  const [excluyendo, setExcluyendo] = useState(false);
  // Edición del nombre. Se guarda el id del contacto que se está editando
  // (no un booleano) para que, si se cierra y se abre otro contacto, no
  // aparezca en modo edición.
  const [editandoNombreId, setEditandoNombreId] = useState<string | null>(null);
  const [nombreBorrador, setNombreBorrador] = useState("");
  const [guardandoNombre, setGuardandoNombre] = useState(false);

  if (!contact) return null;

  const editandoNombre = editandoNombreId === contact.id;
  const nombreLimpio = nombreBorrador.replace(/\s+/g, " ").trim();
  const puedeGuardarNombre =
    nombreLimpio.length > 0 && nombreLimpio !== (contact.nombre ?? "").trim() && !guardandoNombre;

  function empezarEdicionNombre() {
    if (!contact) return;
    setNombreBorrador(contact.nombre ?? "");
    setEditandoNombreId(contact.id);
  }

  async function guardarNombre() {
    if (!contact || !onRenombrar || !puedeGuardarNombre) return;
    setGuardandoNombre(true);
    const ok = await onRenombrar(contact.id, nombreLimpio);
    setGuardandoNombre(false);
    if (ok) setEditandoNombreId(null);
  }

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
          <div className="min-w-0 flex-1">
            {editandoNombre ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  guardarNombre();
                }}
                className="flex flex-col gap-2"
              >
                <input
                  autoFocus
                  value={nombreBorrador}
                  onChange={(e) => setNombreBorrador(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      e.preventDefault();
                      setEditandoNombreId(null);
                    }
                  }}
                  maxLength={80}
                  placeholder="Nombre del contacto"
                  aria-label="Nombre del contacto"
                  disabled={guardandoNombre}
                  className="w-full border border-ys-border rounded-[10px] px-3 py-2 text-[15px] font-bold text-ys-text outline-none focus:border-ys-green disabled:opacity-60"
                />
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={!puedeGuardarNombre}
                    className="text-[12.5px] font-bold text-white bg-ys-green rounded-[10px] px-3.5 py-1.5 cursor-pointer hover:bg-ys-green-hover disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {guardandoNombre ? "Guardando..." : "Guardar"}
                  </button>
                  <button
                    type="button"
                    disabled={guardandoNombre}
                    onClick={() => setEditandoNombreId(null)}
                    className="text-[12.5px] font-bold text-ys-muted border border-ys-border rounded-[10px] px-3.5 py-1.5 cursor-pointer hover:bg-[#f7f9f8] disabled:opacity-50"
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            ) : (
              <div className="flex items-center gap-1.5 min-w-0">
                <h3
                  className={`text-lg font-extrabold tracking-[-0.015em] truncate ${
                    contact.nombre ? "text-ys-text" : "text-ys-muted"
                  }`}
                >
                  {contact.nombre || "Sin nombre"}
                </h3>
                {onRenombrar &&
                  (contact.nombre ? (
                    <button
                      onClick={empezarEdicionNombre}
                      aria-label="Editar nombre"
                      title="Editar nombre"
                      className="flex-none w-7 h-7 rounded-lg flex items-center justify-center text-ys-dimmer hover:bg-ys-el2 hover:text-ys-text transition-colors cursor-pointer"
                    >
                      <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                        <path
                          d="M10.8 2.7a1.6 1.6 0 0 1 2.3 2.3L5.6 12.5 2.5 13.5l1-3.1 7.3-7.7Z"
                          stroke="currentColor"
                          strokeWidth="1.4"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </button>
                  ) : (
                    <button
                      onClick={empezarEdicionNombre}
                      className="flex-none text-[12px] font-bold text-ys-green-text bg-ys-green-bg border border-ys-green-border rounded-full px-2.5 py-1 cursor-pointer transition-all hover:-translate-y-px"
                    >
                      + Agregar nombre
                    </button>
                  ))}
              </div>
            )}
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

        {/* Excluir del motor: para números que no son clientes */}
        {onExcluirMotor && (
          <div className="border-t border-ys-border-soft pt-4 flex items-center gap-3">
            <div className="flex-1 min-w-0 flex flex-col gap-0.5">
              <div className="text-[12.5px] font-extrabold text-ys-text">¿No es un cliente?</div>
              <p className="text-[11.5px] text-ys-dim font-medium leading-[1.5]">
                Excluilo del motor si es otra sucursal, un proveedor o alguien de tu equipo. Lo podés volver a incluir cuando quieras.
              </p>
            </div>
            <button
              disabled={excluyendo}
              onClick={async () => {
                setExcluyendo(true);
                await onExcluirMotor(contact);
                setExcluyendo(false);
              }}
              className="flex-none text-[12.5px] font-bold text-[#3f4844] border border-ys-border rounded-[10px] px-3 py-2 cursor-pointer transition-colors hover:bg-[#f7f9f8] disabled:opacity-50 disabled:cursor-wait"
            >
              {excluyendo ? "Excluyendo..." : "Excluir del motor"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
