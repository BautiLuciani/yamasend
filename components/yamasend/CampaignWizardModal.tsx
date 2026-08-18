"use client";

import { useEffect, useRef, useState } from "react";
import type { ContactList, Template } from "@/lib/types";

type Paso = 1 | 2 | 3 | 4;

interface CampaignWizardModalProps {
  open: boolean;
  lists: ContactList[];
  templates: Template[];
  costPerMsg: number;
  onClose: () => void;
  onFetchInsight: () => Promise<{ insight: string | null; error: string | null }>;
  onConfirm: (data: {
    nombre: string;
    listaId: string;
    templateId: string;
    contactosIds: string[];
    momento: "ahora" | "programar";
    fechaProgramada: string | null;
  }) => Promise<{ error: string | null }>;
}

function defaultFechaProgramada(): string {
  // Por defecto: mañana a las 10:00, formato para <input type="datetime-local">
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(10, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function CampaignWizardModal({
  open,
  lists,
  templates,
  costPerMsg,
  onClose,
  onFetchInsight,
  onConfirm,
}: CampaignWizardModalProps) {
  const [paso, setPaso] = useState<Paso>(1);
  const [listaId, setListaId] = useState<string | null>(null);
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [nombre, setNombre] = useState("");
  const [momento, setMomento] = useState<"ahora" | "programar">("ahora");
  const [fechaProgramada, setFechaProgramada] = useState(defaultFechaProgramada());
  const [buscarGrupo, setBuscarGrupo] = useState("");
  const [buscarTpl, setBuscarTpl] = useState("");
  const [confirmando, setConfirmando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null);
  const [exito, setExito] = useState(false);
  const [insight, setInsight] = useState<string | null>(null);
  const [insightCargando, setInsightCargando] = useState(false);
  const insightPedidoRef = useRef(false);

  async function cargarInsight() {
    if (insightPedidoRef.current) return;
    insightPedidoRef.current = true;
    setInsightCargando(true);
    const result = await onFetchInsight();
    setInsight(result.insight);
    setInsightCargando(false);
  }

  useEffect(() => {
    if (open && paso === 3) {
      cargarInsight();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, paso]);

  function resetState() {
    setPaso(1);
    setListaId(null);
    setTemplateId(null);
    setNombre("");
    setMomento("ahora");
    setFechaProgramada(defaultFechaProgramada());
    setBuscarGrupo("");
    setBuscarTpl("");
    setConfirmando(false);
    setEnviando(false);
    setErrorEnvio(null);
    setExito(false);
    setInsight(null);
    insightPedidoRef.current = false;
  }

  if (!open) return null;

  const lista = lists.find((l) => l.id === listaId) ?? null;
  const template = templates.find((t) => t.id === templateId) ?? null;
  const destinatarios = lista?.contactosIds.length ?? 0;
  const costo = destinatarios * costPerMsg;

  const gruposFiltrados = lists.filter((l) =>
    l.nombre.toLowerCase().includes(buscarGrupo.toLowerCase()),
  );
  const templatesFiltrados = templates.filter((t) =>
    t.nombre.toLowerCase().includes(buscarTpl.toLowerCase()),
  );

  function handleClose() {
    if (enviando) return;
    resetState();
    onClose();
  }

  async function handleEnviarConfirmado() {
    if (!lista || !template) return;
    setEnviando(true);
    setErrorEnvio(null);
    const result = await onConfirm({
      nombre: nombre.trim(),
      listaId: lista.id,
      templateId: template.id,
      contactosIds: lista.contactosIds,
      momento,
      fechaProgramada:
        momento === "programar" && fechaProgramada
          ? new Date(fechaProgramada).toISOString()
          : null,
    });
    setEnviando(false);
    if (result.error) {
      setErrorEnvio(result.error);
      setConfirmando(false);
    } else {
      setExito(true);
    }
  }

  if (exito) {
    return (
      <div
        className="fixed inset-0 bg-black/[.34] flex items-center justify-center z-[100] px-4"
        style={{ animation: "ys-fade .16s ease both" }}
      >
        <div
          className="w-full max-w-[440px] bg-white rounded-[18px] px-8 py-11 flex flex-col items-center gap-3.5 shadow-[var(--shadow-modal)]"
          style={{ animation: "ys-fade-up .2s cubic-bezier(.4,0,.2,1) both" }}
        >
          <div className="w-14 h-14 rounded-full bg-ys-green-bg flex items-center justify-center">
            <svg width="26" height="26" viewBox="0 0 16 16" fill="none">
              <path d="m3 8.4 3.4 3L13 4.6" stroke="#12B76A" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div className="text-xl font-extrabold tracking-[-0.02em] text-ys-text">
            ¡Campaña enviada!
          </div>
          <div className="text-sm text-ys-muted font-medium text-center max-w-[360px]">
            &ldquo;{nombre}&rdquo; se está enviando a {destinatarios} contacto{destinatarios === 1 ? "" : "s"} de {lista?.nombre}.
          </div>
          <button
            onClick={() => {
              resetState();
              onClose();
            }}
            className="mt-1 text-[13.5px] font-bold text-[#3f4844] border border-ys-border rounded-[10px] px-[18px] py-2.5 cursor-pointer transition-colors hover:bg-[#f7f9f8]"
          >
            Volver a Campañas
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      onClick={(e) => e.target === e.currentTarget && handleClose()}
      className="fixed inset-0 bg-black/[.34] flex items-center justify-center z-[100] px-4 py-6"
      style={{ animation: "ys-fade .16s ease both" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[720px] max-h-[calc(100vh-64px)] bg-white rounded-[18px] flex flex-col overflow-hidden shadow-[var(--shadow-modal)]"
        style={{ animation: "ys-modal .19s cubic-bezier(.4,0,.2,1) both" }}
      >
        {/* Stepper */}
        <div className="px-6 md:px-7 pt-[22px] pb-4 flex items-center gap-2.5 border-b border-ys-border-soft overflow-x-auto">
          <StepIndicator n={1} label="Grupo" active={paso === 1} done={paso > 1} />
          <StepLine done={paso > 1} />
          <StepIndicator n={2} label="Template" active={paso === 2} done={paso > 2} />
          <StepLine done={paso > 2} />
          <StepIndicator n={3} label="Configuración" active={paso === 3} done={paso > 3} />
          <StepLine done={paso > 3} />
          <StepIndicator n={4} label="Revisar" active={paso === 4} done={false} />
        </div>

        {/* Paso 1: Grupo */}
        {paso === 1 && (
          <>
            <div className="flex-1 min-h-0 overflow-y-auto px-6 md:px-7 py-5 flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <div className="text-lg font-extrabold tracking-[-0.02em] text-ys-text">
                  ¿A quién querés enviarle la campaña?
                </div>
                <div className="text-[13.5px] text-ys-muted font-medium">
                  Seleccioná el grupo de contactos que recibirá el mensaje.
                </div>
              </div>

              <div className="flex items-center gap-2.5 border border-ys-border rounded-[10px] px-3.5 py-2.5">
                <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                  <circle cx="7" cy="7" r="4.5" stroke="#9aa19c" strokeWidth="1.5" />
                  <path d="m10.5 10.5 3 3" stroke="#9aa19c" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
                <input
                  value={buscarGrupo}
                  onChange={(e) => setBuscarGrupo(e.target.value)}
                  placeholder="Buscar grupo..."
                  className="flex-1 min-w-0 border-none outline-none bg-transparent text-[13.5px] font-semibold text-ys-text"
                />
              </div>

              {gruposFiltrados.length === 0 ? (
                <div className="text-center text-[13px] text-ys-muted font-medium py-8">
                  {lists.length === 0
                    ? "Todavía no creaste ningún grupo. Andá a Contactos, seleccioná contactos y creá uno."
                    : "No encontramos grupos con ese nombre."}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {gruposFiltrados.map((g) => {
                    const active = listaId === g.id;
                    return (
                      <button
                        key={g.id}
                        onClick={() => setListaId(g.id)}
                        className={`border-[1.5px] rounded-[14px] px-4 py-3.5 flex items-center gap-3 cursor-pointer transition-all hover:-translate-y-px text-left ${
                          active ? "border-ys-green bg-ys-green-bg" : "border-ys-border"
                        }`}
                      >
                        <div className="w-[34px] h-[34px] flex-none rounded-[11px] bg-ys-green-bg flex items-center justify-center">
                          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                            <circle cx="5.2" cy="6" r="2.2" stroke="#067647" strokeWidth="1.5" />
                            <circle cx="10.8" cy="6" r="2.2" stroke="#067647" strokeWidth="1.5" />
                            <path d="M1.8 13c0-1.9 1.5-3 3.4-3s3.4 1.1 3.4 3M7.4 13c0-1.9 1.5-3 3.4-3s3.4 1.1 3.4 3" stroke="#067647" strokeWidth="1.5" strokeLinecap="round" />
                          </svg>
                        </div>
                        <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                          <div className="text-[13.5px] font-bold text-ys-text truncate">{g.nombre}</div>
                          <div className="text-xs text-ys-dim font-semibold">
                            {g.contactosIds.length} contactos
                          </div>
                        </div>
                        {active && (
                          <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
                            <circle cx="8" cy="8" r="7" fill="#12B76A" />
                            <path d="m4.6 8.3 2.3 2.2L11.4 6" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}

              {lista && (
                <div className="bg-ys-green-bg rounded-xl px-4 py-3 text-[13px] font-bold text-ys-green-text">
                  {destinatarios} destinatarios
                </div>
              )}
            </div>
            <WizardFooter
              onBack={handleClose}
              backLabel="Cancelar"
              onNext={() => setPaso(2)}
              nextDisabled={!listaId}
            />
          </>
        )}

        {/* Paso 2: Template */}
        {paso === 2 && (
          <>
            <div className="flex-1 min-h-0 overflow-y-auto px-6 md:px-7 py-5 flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <div className="text-lg font-extrabold tracking-[-0.02em] text-ys-text">
                  ¿Qué mensaje querés enviar?
                </div>
                <div className="text-[13.5px] text-ys-muted font-medium">
                  Seleccioná uno de tus templates aprobados por Meta.
                </div>
              </div>

              <div className="flex items-center gap-2.5 border border-ys-border rounded-[10px] px-3.5 py-2.5">
                <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                  <circle cx="7" cy="7" r="4.5" stroke="#9aa19c" strokeWidth="1.5" />
                  <path d="m10.5 10.5 3 3" stroke="#9aa19c" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
                <input
                  value={buscarTpl}
                  onChange={(e) => setBuscarTpl(e.target.value)}
                  placeholder="Buscar template..."
                  className="flex-1 min-w-0 border-none outline-none bg-transparent text-[13.5px] font-semibold text-ys-text"
                />
              </div>

              {templatesFiltrados.length === 0 ? (
                <div className="text-center text-[13px] text-ys-muted font-medium py-8">
                  {templates.length === 0
                    ? "Todavía no tenés templates aprobados. Creá uno desde la sección Templates."
                    : "No encontramos templates con ese nombre."}
                </div>
              ) : (
                <div className="flex flex-col gap-2.5">
                  {templatesFiltrados.map((t) => {
                    const active = templateId === t.id;
                    return (
                      <button
                        key={t.id}
                        onClick={() => setTemplateId(t.id)}
                        className={`border-[1.5px] rounded-[14px] px-4 py-3.5 flex items-start gap-3 cursor-pointer transition-all hover:-translate-y-px text-left ${
                          active ? "border-ys-green bg-ys-green-bg" : "border-ys-border"
                        }`}
                      >
                        <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                          <div className="flex items-center gap-2.5 flex-wrap">
                            <div className="font-mono text-[13.5px] text-ys-text">{t.nombre}</div>
                            <span className="inline-flex items-center gap-1.5 text-[11.5px] font-bold text-ys-green-text bg-ys-green-bg rounded-full px-2.5 py-1">
                              <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
                                <path d="m3 8.4 3.4 3L13 4.6" stroke="#067647" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                              Aprobado
                            </span>
                          </div>
                          <div className="text-[12.5px] text-ys-muted font-medium leading-[1.5] line-clamp-2">
                            {t.contenido}
                          </div>
                        </div>
                        {active && (
                          <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
                            <circle cx="8" cy="8" r="7" fill="#12B76A" />
                            <path d="m4.6 8.3 2.3 2.2L11.4 6" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}

              {template && (
                <div className="flex flex-col gap-2">
                  <div className="text-[11px] font-extrabold tracking-[0.07em] uppercase text-ys-dimmer">
                    Vista previa
                  </div>
                  <div className="border border-ys-border-softest rounded-[14px] bg-[#f4f8f5] px-4 py-[18px]">
                    <div className="max-w-[80%] bg-white rounded-[14px_14px_14px_4px] px-3.5 py-[11px] pb-2 shadow-[0_1px_2px_rgba(16,24,20,0.08)] flex flex-col gap-1.5">
                      <div className="text-[13px] leading-[1.5] font-medium text-ys-text whitespace-pre-wrap">
                        {template.contenido}
                      </div>
                      <div className="self-end font-mono text-[10.5px] text-ys-dimmer">14:32</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
            <WizardFooter
              onBack={() => setPaso(1)}
              backLabel="Atrás"
              onNext={() => setPaso(3)}
              nextDisabled={!templateId}
            />
          </>
        )}

        {/* Paso 3: Configuración */}
        {paso === 3 && (
          <>
            <div className="flex-1 min-h-0 overflow-y-auto px-6 md:px-7 py-5 flex flex-col gap-5">
              <div className="flex flex-col gap-1">
                <div className="text-lg font-extrabold tracking-[-0.02em] text-ys-text">
                  ¿Cuándo querés enviarla?
                </div>
                <div className="text-[13.5px] text-ys-muted font-medium">
                  Ponele un nombre a la campaña y elegí el momento del envío.
                </div>
              </div>

              <div className="flex flex-col gap-[7px]">
                <div className="text-[13px] font-extrabold text-ys-text">Nombre de campaña</div>
                <input
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  placeholder="Ej: Promo agosto - Clientes Premium"
                  className="border border-ys-border rounded-[10px] px-3.5 py-[11px] text-[13.5px] font-semibold text-ys-text outline-none transition-colors focus:border-ys-green"
                />
              </div>

              <div className="flex flex-col gap-2.5">
                <div className="text-[13px] font-extrabold text-ys-text">Momento del envío</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <button
                    onClick={() => setMomento("ahora")}
                    className={`border-[1.5px] rounded-[14px] px-4 py-3.5 flex items-center gap-3 cursor-pointer transition-colors text-left ${
                      momento === "ahora" ? "border-ys-green bg-ys-green-bg" : "border-ys-border"
                    }`}
                  >
                    <div className="w-[34px] h-[34px] flex-none rounded-[11px] bg-ys-green-bg flex items-center justify-center">
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                        <path d="M14 2 7 9M14 2l-4.5 12L7 9 2 6.5 14 2Z" stroke="#067647" strokeWidth="1.5" strokeLinejoin="round" />
                      </svg>
                    </div>
                    <div className="flex-1 flex flex-col gap-0.5">
                      <div className="text-[13.5px] font-bold text-ys-text">Enviar ahora</div>
                      <div className="text-[11.5px] text-ys-dim font-semibold">Empieza al confirmar</div>
                    </div>
                    {momento === "ahora" && (
                      <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
                        <circle cx="8" cy="8" r="7" fill="#12B76A" />
                        <path d="m4.6 8.3 2.3 2.2L11.4 6" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </button>
                  <button
                    onClick={() => setMomento("programar")}
                    className={`border-[1.5px] rounded-[14px] px-4 py-3.5 flex items-center gap-3 cursor-pointer transition-colors text-left ${
                      momento === "programar" ? "border-ys-green bg-ys-green-bg" : "border-ys-border"
                    }`}
                  >
                    <div className="w-[34px] h-[34px] flex-none rounded-[11px] bg-ys-green-bg flex items-center justify-center">
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                        <rect x="2.5" y="3.5" width="11" height="10" rx="2" stroke="#067647" strokeWidth="1.5" />
                        <path d="M2.5 6.5h11M5.5 2v3M10.5 2v3" stroke="#067647" strokeWidth="1.5" strokeLinecap="round" />
                      </svg>
                    </div>
                    <div className="flex-1 flex flex-col gap-0.5">
                      <div className="text-[13.5px] font-bold text-ys-text">Programar envío</div>
                      <div className="text-[11.5px] text-ys-dim font-semibold">Elegí fecha y hora</div>
                    </div>
                    {momento === "programar" && (
                      <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
                        <circle cx="8" cy="8" r="7" fill="#12B76A" />
                        <path d="m4.6 8.3 2.3 2.2L11.4 6" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </button>
                </div>

                {momento === "programar" && (
                  <div className="flex flex-col gap-[7px]">
                    <div className="text-[13px] font-extrabold text-ys-text">Fecha y hora de envío</div>
                    <input
                      type="datetime-local"
                      value={fechaProgramada}
                      min={defaultFechaProgramada().slice(0, 10) + "T00:00"}
                      onChange={(e) => setFechaProgramada(e.target.value)}
                      className="border border-ys-border rounded-[10px] px-3.5 py-[11px] text-[13.5px] font-semibold text-ys-text outline-none transition-colors focus:border-ys-green"
                    />
                  </div>
                )}

                <div className="text-[12.5px] text-ys-muted font-medium">
                  {momento === "programar"
                    ? "La campaña se enviará automáticamente en la fecha y hora elegidas."
                    : "La campaña comenzará a enviarse después de confirmar."}
                </div>
              </div>

              <div className="bg-ys-dark rounded-2xl px-5 py-[18px] flex flex-col gap-2.5">
                <div className="flex items-center gap-2">
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ animation: "ys-spark 3.2s ease-in-out infinite" }}>
                    <path d="m8 2 1.6 3.6L13 7l-3.4 1.4L8 12 6.4 8.4 3 7l3.4-1.4L8 2Z" stroke="#12B76A" strokeWidth="1.5" strokeLinejoin="round" />
                  </svg>
                  <div className="text-[11px] font-extrabold tracking-[0.12em] uppercase text-ys-green">
                    Insight de IA
                  </div>
                </div>
                <div className="text-sm leading-[1.55] text-ys-border-softest font-semibold">
                  {insightCargando
                    ? "Analizando tus campañas anteriores..."
                    : insight ??
                      "Todavía no tenemos suficientes datos históricos para un insight personalizado."}
                </div>
              </div>
            </div>
            <WizardFooter
              onBack={() => setPaso(2)}
              backLabel="Atrás"
              onNext={() => setPaso(4)}
              nextDisabled={!nombre.trim() || (momento === "programar" && !fechaProgramada)}
            />
          </>
        )}

        {/* Paso 4: Revisar */}
        {paso === 4 && lista && template && (
          <>
            <div className="flex-1 min-h-0 overflow-y-auto px-6 md:px-7 py-5 flex flex-col gap-[18px]">
              <div className="flex flex-col gap-1">
                <div className="text-lg font-extrabold tracking-[-0.02em] text-ys-text">
                  Revisá tu campaña
                </div>
                <div className="text-[13.5px] text-ys-muted font-medium">
                  Confirmá que todo esté correcto antes de enviarla.
                </div>
              </div>

              {errorEnvio && (
                <div className="rounded-lg bg-ys-red-bg border border-ys-red-border text-ys-red-text px-3.5 py-2.5 text-[13px] font-medium">
                  {errorEnvio}
                </div>
              )}

              <div className="bg-[#fbfcfb] border border-ys-border-softest rounded-2xl px-4 py-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex flex-col gap-0.5">
                  <div className="text-[11px] font-extrabold tracking-[0.07em] uppercase text-ys-dimmer">Campaña</div>
                  <div className="text-[13.5px] font-bold text-ys-text">{nombre}</div>
                </div>
                <div className="flex flex-col gap-0.5">
                  <div className="text-[11px] font-extrabold tracking-[0.07em] uppercase text-ys-dimmer">Envío</div>
                  <div className="text-[13.5px] font-bold text-ys-text">Ahora</div>
                </div>
                <div className="flex flex-col gap-0.5">
                  <div className="text-[11px] font-extrabold tracking-[0.07em] uppercase text-ys-dimmer">Destinatarios</div>
                  <div className="text-[13.5px] font-bold text-ys-text">{lista.nombre}</div>
                  <div className="font-mono text-[12.5px] text-ys-muted">{destinatarios} contactos</div>
                </div>
                <div className="flex flex-col gap-0.5">
                  <div className="text-[11px] font-extrabold tracking-[0.07em] uppercase text-ys-dimmer">Mensaje</div>
                  <div className="font-mono text-[13px] text-ys-text">{template.nombre}</div>
                </div>
              </div>

              <div className="border border-ys-border-softest rounded-[14px] bg-[#f4f8f5] px-4 py-[18px]">
                <div className="max-w-[80%] bg-white rounded-[14px_14px_14px_4px] px-3.5 py-[11px] pb-2 shadow-[0_1px_2px_rgba(16,24,20,0.08)] flex flex-col gap-1.5">
                  <div className="text-[13px] leading-[1.5] font-medium text-ys-text whitespace-pre-wrap">
                    {template.contenido}
                  </div>
                  <div className="self-end font-mono text-[10.5px] text-ys-dimmer">14:32</div>
                </div>
              </div>

              <div className="border border-ys-border rounded-2xl px-4 py-4 flex flex-col gap-2.5">
                <div className="text-[13px] font-extrabold text-ys-text">Costo</div>
                <div className="flex items-center justify-between text-[13px] text-ys-muted font-semibold">
                  <span>Costo estimado</span>
                  <span className="font-mono text-ys-text">USD {costo.toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between text-[13px] font-bold text-ys-text border-t border-ys-border-soft pt-2.5">
                  <span>Total a enviar</span>
                  <span className="font-mono">{destinatarios} mensajes</span>
                </div>
              </div>
            </div>

            {confirmando ? (
              <div className="border-t border-ys-border-soft px-6 md:px-7 py-4 flex flex-col gap-3">
                <div className="text-[13.5px] font-semibold text-ys-text">
                  ¿Enviar esta campaña ahora a {destinatarios} contactos?
                </div>
                <div className="flex justify-end gap-2.5">
                  <button
                    onClick={() => setConfirmando(false)}
                    disabled={enviando}
                    className="text-[13.5px] font-bold text-[#3f4844] border border-ys-border rounded-[10px] px-[18px] py-2.5 cursor-pointer transition-colors hover:bg-[#f7f9f8] disabled:opacity-50"
                  >
                    Volver
                  </button>
                  <button
                    onClick={handleEnviarConfirmado}
                    disabled={enviando}
                    className="text-[13.5px] font-bold text-white bg-ys-green rounded-[10px] px-[18px] py-2.5 cursor-pointer transition-all hover:bg-ys-green-hover disabled:opacity-60"
                  >
                    {enviando ? "Enviando..." : "Sí, enviar"}
                  </button>
                </div>
              </div>
            ) : (
              <WizardFooter
                onBack={() => setPaso(3)}
                backLabel="Atrás"
                onNext={() => setConfirmando(true)}
                nextLabel="Enviar campaña"
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}

function StepIndicator({
  n,
  label,
  active,
  done,
}: {
  n: number;
  label: string;
  active: boolean;
  done: boolean;
}) {
  const color = active || done ? "#16211b" : "#9aa19c";
  const bg = active ? "#12B76A" : done ? "#ecf9f2" : "#f2f4f3";
  const tx = active ? "#fff" : done ? "#067647" : "#9aa19c";
  return (
    <div className="flex items-center gap-2 flex-none" style={{ color }}>
      <div
        className="w-[22px] h-[22px] rounded-full flex items-center justify-center font-mono text-[11px]"
        style={{ background: bg, color: tx }}
      >
        {n}
      </div>
      <span className="text-[12.5px] font-bold whitespace-nowrap">{label}</span>
    </div>
  );
}

function StepLine({ done }: { done: boolean }) {
  return (
    <div className="flex-1 min-w-[16px] h-[1.5px] bg-ys-border-softest rounded-sm overflow-hidden">
      <div
        className="h-full bg-ys-green transition-[width] duration-200"
        style={{ width: done ? "100%" : "0%" }}
      />
    </div>
  );
}

function WizardFooter({
  onBack,
  backLabel,
  onNext,
  nextDisabled,
  nextLabel = "Continuar",
}: {
  onBack: () => void;
  backLabel: string;
  onNext: () => void;
  nextDisabled?: boolean;
  nextLabel?: string;
}) {
  return (
    <div className="border-t border-ys-border-soft px-6 md:px-7 py-4 flex items-center gap-2.5">
      <button
        onClick={onBack}
        className="text-[13.5px] font-bold text-[#3f4844] border border-ys-border rounded-[10px] px-[18px] py-2.5 cursor-pointer transition-colors hover:bg-[#f7f9f8]"
      >
        {backLabel}
      </button>
      <button
        onClick={onNext}
        disabled={nextDisabled}
        className="ml-auto text-[13.5px] font-bold text-white bg-ys-green rounded-[10px] px-[18px] py-2.5 cursor-pointer transition-all hover:bg-ys-green-hover hover:-translate-y-px disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
      >
        {nextLabel}
      </button>
    </div>
  );
}
