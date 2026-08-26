"use client";

import { useEffect, useRef, useState } from "react";
import type { ChatMessage, Contact, IAConversacionResumen } from "@/lib/types";
import { renderChatCard } from "./IAChatCards";
import { listarConversacionesIAAction } from "@/lib/actions/ia_conversaciones";

interface IAProps {
  userName: string;
  messages: ChatMessage[];
  contacts: Contact[];
  onSend: (text: string) => void;
  onConfirmSeleccion: (ids: string[]) => void;
  onConfirmAudiencia: () => void;
  onVerAudiencia: (audienciaId: string) => void;
  onElegirCategoria: (categoria: string) => void;
  onUsarSugerencia: () => void;
  onPedirOtraSugerencia: () => void;
  onGuardarBorrador: () => void;
  onEnviarAMeta: () => void;
  onVerTemplates: () => void;
  onElegirAudienciaCampana: (audienciaId: string) => void;
  onElegirTemplateCampana: (templateId: string) => void;
  onElegirMomentoCampana: (momento: "ahora" | "programar") => void;
  onElegirFechaCampana: (fechaIso: string) => void;
  onConfirmarCampana: () => void;
  onVerCampana: (campanaId: string) => void;
  onConfirmarImportarContactos: (diasAnalisis: number, limiteContactos: number) => void;
  onCrearAudienciaDesdeBusqueda: (consulta: string, contactosIds: string[]) => void;
  onCrearAudienciaDesdeImportacion: (contactosIds: string[]) => void;
  onNuevaConversacion: () => void;
  onSeleccionarConversacion: (conversacionId: string) => void;
  conversacionActivaId: string | null;
  sending?: boolean;
}

const SUGERENCIAS = [
  "Mostrame contactos que hablaron de algo puntual",
  "Quiero importar mis contactos",
  "Quiero armar un template nuevo",
  "Quiero mandar una campaña",
];

// Variantes del mensaje de bienvenida — se elige una al azar por sesión de
// chat (no en cada render) para que la pantalla inicial no se sienta
// siempre igual, sin perder la claridad de qué puede hacer el asistente.
const BIENVENIDAS = [
  {
    titulo: "¿Qué querés saber sobre tu negocio?",
    texto: "Puedo analizar tus contactos, audiencias, templates y campañas para ayudarte a tomar mejores decisiones.",
  },
  {
    titulo: "¿En qué te ayudo hoy?",
    texto: "Puedo armar una audiencia, un template o una campaña entera por vos, solo pedímelo en lenguaje natural.",
  },
  {
    titulo: "Hagamos algo juntos",
    texto: "Puedo importar tus contactos, buscar quién habló de un tema puntual, y crear audiencias, templates y campañas hablando conmigo.",
  },
];

export default function IA({
  userName,
  messages,
  contacts,
  onSend,
  onConfirmSeleccion,
  onConfirmAudiencia,
  onVerAudiencia,
  onElegirCategoria,
  onUsarSugerencia,
  onPedirOtraSugerencia,
  onGuardarBorrador,
  onEnviarAMeta,
  onVerTemplates,
  onElegirAudienciaCampana,
  onElegirTemplateCampana,
  onElegirMomentoCampana,
  onElegirFechaCampana,
  onConfirmarCampana,
  onVerCampana,
  onConfirmarImportarContactos,
  onCrearAudienciaDesdeBusqueda,
  onCrearAudienciaDesdeImportacion,
  onNuevaConversacion,
  onSeleccionarConversacion,
  conversacionActivaId,
  sending,
}: IAProps) {
  const [value, setValue] = useState("");
  const [historialOpen, setHistorialOpen] = useState(false);
  const [accionesAbiertas, setAccionesAbiertas] = useState(false);
  const [sugerenciasAbiertas, setSugerenciasAbiertas] = useState(false);
  const [historialConversaciones, setHistorialConversaciones] = useState<
    IAConversacionResumen[]
  >([]);
  const [historialCargando, setHistorialCargando] = useState(false);
  // Inicializador lazy: se elige una sola vez al montar el componente, no
  // en cada render — así el mensaje no "salta" mientras el usuario lo lee.
  const [bienvenida] = useState(
    () => BIENVENIDAS[Math.floor(Math.random() * BIENVENIDAS.length)],
  );
  const scrollRef = useRef<HTMLDivElement>(null);
  const firstName = userName.split(" ")[0] || userName;

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  async function handleToggleHistorial() {
    const abriendo = !historialOpen;
    setHistorialOpen(abriendo);
    if (abriendo) {
      setHistorialCargando(true);
      const conversaciones = await listarConversacionesIAAction();
      setHistorialConversaciones(conversaciones);
      setHistorialCargando(false);
    }
  }

  function handleSend() {
    const text = value.trim();
    if (!text || sending) return;
    onSend(text);
    setValue("");
  }

  const lastBotMessageId = [...messages].reverse().find((m) => m.type === "bot")?.id;

  // Solo se cuenta como "conversación iniciada" cuando hay algo más que el
  // mensaje de bienvenida fijo que ya trae AppShell.
  const hayConversacion = messages.some((m) => m.type === "user");

  return (
    <div className="flex-1 min-w-0 bg-ys-bg flex flex-col h-full pt-[58px] md:pt-0">
      <div className="flex-none px-4 md:px-[38px] pt-3 md:pt-7 pb-3 md:pb-[18px] flex flex-col md:flex-row md:items-end gap-3 md:gap-4 border-b border-ys-border-softest bg-ys-bg">
        <div className="flex flex-col gap-1.5">
          <div className="text-2xl md:text-[28px] font-extrabold tracking-[-0.025em] text-ys-text">
            IA
          </div>
          <button
            onClick={() => setAccionesAbiertas((v) => !v)}
            className="flex md:hidden items-center gap-1.5 text-sm text-ys-muted font-medium text-left cursor-pointer"
            aria-expanded={accionesAbiertas}
            aria-controls="ia-header-acciones"
          >
            <span>Analizá tu negocio conversando con YamaSend.</span>
            <svg
              width="14"
              height="14"
              viewBox="0 0 16 16"
              fill="none"
              className="flex-none transition-transform duration-200"
              style={{ transform: accionesAbiertas ? "rotate(180deg)" : "rotate(0deg)" }}
            >
              <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <div className="hidden md:block text-[15px] text-ys-muted font-medium">
            Analizá tu negocio conversando con YamaSend.
          </div>
        </div>
        <div
          id="ia-header-acciones"
          className={`${accionesAbiertas ? "flex" : "hidden"} md:flex flex-col md:flex-row md:ml-auto items-stretch md:items-center gap-2.5`}
        >
          <div className="relative w-full md:w-auto">
            <button
              onClick={handleToggleHistorial}
              className="w-full md:w-auto flex items-center justify-center md:justify-start gap-2 bg-white border border-ys-border rounded-[10px] px-3.5 py-2.5 text-[13px] font-bold text-[#3f4844] cursor-pointer transition-colors hover:bg-[#f7f9f8]"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.5" />
                <path d="M8 5v3.2l2.2 1.3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Historial
            </button>
            {historialOpen && (
              <div
                className="absolute top-[calc(100%+6px)] left-0 right-0 md:left-auto md:right-0 w-auto md:w-[280px] max-h-[360px] overflow-y-auto bg-white border border-ys-border rounded-xl p-1.5 shadow-[var(--shadow-popover)] z-30"
                style={{ animation: "ys-fade-up .17s cubic-bezier(.4,0,.2,1) both" }}
              >
                {historialCargando && (
                  <div className="px-2.5 py-2.5 text-[12.5px] text-ys-dim font-medium">
                    Cargando conversaciones...
                  </div>
                )}
                {!historialCargando && historialConversaciones.length === 0 && (
                  <div className="px-2.5 py-2.5 text-[12.5px] text-ys-dim font-medium">
                    Todavía no tenés conversaciones guardadas.
                  </div>
                )}
                {!historialCargando &&
                  historialConversaciones.map((c) => {
                    const activa = c.id === conversacionActivaId;
                    return (
                      <button
                        key={c.id}
                        onClick={() => {
                          onSeleccionarConversacion(c.id);
                          setHistorialOpen(false);
                        }}
                        className={`w-full text-left px-2.5 py-2.5 rounded-lg cursor-pointer transition-colors flex flex-col gap-0.5 ${
                          activa ? "bg-ys-green-bg" : "hover:bg-[#f7f9f8]"
                        }`}
                      >
                        <div
                          className={`text-[12.5px] font-bold truncate ${activa ? "text-ys-green-text" : "text-ys-text"}`}
                        >
                          {c.titulo}
                        </div>
                        <div className="text-[11px] text-ys-dim font-medium">
                          {new Date(c.updatedAt).toLocaleDateString("es-AR", {
                            day: "2-digit",
                            month: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </div>
                      </button>
                    );
                  })}
              </div>
            )}
          </div>
          <button
            onClick={() => {
              onNuevaConversacion();
              setHistorialOpen(false);
            }}
            className="w-full md:w-auto flex items-center justify-center md:justify-start gap-2 bg-ys-green text-white text-[13.5px] font-bold px-4 py-2.5 rounded-[10px] cursor-pointer transition-all hover:bg-ys-green-hover hover:-translate-y-px shadow-[var(--shadow-cta)]"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M8 3v10M3 8h10" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" />
            </svg>
            Nueva conversación
          </button>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-4 md:px-[38px] py-5">
        <div className="w-full max-w-[760px] mx-auto flex flex-col gap-5">
          {!hayConversacion && (
            <div
              className="pt-6 md:pt-9 pb-2 flex flex-col items-center gap-3 text-center"
              style={{ animation: "ys-fade-up .22s cubic-bezier(.4,0,.2,1) both" }}
            >
              <div className="w-[52px] h-[52px] rounded-[17px] bg-ys-green-bg flex items-center justify-center">
                <svg width="24" height="24" viewBox="0 0 16 16" fill="none" style={{ animation: "ys-spark 3.2s ease-in-out infinite" }}>
                  <path d="m8 2 1.6 3.6L13 7l-3.4 1.4L8 12 6.4 8.4 3 7l3.4-1.4L8 2Z" stroke="#12B76A" strokeWidth="1.4" strokeLinejoin="round" />
                </svg>
              </div>
              <div className="text-2xl font-extrabold tracking-[-0.025em] text-ys-text">
                Hola, {firstName} 👋
              </div>
              <div className="text-[17px] font-bold text-[#3f4844]">
                {bienvenida.titulo}
              </div>
              <div className="text-sm text-ys-muted font-medium max-w-[480px] leading-[1.55]">
                {bienvenida.texto}
              </div>
            </div>
          )}

          {messages.map((m) =>
            m.type === "user" ? (
              <div
                key={m.id}
                className="self-end max-w-[78%] bg-ys-green-bg rounded-[14px_14px_4px_14px] px-[15px] py-3 text-sm leading-[1.5] text-ys-text font-semibold"
                style={{ animation: "ys-msg .24s cubic-bezier(.4,0,.2,1) both" }}
              >
                {m.text}
              </div>
            ) : (
              <div key={m.id} className="flex flex-col gap-3" style={{ animation: "ys-msg .24s cubic-bezier(.4,0,.2,1) both" }}>
                <div className="flex items-center gap-2">
                  <div className="w-[22px] h-[22px] rounded-lg bg-ys-green-bg flex items-center justify-center">
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                      <path d="m8 2 1.6 3.6L13 7l-3.4 1.4L8 12 6.4 8.4 3 7l3.4-1.4L8 2Z" stroke="#12B76A" strokeWidth="1.6" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <div className="text-xs font-extrabold tracking-[0.04em] text-ys-green-text">
                    YamaSend IA
                  </div>
                </div>
                <div
                  className={`text-[14.5px] leading-[1.6] font-medium ${
                    m.type === "error" ? "text-ys-red-text" : "text-[#2c3531]"
                  }`}
                >
                  {m.text}
                </div>

                {m.payload &&
                  renderChatCard(
                    m.payload,
                    contacts,
                    {
                      onConfirmSeleccion,
                      onConfirmAudiencia,
                      onVerAudiencia,
                      onElegirCategoria,
                      onUsarSugerencia,
                      onPedirOtraSugerencia,
                      onGuardarBorrador,
                      onEnviarAMeta,
                      onVerTemplates,
                      onElegirAudienciaCampana,
                      onElegirTemplateCampana,
                      onElegirMomentoCampana,
                      onElegirFechaCampana,
                      onConfirmarCampana,
                      onVerCampana,
                      onConfirmarImportarContactos,
                      onCrearAudienciaDesdeBusqueda,
                      onCrearAudienciaDesdeImportacion,
                    },
                    m.id === lastBotMessageId,
                  )}
              </div>
            ),
          )}

          {sending && (
            <div className="flex flex-col gap-2.5" style={{ animation: "ys-msg .2s ease both" }}>
              <div className="flex items-center gap-2">
                <div className="w-[22px] h-[22px] rounded-lg bg-ys-green-bg flex items-center justify-center">
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                    <path d="m8 2 1.6 3.6L13 7l-3.4 1.4L8 12 6.4 8.4 3 7l3.4-1.4L8 2Z" stroke="#12B76A" strokeWidth="1.6" strokeLinejoin="round" />
                  </svg>
                </div>
                <div className="text-xs font-extrabold tracking-[0.04em] text-ys-green-text">
                  YamaSend IA
                </div>
              </div>
              <div className="flex items-center gap-2.5">
                <div className="flex gap-1.5 bg-white border border-ys-border rounded-full px-3.5 py-2.5">
                  <span className="w-[6px] h-[6px] rounded-full bg-ys-green" style={{ animation: "ys-dot 1.2s infinite" }} />
                  <span className="w-[6px] h-[6px] rounded-full bg-ys-green" style={{ animation: "ys-dot 1.2s infinite .15s" }} />
                  <span className="w-[6px] h-[6px] rounded-full bg-ys-green" style={{ animation: "ys-dot 1.2s infinite .3s" }} />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex-none px-4 md:px-[38px] py-3.5 md:py-[26px] bg-ys-bg">
        <div className="w-full max-w-[760px] mx-auto flex flex-col gap-3">
          {!hayConversacion && (
            <div className="flex flex-col gap-2">
              <button
                onClick={() => setSugerenciasAbiertas((v) => !v)}
                className="flex md:hidden items-center gap-1.5 self-start text-[12.5px] font-bold text-ys-muted cursor-pointer"
                aria-expanded={sugerenciasAbiertas}
                aria-controls="ia-chips-sugerencias"
              >
                <span>Ideas para empezar</span>
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 16 16"
                  fill="none"
                  className="flex-none transition-transform duration-200"
                  style={{ transform: sugerenciasAbiertas ? "rotate(0deg)" : "rotate(180deg)" }}
                >
                  <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              <div
                id="ia-chips-sugerencias"
                className={`${sugerenciasAbiertas ? "flex" : "hidden"} md:flex gap-2 flex-wrap`}
              >
                {SUGERENCIAS.map((s) => (
                  <button
                    key={s}
                    onClick={() => onSend(s)}
                    className="flex items-center gap-2 bg-white border border-ys-border rounded-full px-3.5 py-2 text-[12.5px] font-semibold text-[#3f4844] cursor-pointer transition-all hover:border-ys-green-border hover:bg-[#f7fbf9] hover:-translate-y-px"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-end gap-2.5 bg-white border border-ys-border rounded-2xl pl-4 pr-2.5 py-2.5 transition-colors focus-within:!border-ys-green">
            <textarea
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Preguntale algo a YamaSend..."
              rows={1}
              className="flex-1 min-h-[26px] max-h-[132px] border-none outline-none resize-none bg-transparent text-sm leading-[1.5] font-medium text-ys-text py-1.5"
            />
            <button
              onClick={handleSend}
              disabled={!value.trim() || sending}
              className="flex-none w-[38px] h-[38px] rounded-xl bg-ys-green flex items-center justify-center cursor-pointer transition-all hover:bg-ys-green-hover hover:-translate-y-px disabled:opacity-40 disabled:cursor-not-allowed disabled:transform-none"
            >
              <svg width="17" height="17" viewBox="0 0 16 16" fill="none">
                <path d="M14 2 7 9M14 2l-4.5 12L7 9 2 6.5 14 2Z" stroke="#fff" strokeWidth="1.5" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
          <div className="text-[11.5px] text-ys-dimmer font-medium">
            Enter para enviar · Shift + Enter para nueva línea. YamaSend nunca envía una campaña sin tu confirmación.
          </div>
        </div>
      </div>
    </div>
  );
}
