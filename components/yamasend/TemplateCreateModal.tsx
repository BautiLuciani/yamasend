"use client";

import { useRef, useState } from "react";

interface TemplateCreateModalProps {
  open: boolean;
  content: string;
  onContentChange: (v: string) => void;
  name: string;
  onNameChange: (v: string) => void;
  categoria: string;
  onCategoriaChange: (v: string) => void;
  onCancel: () => void;
  onSaveDraft: () => void;
  onSendToMeta: () => void;
  onGenerateIA: (descripcion: string) => Promise<{ sugerencia: string | null; error: string | null }>;
  sending: boolean;
  savingDraft: boolean;
}

const CATEGORIAS = [
  { key: "marketing", label: "Marketing" },
  { key: "utility", label: "Utilidad" },
  { key: "authentication", label: "Autenticación" },
] as const;

export default function TemplateCreateModal({
  open,
  content,
  onContentChange,
  name,
  onNameChange,
  categoria,
  onCategoriaChange,
  onCancel,
  onSaveDraft,
  onSendToMeta,
  onGenerateIA,
  sending,
  savingDraft,
}: TemplateCreateModalProps) {
  const [iaAbierta, setIaAbierta] = useState(false);
  const [iaDescripcion, setIaDescripcion] = useState("");
  const [iaCargando, setIaCargando] = useState(false);
  const [iaSugerencia, setIaSugerencia] = useState<string | null>(null);
  const [iaError, setIaError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  if (!open) return null;

  const busy = sending || savingDraft;
  const canSend = content.trim().length > 10 && name.trim().length >= 3;

  async function handleGenerar() {
    if (!iaDescripcion.trim()) return;
    setIaCargando(true);
    setIaError(null);
    const result = await onGenerateIA(iaDescripcion);
    setIaCargando(false);
    if (result.error || !result.sugerencia) {
      setIaError(result.error ?? "No se pudo generar el mensaje.");
      return;
    }
    setIaSugerencia(result.sugerencia);
  }

  function handleUsarSugerencia() {
    if (!iaSugerencia) return;
    onContentChange(iaSugerencia);
    setIaAbierta(false);
    setIaSugerencia(null);
    setIaDescripcion("");
  }

  function handleAgregarVariable() {
    // Cuenta las variables {{n}} ya presentes en el mensaje para numerar la
    // próxima en orden, sin saltear números aunque el usuario haya borrado
    // alguna en el medio del texto.
    const existentes = content.match(/\{\{\d+\}\}/g) ?? [];
    const siguiente = existentes.length + 1;
    const variable = `{{${siguiente}}}`;

    const el = textareaRef.current;
    if (!el) {
      onContentChange(`${content}${variable}`);
      return;
    }

    const start = el.selectionStart ?? content.length;
    const end = el.selectionEnd ?? content.length;
    const nuevoContenido = content.slice(0, start) + variable + content.slice(end);
    onContentChange(nuevoContenido);

    // Recoloca el cursor después de la variable insertada en el próximo tick,
    // una vez que React actualizó el value del textarea.
    requestAnimationFrame(() => {
      el.focus();
      const cursorPos = start + variable.length;
      el.setSelectionRange(cursorPos, cursorPos);
    });
  }

  function handleCancelClick() {
    setIaAbierta(false);
    setIaDescripcion("");
    setIaSugerencia(null);
    setIaError(null);
    onCancel();
  }

  return (
    <div
      onClick={(e) => e.target === e.currentTarget && !busy && handleCancelClick()}
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
                      onClick={() => onCategoriaChange(c.key)}
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
                <button
                  onClick={() => setIaAbierta((v) => !v)}
                  className="ml-auto flex items-center gap-1.5 text-[12.5px] font-extrabold text-ys-green-text bg-ys-green-bg rounded-full px-3.5 py-1.5 cursor-pointer transition-all hover:brightness-95 hover:-translate-y-px"
                >
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                    <path
                      d="m8 2 1.6 3.6L13 7l-3.4 1.4L8 12 6.4 8.4 3 7l3.4-1.4L8 2Z"
                      stroke="#12B76A"
                      strokeWidth="1.4"
                      strokeLinejoin="round"
                    />
                  </svg>
                  Crear con IA
                </button>
              </div>
              <textarea
                ref={textareaRef}
                value={content}
                onChange={(e) => onContentChange(e.target.value)}
                placeholder="Escribí el mensaje que recibirán tus contactos..."
                className="min-h-[132px] resize-y border border-ys-border rounded-xl px-[15px] py-[13px] text-[13.5px] leading-[1.55] font-medium text-ys-text outline-none transition-colors focus:border-ys-green"
              />
              <div className="flex items-center gap-2.5">
                <button
                  onClick={handleAgregarVariable}
                  className="flex items-center gap-1.5 text-[12.5px] font-bold text-[#3f4844] border border-ys-border rounded-[9px] px-3 py-[7px] cursor-pointer transition-colors hover:bg-[#f7fbf9] hover:border-ys-green-border"
                >
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                    <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                  Agregar variable
                </button>
              </div>
              <div className="text-xs text-ys-dim font-medium">
                Las variables permiten personalizar el mensaje para cada contacto. Ejemplo: &ldquo;Hola{" "}
                {"{{1}}"}, tenemos una promoción especial para vos.&rdquo;
              </div>
            </div>

            {iaAbierta && (
              <div className="bg-[#fbfcfb] border border-ys-border rounded-[14px] px-[18px] py-4 flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                    <path
                      d="m8 2 1.6 3.6L13 7l-3.4 1.4L8 12 6.4 8.4 3 7l3.4-1.4L8 2Z"
                      stroke="#12B76A"
                      strokeWidth="1.4"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <div className="text-[13px] font-extrabold text-ys-text">¿Qué querés comunicar?</div>
                </div>
                <textarea
                  value={iaDescripcion}
                  onChange={(e) => setIaDescripcion(e.target.value)}
                  placeholder="Ej: Quiero avisar a mis clientes que tenemos 20% de descuento durante agosto."
                  disabled={iaCargando}
                  className="min-h-16 resize-y border border-ys-border rounded-[10px] px-3.5 py-[11px] text-[13px] leading-[1.5] font-medium text-ys-text outline-none transition-colors focus:border-ys-green disabled:opacity-60"
                />

                {iaError && (
                  <div className="text-[12.5px] text-ys-red-text font-semibold">{iaError}</div>
                )}

                {!iaCargando && !iaSugerencia && (
                  <button
                    onClick={handleGenerar}
                    disabled={!iaDescripcion.trim()}
                    className="self-start text-[12.5px] font-extrabold text-white bg-ys-green rounded-[9px] px-3.5 py-2.5 cursor-pointer transition-all hover:bg-ys-green-hover hover:-translate-y-px disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                  >
                    Generar mensaje
                  </button>
                )}

                {iaCargando && (
                  <div className="flex items-center gap-2.5 text-[12.5px] font-bold text-ys-muted">
                    <div className="flex gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-ys-green animate-pulse" />
                      <span className="w-1.5 h-1.5 rounded-full bg-ys-green animate-pulse [animation-delay:150ms]" />
                      <span className="w-1.5 h-1.5 rounded-full bg-ys-green animate-pulse [animation-delay:300ms]" />
                    </div>
                    YamaSend está escribiendo...
                  </div>
                )}

                {!iaCargando && iaSugerencia && (
                  <div className="flex flex-col gap-2.5">
                    <div className="bg-white border border-ys-green-border rounded-xl px-[15px] py-[13px] text-[13px] leading-[1.55] text-[#2c3531] font-medium whitespace-pre-wrap">
                      {iaSugerencia}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={handleUsarSugerencia}
                        className="text-[12.5px] font-extrabold text-white bg-ys-green rounded-[9px] px-3.5 py-2.5 cursor-pointer transition-all hover:bg-ys-green-hover hover:-translate-y-px"
                      >
                        Usar este mensaje
                      </button>
                      <button
                        onClick={handleGenerar}
                        className="text-[12.5px] font-bold text-[#3f4844] border border-ys-border rounded-[9px] px-3.5 py-2.5 cursor-pointer transition-colors hover:bg-[#f7f9f8]"
                      >
                        Generar otra opción
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
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
            <div className="text-xs text-ys-dim font-medium">
              Las variables se muestran con datos de ejemplo:{" "}
              <span className="font-mono text-[#3f4844]">{"{{1}}"}</span> → Martina.
            </div>
          </div>
        </div>

        <div className="border-t border-ys-border-soft px-6 md:px-7 py-4 flex items-center gap-2.5 flex-wrap">
          <button
            onClick={handleCancelClick}
            disabled={busy}
            className="text-[13.5px] font-bold text-[#3f4844] border border-ys-border rounded-[10px] px-[18px] py-2.5 cursor-pointer transition-colors hover:bg-[#f7f9f8] disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={onSaveDraft}
            disabled={busy || name.trim().length < 3}
            className="ml-auto text-[13.5px] font-bold text-[#3f4844] border border-ys-border rounded-[10px] px-[18px] py-2.5 cursor-pointer transition-colors hover:bg-[#f7f9f8] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {savingDraft ? "Guardando..." : "Guardar borrador"}
          </button>
          <button
            onClick={onSendToMeta}
            disabled={!canSend || busy}
            className="text-[13.5px] font-bold text-white bg-ys-green rounded-[10px] px-[18px] py-2.5 cursor-pointer transition-all hover:bg-ys-green-hover hover:-translate-y-px disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
          >
            {sending ? "Enviando..." : "Enviar a Meta para aprobación"}
          </button>
        </div>
      </div>
    </div>
  );
}
