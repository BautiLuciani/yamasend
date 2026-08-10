"use client";

import { useState } from "react";
import type { SyncConfig, SyncResult } from "@/lib/types";

type Step = "config" | "running" | "done" | "error";

interface SyncConfigModalProps {
  open: boolean;
  onClose: () => void;
  onRun: (config: SyncConfig) => Promise<SyncResult>;
}

const PRESETS_DIAS = [
  { label: "7 días", value: 7 },
  { label: "30 días", value: 30 },
  { label: "90 días", value: 90 },
  { label: "Todo", value: 365 },
];

export default function SyncConfigModal({
  open,
  onClose,
  onRun,
}: SyncConfigModalProps) {
  const [step, setStep] = useState<Step>("config");
  const [diasAnalisis, setDiasAnalisis] = useState(30);
  const [limiteContactos, setLimiteContactos] = useState(50);
  const [consulta, setConsulta] = useState("");
  const [result, setResult] = useState<SyncResult | null>(null);

  if (!open) return null;

  function handleClose() {
    // Solo permitimos cerrar durante el análisis si ya terminó o falló.
    if (step === "running") return;
    setStep("config");
    setResult(null);
    onClose();
  }

  async function handleStart() {
    setStep("running");
    const res = await onRun({ diasAnalisis, limiteContactos, consulta });
    setResult(res);
    setStep(res.success ? "done" : "error");
  }

  return (
    <div
      onClick={(e) => e.target === e.currentTarget && handleClose()}
      className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center z-[1000] px-4"
    >
      <div className="rounded-2xl border border-ys-border2 bg-ys-card p-6 max-w-[420px] w-full">
        {step === "config" && (
          <>
            <h3 className="font-display text-base font-semibold mb-1.5">
              🔎 Analizar tus conversaciones
            </h3>
            <p className="text-[13px] text-ys-muted mb-4 leading-relaxed">
              Vamos a leer tus chats de WhatsApp y usar IA para detectar
              oportunidades comerciales entre tus contactos.
            </p>

            <label className="block text-[11px] font-semibold text-ys-dim uppercase tracking-[0.5px] mb-1.5">
              ¿Qué estás buscando?
            </label>
            <input
              value={consulta}
              onChange={(e) => setConsulta(e.target.value)}
              placeholder="Ej: clientes interesados en departamentos en Palermo"
              className="w-full rounded-lg border border-ys-border bg-ys-el px-3 py-2.5 text-sm outline-none mb-1 focus:border-ys-red transition-colors"
            />
            <p className="text-[11px] text-ys-muted mb-4">
              Opcional, pero ayuda a priorizar mejor quién es un lead caliente.
            </p>

            <label className="block text-[11px] font-semibold text-ys-dim uppercase tracking-[0.5px] mb-1.5">
              Rango de fechas
            </label>
            <div className="flex gap-1.5 mb-4">
              {PRESETS_DIAS.map((p) => (
                <button
                  key={p.value}
                  onClick={() => setDiasAnalisis(p.value)}
                  className={`flex-1 rounded-lg border px-2 py-2 text-[12px] font-medium transition-colors cursor-pointer ${
                    diasAnalisis === p.value
                      ? "border-ys-red bg-ys-red-bg text-white"
                      : "border-ys-border text-ys-muted hover:border-ys-border2 hover:text-ys-text"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            <label className="block text-[11px] font-semibold text-ys-dim uppercase tracking-[0.5px] mb-1.5">
              Cantidad de contactos a analizar
            </label>
            <input
              type="number"
              min={1}
              max={500}
              value={limiteContactos}
              onChange={(e) =>
                setLimiteContactos(
                  Math.max(1, Math.min(500, parseInt(e.target.value, 10) || 1)),
                )
              }
              className="w-full rounded-lg border border-ys-border bg-ys-el px-3 py-2.5 text-sm outline-none mb-1 focus:border-ys-red transition-colors"
            />
            <p className="text-[11px] text-ys-muted mb-5">
              Priorizamos los contactos con mensajes más recientes primero.
            </p>

            <div className="flex justify-end gap-2">
              <button
                onClick={handleClose}
                className="rounded-lg border border-ys-border text-ys-muted px-4 py-[7px] text-[13px] hover:border-ys-border2 hover:text-ys-text transition-colors cursor-pointer"
              >
                Ahora no
              </button>
              <button
                onClick={handleStart}
                className="rounded-lg bg-ys-red text-white px-4.5 py-[7px] text-[13px] font-semibold hover:shadow-[0_2px_10px_rgba(255,61,61,.3)] transition-shadow cursor-pointer"
              >
                Analizar contactos
              </button>
            </div>
          </>
        )}

        {step === "running" && (
          <div className="flex flex-col items-center gap-4 py-4">
            <div className="w-8 h-8 rounded-full border-2 border-ys-border border-t-ys-red animate-spin" />
            <div className="text-center">
              <div className="font-display text-sm font-semibold mb-1">
                Analizando tus conversaciones...
              </div>
              <div className="text-[12px] text-ys-muted leading-relaxed">
                Esto puede tardar un par de minutos según la cantidad de
                contactos. No cierres esta ventana.
              </div>
            </div>
          </div>
        )}

        {step === "done" && result && (
          <>
            <div className="text-center mb-4">
              <div className="text-[40px] mb-1">✅</div>
              <div className="font-display text-base font-semibold">
                ¡Análisis completado!
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 mb-5">
              <StatBox label="Contactos analizados" value={result.contactosAnalizados} />
              <StatBox
                label="Leads con interés"
                value={result.leadsIdentificados}
                highlight
              />
              <StatBox label="Procesados en total" value={result.contactosProcesados} />
              <StatBox label="Sin mensajes recientes" value={result.contactosOmitidos} />
            </div>
            {result.mensaje && (
              <p className="text-[12px] text-ys-muted text-center mb-4">
                {result.mensaje}
              </p>
            )}
            <button
              onClick={handleClose}
              className="w-full rounded-lg bg-ys-red text-white px-4 py-2.5 text-[13px] font-semibold hover:shadow-[0_2px_10px_rgba(255,61,61,.3)] transition-shadow cursor-pointer"
            >
              Ver mis contactos
            </button>
          </>
        )}

        {step === "error" && result && (
          <>
            <div className="text-center mb-4">
              <div className="text-[40px] mb-1">⚠️</div>
              <div className="font-display text-base font-semibold mb-1">
                No pudimos completar el análisis
              </div>
              <p className="text-[12px] text-ys-muted leading-relaxed">
                {result.error ?? "Ocurrió un error inesperado. Probá de nuevo."}
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={handleClose}
                className="rounded-lg border border-ys-border text-ys-muted px-4 py-[7px] text-[13px] hover:border-ys-border2 hover:text-ys-text transition-colors cursor-pointer"
              >
                Cerrar
              </button>
              <button
                onClick={() => setStep("config")}
                className="rounded-lg bg-ys-red text-white px-4.5 py-[7px] text-[13px] font-semibold hover:shadow-[0_2px_10px_rgba(255,61,61,.3)] transition-shadow cursor-pointer"
              >
                Reintentar
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function StatBox({
  label,
  value,
  highlight,
}: {
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border px-3 py-2.5 ${
        highlight
          ? "border-ys-red bg-ys-red-bg"
          : "border-ys-border bg-ys-el"
      }`}
    >
      <div
        className={`font-display text-lg font-bold ${
          highlight ? "text-white" : "text-ys-text"
        }`}
      >
        {value}
      </div>
      <div className="text-[10px] text-ys-muted uppercase tracking-[0.3px]">
        {label}
      </div>
    </div>
  );
}
