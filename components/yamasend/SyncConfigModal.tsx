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

  if (step === "running") {
    return (
      <div
        className="fixed inset-0 bg-black/[.34] flex items-center justify-center z-[100] px-4"
        style={{ animation: "ys-fade .16s ease both" }}
      >
        <div
          className="w-full max-w-[440px] bg-white rounded-[18px] px-[30px] py-9 flex flex-col items-center gap-4 shadow-[var(--shadow-modal)]"
          style={{ animation: "ys-modal .19s cubic-bezier(.4,0,.2,1) both" }}
        >
          <div className="w-[46px] h-[46px] rounded-full border-[3px] border-ys-green-bg border-t-ys-green animate-spin" />
          <div className="text-[17px] font-extrabold tracking-[-0.015em] text-ys-text">
            Analizando tus conversaciones...
          </div>
          <div className="text-[13.5px] text-ys-muted font-medium leading-[1.55] text-center">
            Esto puede tardar un par de minutos según la cantidad de contactos. No cierres esta ventana.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      onClick={(e) => e.target === e.currentTarget && handleClose()}
      className="fixed inset-0 bg-black/[.34] flex items-center justify-center z-[100] px-4"
      style={{ animation: "ys-fade .16s ease both" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[520px] bg-white rounded-[18px] px-7 py-[22px] flex flex-col gap-5 shadow-[var(--shadow-modal)]"
        style={{ animation: "ys-modal .19s cubic-bezier(.4,0,.2,1) both" }}
      >
        {step === "config" && (
          <>
            <div className="flex gap-[13px]">
              <div className="w-10 h-10 flex-none rounded-[13px] bg-ys-dark flex items-center justify-center">
                <svg width="18" height="18" viewBox="0 0 16 16" fill="none" style={{ animation: "ys-spark 3.2s ease-in-out infinite" }}>
                  <path d="m8 2 1.6 3.6L13 7l-3.4 1.4L8 12 6.4 8.4 3 7l3.4-1.4L8 2Z" stroke="#3ddb8f" strokeWidth="1.4" strokeLinejoin="round" />
                </svg>
              </div>
              <div className="flex flex-col gap-[5px]">
                <div className="text-[19px] font-extrabold tracking-[-0.02em] text-ys-text">
                  Analizar tus conversaciones
                </div>
                <div className="text-[13.5px] text-ys-muted font-medium leading-[1.5]">
                  Vamos a leer tus chats de WhatsApp y usar IA para detectar oportunidades comerciales entre tus contactos.
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-[7px]">
              <div className="text-[13px] font-extrabold text-ys-text">¿Qué estás buscando?</div>
              <input
                value={consulta}
                onChange={(e) => setConsulta(e.target.value)}
                placeholder="Ej: clientes interesados en departamentos en Palermo"
                className="border border-ys-border rounded-[10px] px-3.5 py-[11px] text-[13.5px] text-ys-text outline-none transition-colors focus:border-ys-green"
              />
              <div className="text-xs text-ys-dim font-medium">
                Opcional, pero ayuda a priorizar mejor quién es un lead caliente.
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <div className="text-[13px] font-extrabold text-ys-text">Rango de fechas</div>
              <div className="flex gap-[3px] bg-ys-el2 rounded-[10px] p-[3px]">
                {PRESETS_DIAS.map((p) => (
                  <button
                    key={p.value}
                    onClick={() => setDiasAnalisis(p.value)}
                    className={`flex-1 text-center text-[13px] rounded-lg py-2 cursor-pointer transition-colors ${
                      diasAnalisis === p.value
                        ? "font-bold text-ys-text bg-white shadow-[0_1px_2px_rgba(16,24,20,0.07)]"
                        : "font-semibold text-[#7b837e]"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-[7px]">
              <div className="text-[13px] font-extrabold text-ys-text">
                Cantidad de contactos a analizar
              </div>
              <div className="flex items-center gap-2.5">
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
                  className="w-[120px] border border-ys-border rounded-[10px] px-3.5 py-[11px] font-mono text-sm text-ys-text outline-none transition-colors focus:border-ys-green"
                />
                <div className="text-xs text-ys-dim font-medium">
                  Priorizamos los contactos con mensajes más recientes primero.
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2.5 border-t border-ys-border-soft pt-[18px]">
              <button
                onClick={handleClose}
                className="text-[13.5px] font-bold text-[#3f4844] border border-ys-border rounded-[10px] px-[18px] py-2.5 cursor-pointer transition-colors hover:bg-[#f7f9f8]"
              >
                Ahora no
              </button>
              <button
                onClick={handleStart}
                className="text-[13.5px] font-bold text-white bg-ys-green rounded-[10px] px-[18px] py-2.5 cursor-pointer transition-all hover:bg-ys-green-hover hover:-translate-y-px"
              >
                Analizar contactos
              </button>
            </div>
          </>
        )}

        {step === "done" && result && (
          <>
            <div className="text-center flex flex-col items-center gap-2">
              <div className="w-14 h-14 rounded-full bg-ys-green-bg flex items-center justify-center">
                <svg width="26" height="26" viewBox="0 0 16 16" fill="none">
                  <path d="m3 8.4 3.4 3L13 4.6" stroke="#12B76A" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div className="text-[19px] font-extrabold tracking-[-0.02em] text-ys-text">
                ¡Análisis completado!
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <StatBox label="Contactos analizados" value={result.contactosAnalizados} />
              <StatBox label="Leads con interés" value={result.leadsIdentificados} highlight />
              <StatBox label="Procesados en total" value={result.contactosProcesados} />
              <StatBox label="Sin mensajes recientes" value={result.contactosOmitidos} />
            </div>
            {result.mensaje && (
              <p className="text-[12.5px] text-ys-muted font-medium text-center">
                {result.mensaje}
              </p>
            )}
            <button
              onClick={handleClose}
              className="text-[13.5px] font-bold text-white bg-ys-green rounded-[10px] py-2.5 cursor-pointer transition-all hover:bg-ys-green-hover"
            >
              Ver mis contactos
            </button>
          </>
        )}

        {step === "error" && result && (
          <>
            <div className="text-center flex flex-col items-center gap-2">
              <div className="w-14 h-14 rounded-full bg-ys-red-bg flex items-center justify-center">
                <svg width="24" height="24" viewBox="0 0 16 16" fill="none">
                  <path d="M8 4v4.5M8 11.2v.6" stroke="#a8443b" strokeWidth="2" strokeLinecap="round" />
                  <circle cx="8" cy="8" r="6" stroke="#a8443b" strokeWidth="1.5" />
                </svg>
              </div>
              <div className="text-[19px] font-extrabold tracking-[-0.02em] text-ys-text">
                No pudimos completar el análisis
              </div>
              <p className="text-[13px] text-ys-muted font-medium leading-[1.5]">
                {result.error ?? "Ocurrió un error inesperado. Probá de nuevo."}
              </p>
            </div>
            <div className="flex justify-end gap-2.5">
              <button
                onClick={handleClose}
                className="text-[13.5px] font-bold text-[#3f4844] border border-ys-border rounded-[10px] px-[18px] py-2.5 cursor-pointer transition-colors hover:bg-[#f7f9f8]"
              >
                Cerrar
              </button>
              <button
                onClick={() => setStep("config")}
                className="text-[13.5px] font-bold text-white bg-ys-green rounded-[10px] px-[18px] py-2.5 cursor-pointer transition-all hover:bg-ys-green-hover"
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
      className={`rounded-xl px-3.5 py-3 ${
        highlight ? "bg-ys-green" : "border border-ys-border bg-[#fbfcfb]"
      }`}
    >
      <div className={`font-mono text-lg font-medium ${highlight ? "text-white" : "text-ys-text"}`}>
        {value}
      </div>
      <div className={`text-[10.5px] uppercase tracking-[0.03em] font-semibold ${highlight ? "text-white/80" : "text-ys-dim"}`}>
        {label}
      </div>
    </div>
  );
}
