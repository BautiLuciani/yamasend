"use client";

import {
  ActionBar,
  BtnPrimary,
  BtnSecondary,
  SectionHeader,
} from "./SectionChrome";
import { useEffect, useRef, useState } from "react";
import type { ChatMessage, Contact, IAConversacionResumen } from "@/lib/types";
import { renderChatCard } from "./IAChatCards";
import IAAyudaModal from "./IAAyudaModal";
import { listarConversacionesIAAction } from "@/lib/actions/ia_conversaciones";
import {
  useVoiceRecorder,
  VoiceRecorderMicButton,
  VoiceRecorderActiveBar,
} from "./VoiceRecorder";

interface IAProps {
  userName: string;
  /** null = todavía verificando. Alimenta el estado del encabezado. */
  whatsappVinculado: boolean | null;
  /** Abre el QR para vincular (solo si hay permiso; si no, undefined). */
  onVincular?: () => void;
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
  onComprarCreditos: () => void;
  onVerCampana: (campanaId: string) => void;
  onConfirmarImportarContactos: (diasAnalisis: number, limiteContactos: number) => void;
  onCrearAudienciaDesdeBusqueda: (consulta: string, contactosIds: string[]) => void;
  onCrearAudienciaDesdeImportacion: (contactosIds: string[]) => void;
  onElegirRecursoEditar: (id: string, nombre: string) => void;
  onElegirTemperatura: (temperatura: "caliente" | "tibio" | "frio") => void;
  onElegirCampoCampana: (campo: "nombre" | "template" | "audiencia" | "fecha") => void;
  onRevisarMotor: () => void;
  onVerAudiencias: () => void;
  onDeshacerAudiencias: (ids: string[]) => Promise<boolean>;
  onEnviarTemplatesProducto: (
    ediciones: { nombre: string; contenido: string }[],
    modo: "meta" | "borrador",
  ) => Promise<boolean>;
  onNuevaConversacion: () => void;
  onSeleccionarConversacion: (conversacionId: string) => void;
  onBorrarConversacion: (conversacionId: string) => Promise<{ error: string | null }>;
  conversacionActivaId: string | null;
  sending?: boolean;
}

// Un solo globo de sugerencia que va rotando. El primero abre la ayuda; el
// resto se envía como pedido al Asistente.
const SUGERENCIAS_IA = [
  { texto: "Qué te puedo pedir", ayuda: true },
  { texto: "Armame una campaña para clientes que no compran hace 15 días de los productos A, B y C", ayuda: false },
  { texto: "Tengo $50.000, ¿qué campaña de reactivación me sugerís?", ayuda: false },
  { texto: "Tengo el producto X con 50% de descuento, ¿a quién me recomendás enviarlo?", ayuda: false },
];
const ROTACION_MS = 6000;

export default function IA({
  whatsappVinculado,
  onVincular,
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
  onComprarCreditos,
  onVerCampana,
  onConfirmarImportarContactos,
  onCrearAudienciaDesdeBusqueda,
  onCrearAudienciaDesdeImportacion,
  onElegirRecursoEditar,
  onElegirTemperatura,
  onElegirCampoCampana,
  onRevisarMotor,
  onVerAudiencias,
  onDeshacerAudiencias,
  onEnviarTemplatesProducto,
  onNuevaConversacion,
  onSeleccionarConversacion,
  onBorrarConversacion,
  conversacionActivaId,
  sending,
}: IAProps) {
  const [value, setValue] = useState("");
  const [historialOpen, setHistorialOpen] = useState(false);
  const [ayudaAbierta, setAyudaAbierta] = useState(false);
  const [sugIdx, setSugIdx] = useState(0);
  const [sugPausada, setSugPausada] = useState(false);

  useEffect(() => {
    if (sugPausada) return;
    const t = setInterval(() => setSugIdx((i) => (i + 1) % SUGERENCIAS_IA.length), ROTACION_MS);
    return () => clearInterval(t);
  }, [sugPausada]);
  const [historialConversaciones, setHistorialConversaciones] = useState<
    IAConversacionResumen[]
  >([]);
  const [historialCargando, setHistorialCargando] = useState(false);
  const [confirmandoBorrado, setConfirmandoBorrado] = useState<IAConversacionResumen | null>(
    null,
  );
  const [borrando, setBorrando] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

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

  async function handleConfirmarBorrado() {
    if (!confirmandoBorrado) return;
    setBorrando(true);
    const { error } = await onBorrarConversacion(confirmandoBorrado.id);
    setBorrando(false);
    if (error) return;
    setHistorialConversaciones((prev) =>
      prev.filter((c) => c.id !== confirmandoBorrado.id),
    );
    setConfirmandoBorrado(null);
  }

  function handleSend() {
    const text = value.trim();
    if (!text || sending) return;
    onSend(text);
    setValue("");
  }

  // El audio transcripto se manda igual que un mensaje tipeado: onSend no
  // distingue el origen del texto.
  const recorder = useVoiceRecorder((texto) => {
    if (sending) return;
    onSend(texto);
  });

  // Los avisos externos (aprobación/rechazo de Meta) quedan EXCLUIDOS a
  // propósito: son eventos que le pasan a la cuenta, no turnos de la
  // conversación. Si contaran, un aviso que llega justo mientras el usuario
  // tiene abierta una tarjeta de acción le deshabilitaría el botón y lo
  // dejaría trabado a mitad de flujo.
  const lastBotMessageId = [...messages].reverse().find((m) => m.type === "bot")?.id;

  // Solo se cuenta como "conversación iniciada" cuando hay algo más que el
  // mensaje de bienvenida fijo que ya trae AppShell.
  const hayConversacion = messages.some((m) => m.type === "user");

  return (
    <>
    <div className="flex-1 min-w-0 bg-ys-bg flex flex-col h-full pt-[58px] md:pt-0">
      <SectionHeader
        title="Asistente"
        subtitle="Analizá tu negocio conversando con YamaSend."
        status={{
          icon: (
            <svg width="20" height="20" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="m8 2 1.6 3.6L13 7l-3.4 1.4L8 12 6.4 8.4 3 7l3.4-1.4L8 2Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
            </svg>
          ),
          label: "WhatsApp",
          value:
            whatsappVinculado === null ? "Verificando…" : whatsappVinculado ? "Vinculado" : "Vincular WhatsApp",
          tone: whatsappVinculado === null ? "neutral" : whatsappVinculado ? "ok" : "off",
          onClick: whatsappVinculado === false ? onVincular : undefined,
        }}
      />

      <ActionBar>
        <BtnPrimary
          onClick={() => {
            onNuevaConversacion();
            setHistorialOpen(false);
          }}
        >
          Nueva conversación
        </BtnPrimary>
          <div className="relative">
            <button
              onClick={handleToggleHistorial}
              className="inline-flex items-center gap-2 h-11 px-[18px] bg-ys-card border border-ys-border rounded-[10px] text-sm font-bold text-ys-text cursor-pointer transition-colors hover:bg-[#f7f9f8]"
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
                      <div
                        key={c.id}
                        className={`group w-full flex items-center gap-1 rounded-lg transition-colors ${
                          activa ? "bg-ys-green-bg" : "hover:bg-[#f7f9f8]"
                        }`}
                      >
                        <button
                          onClick={() => {
                            onSeleccionarConversacion(c.id);
                            setHistorialOpen(false);
                          }}
                          className="flex-1 min-w-0 text-left px-2.5 py-2.5 cursor-pointer flex flex-col gap-0.5"
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
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setConfirmandoBorrado(c);
                          }}
                          aria-label={`Eliminar conversación "${c.titulo}"`}
                          className="flex-none w-8 h-8 mr-1 rounded-lg flex items-center justify-center text-ys-dim opacity-0 group-hover:opacity-100 focus-visible:opacity-100 cursor-pointer transition-all hover:bg-ys-warn-bg hover:text-ys-orange"
                        >
                          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                            <path
                              d="M3 4.5h10M6.5 4.5V3a1 1 0 0 1 1-1h1a1 1 0 0 1 1 1v1.5M4.25 4.5l.55 8.05a1.2 1.2 0 0 0 1.2 1.1h4a1.2 1.2 0 0 0 1.2-1.1l.55-8.05M6.75 7.3v3.6M9.25 7.3v3.6"
                              stroke="currentColor"
                              strokeWidth="1.4"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </button>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        {conversacionActivaId && (
          <BtnSecondary
            onClick={() =>
              setConfirmandoBorrado({
                id: conversacionActivaId,
                titulo:
                  historialConversaciones.find((c) => c.id === conversacionActivaId)?.titulo ??
                  "esta conversación",
                updatedAt: "",
              })
            }
          >
            Eliminar conversación
          </BtnSecondary>
        )}
      </ActionBar>

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
                ¿Qué campaña inteligente enviamos?
              </div>
            </div>
          )}

          {/* El saludo de arriba ya hace de bienvenida: el mensaje fijo del bot se oculta. */}
          {messages.filter((m) => m.id !== "welcome").map((m) =>
            m.type === "user" ? (
              <div
                key={m.id}
                className="self-end max-w-[78%] bg-ys-green-bg rounded-[14px_14px_4px_14px] px-[15px] py-3 text-sm leading-[1.5] text-ys-text font-semibold"
                style={{ animation: "ys-msg .24s cubic-bezier(.4,0,.2,1) both" }}
              >
                {m.text}
              </div>
            ) : m.type === "aviso" ? (
              /* Aviso externo (Meta aprobó o rechazó un template). Se muestra
                 como una nota al margen y no como un turno de la IA, porque
                 es algo que le pasó a la cuenta mientras el usuario hacía
                 otra cosa. */
              <div
                key={m.id}
                className="self-center max-w-[92%] flex items-start gap-2 bg-ys-el2 border border-ys-border-softest rounded-[12px] px-3.5 py-2.5"
                style={{ animation: "ys-msg .24s cubic-bezier(.4,0,.2,1) both" }}
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="mt-[3px] flex-none">
                  <circle cx="8" cy="8" r="6.5" stroke="#7b837e" strokeWidth="1.5" />
                  <path d="M8 4.6v4.2M8 11.2v.2" stroke="#7b837e" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
                <div className="text-[13px] leading-[1.5] font-semibold text-ys-dim">{m.text}</div>
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
                    Asistente
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
                      onComprarCreditos,
                      onVerCampana,
                      onConfirmarImportarContactos,
                      onCrearAudienciaDesdeBusqueda,
                      onCrearAudienciaDesdeImportacion,
            onElegirRecursoEditar,
            onElegirTemperatura,
            onElegirCampoCampana,
                      onRevisarMotor,
                      onVerAudiencias,
                      onDeshacerAudiencias,
                      onEnviarTemplatesProducto,
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
                  Asistente
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
          {/* Un solo globo de sugerencia, siempre visible, que va cambiando. */}
          <div className="flex">
            <button
              key={sugIdx}
              disabled={sending}
              onClick={() => {
                const sg = SUGERENCIAS_IA[sugIdx];
                if (sg.ayuda) setAyudaAbierta(true);
                else onSend(sg.texto);
              }}
              onMouseEnter={() => setSugPausada(true)}
              onMouseLeave={() => setSugPausada(false)}
              className={`max-w-full text-left rounded-full px-3.5 py-2 text-[12.5px] font-semibold cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed border ${
                SUGERENCIAS_IA[sugIdx].ayuda
                  ? "bg-ys-green-bg border-ys-green-border text-ys-green-text"
                  : "bg-white border-ys-border text-[#3f4844] hover:border-ys-green-border"
              }`}
              style={{ animation: "ys-fade-up .25s cubic-bezier(.4,0,.2,1) both" }}
            >
              {SUGERENCIAS_IA[sugIdx].texto}
            </button>
          </div>

          {recorder.estado === "idle" ? (
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
              <VoiceRecorderMicButton
                recorder={recorder}
                disabled={sending}
                className="flex-none w-[38px] h-[38px] rounded-xl bg-transparent flex items-center justify-center cursor-pointer transition-all hover:bg-[#f2f4f3] disabled:opacity-40 disabled:cursor-not-allowed text-[#3f4844]"
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
          ) : (
            <div className="flex items-end gap-2.5">
              <VoiceRecorderActiveBar recorder={recorder} />
            </div>
          )}
          {recorder.error && (
            <div className="text-[12px] text-ys-red-text font-medium">{recorder.error}</div>
          )}
          <div className="text-[11.5px] text-ys-dimmer font-medium">
            Enter para enviar · Shift + Enter para nueva línea. YamaSend nunca envía una campaña sin tu confirmación.
          </div>
        </div>
      </div>
    </div>

    {confirmandoBorrado && (
      <div
        onClick={() => !borrando && setConfirmandoBorrado(null)}
        className="fixed inset-0 z-[9000] bg-[rgba(16,24,20,0.4)] flex items-center justify-center px-6 py-8"
        style={{ animation: "ys-fade .16s ease both" }}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-[420px] bg-ys-card rounded-[18px] px-7 pt-[26px] pb-[22px] flex flex-col gap-4 shadow-[var(--shadow-modal)]"
          style={{ animation: "ys-modal .19s cubic-bezier(.4,0,.2,1) both" }}
        >
          <div className="flex flex-col gap-1.5">
            <div className="text-lg font-extrabold tracking-[-0.02em] text-ys-text">
              ¿Eliminar esta conversación?
            </div>
            <div className="text-[13.5px] text-ys-muted font-medium leading-[1.5]">
              Se va a borrar &ldquo;{confirmandoBorrado.titulo}&rdquo; para siempre, junto con todo
              su historial de mensajes. Esta acción no se puede deshacer.
            </div>
          </div>
          <div className="flex justify-end gap-2.5">
            <button
              onClick={() => setConfirmandoBorrado(null)}
              disabled={borrando}
              className="text-[13.5px] font-bold text-[#3f4844] border border-ys-border rounded-[10px] px-[18px] py-2.5 cursor-pointer transition-colors hover:bg-[#f7f9f8] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancelar
            </button>
            <button
              onClick={handleConfirmarBorrado}
              disabled={borrando}
              className="text-[13.5px] font-bold text-ys-orange bg-ys-orange-bg border border-ys-warn-bg rounded-[10px] px-[18px] py-2.5 cursor-pointer transition-colors hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {borrando ? "Eliminando..." : "Eliminar"}
            </button>
          </div>
        </div>
      </div>
    )}
    <IAAyudaModal
      open={ayudaAbierta}
      onClose={() => setAyudaAbierta(false)}
      onProbarEjemplo={(texto) => {
        setAyudaAbierta(false);
        onSend(texto);
      }}
    />
    </>
  );
}
