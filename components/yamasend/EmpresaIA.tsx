"use client";

import { useEffect, useRef, useState } from "react";
import {
  sendEmpresaIAMessageAction,
  type EmpresaIAMensaje,
} from "@/lib/actions/empresa_ia";

const SUGERENCIAS = [
  "¿Qué empleado está rindiendo mejor?",
  "¿Hay algún problema que deba resolver?",
  "¿Cuál fue la campaña con mejor tasa de lectura?",
  "¿A quién le faltan créditos?",
];

interface Mensaje extends EmpresaIAMensaje {
  id: string;
}

export default function EmpresaIA({ orgNombre }: { orgNombre: string }) {
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [input, setInput] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const finRef = useRef<HTMLDivElement>(null);
  // Contador en ref en vez de Date.now(): el id se genera durante el render
  // y una llamada impura ahí puede dar ids distintos entre renders.
  const idRef = useRef(0);

  useEffect(() => {
    finRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensajes, enviando]);

  async function enviar(texto: string) {
    const limpio = texto.trim();
    if (!limpio || enviando) return;

    idRef.current += 1;
    const propio: Mensaje = {
      id: `u-${idRef.current}`,
      rol: "user",
      texto: limpio,
    };

    // El historial se toma antes de agregar el mensaje nuevo: el server action
    // recibe el contexto previo y el mensaje actual por separado.
    const historial = mensajes.map(({ rol, texto }) => ({ rol, texto }));

    setMensajes((m) => [...m, propio]);
    setInput("");
    setEnviando(true);
    setError(null);

    const res = await sendEmpresaIAMessageAction(limpio, historial);
    setEnviando(false);

    if (res.error) {
      setError(res.error);
      return;
    }

    idRef.current += 1;
    setMensajes((m) => [
      ...m,
      { id: `a-${idRef.current}`, rol: "assistant", texto: res.texto },
    ]);
  }

  return (
    <div className="flex flex-col h-full px-4 md:px-[38px] pt-3 md:pt-[34px] pb-5">
      <div className="flex flex-col gap-1.5 pb-5">
        <h1 className="text-2xl md:text-[28px] font-extrabold tracking-[-0.025em] text-ys-text">
          Asistente
        </h1>
        <p className="text-sm md:text-[15px] text-ys-dim font-medium">
          Preguntale lo que quieras sobre la actividad de tu equipo.
        </p>
      </div>

      <div className="flex-1 min-h-0 flex flex-col bg-white border border-ys-border rounded-2xl overflow-hidden">
        <div className="flex-1 overflow-y-auto px-4 md:px-6 py-5 flex flex-col gap-4">
          {mensajes.length === 0 && (
            <div className="flex flex-col items-center gap-5 py-8 md:py-14 text-center">
              <div className="w-12 h-12 rounded-full bg-ys-green-bg flex items-center justify-center">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M12 3.5 13.6 9l5.4 1.6-5.4 1.6L12 17.7l-1.6-5.5L5 10.6 10.4 9 12 3.5Z"
                    stroke="#12B76A"
                    strokeWidth="1.7"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="text-[15px] font-extrabold text-ys-text">
                  Hola, {orgNombre}
                </span>
                <span className="text-[13.5px] text-ys-dim font-medium max-w-[380px]">
                  Puedo analizar el rendimiento de tus vendedores, sus campañas y
                  sus créditos. No tengo acceso a sus conversaciones de WhatsApp.
                </span>
              </div>
              <div className="flex flex-col gap-1.5 w-full max-w-[400px]">
                {SUGERENCIAS.map((s) => (
                  <button
                    key={s}
                    onClick={() => enviar(s)}
                    className="text-[13px] font-semibold text-[#3f4844] bg-white border border-ys-border rounded-[10px] px-3.5 py-2.5 cursor-pointer transition-colors hover:bg-[#f7f9f8] hover:border-[#d8ded9] text-left"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {mensajes.map((m) => (
            <div
              key={m.id}
              className={`flex ${m.rol === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[85%] md:max-w-[78%] rounded-2xl px-4 py-3 text-[13.5px] leading-relaxed whitespace-pre-wrap ${
                  m.rol === "user"
                    ? "bg-ys-dark text-white font-medium"
                    : "bg-[#f7f9f8] border border-ys-border-softest text-ys-text font-medium"
                }`}
              >
                {m.texto}
              </div>
            </div>
          ))}

          {enviando && (
            <div className="flex justify-start">
              <div className="bg-[#f7f9f8] border border-ys-border-softest rounded-2xl px-4 py-3 flex items-center gap-1.5">
                {[0, 150, 300].map((d) => (
                  <span
                    key={d}
                    className="w-1.5 h-1.5 rounded-full bg-[#9aa19c] animate-bounce"
                    style={{ animationDelay: `${d}ms` }}
                  />
                ))}
              </div>
            </div>
          )}

          {error && (
            <div className="bg-ys-red-bg border border-ys-red-border rounded-xl px-4 py-3">
              <span className="text-[13px] font-semibold text-ys-red-text">
                {error}
              </span>
            </div>
          )}

          <div ref={finRef} />
        </div>

        <div className="border-t border-ys-border-softest p-3 md:p-4 flex items-end gap-2.5">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              // Enter envía, Shift+Enter hace salto de línea.
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                enviar(input);
              }
            }}
            rows={1}
            placeholder="Preguntá algo sobre tu equipo..."
            className="flex-1 min-w-0 resize-none bg-white border border-ys-border rounded-[10px] px-3.5 py-2.5 text-[13.5px] font-medium text-ys-text outline-none focus:border-ys-green-border max-h-[120px]"
          />
          <button
            onClick={() => enviar(input)}
            disabled={enviando || input.trim().length === 0}
            className="flex-none w-[42px] h-[42px] flex items-center justify-center bg-ys-green text-white rounded-[10px] cursor-pointer transition-all hover:bg-ys-green-hover disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label="Enviar"
          >
            <svg width="17" height="17" viewBox="0 0 16 16" fill="none">
              <path
                d="M2.5 8h11M9 3.5 13.5 8 9 12.5"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
