"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { transcribirAudioIAAction } from "@/lib/actions/ia_audio";

export type EstadoGrabacion = "idle" | "recording" | "transcribing";

// Candidatos de mimeType en orden de preferencia. Chrome/Firefox/Android
// soportan opus en webm; Safari e iOS solo soportan mp4/aac. Si ninguno
// está disponible, se deja que el navegador elija el default (undefined).
const MIME_CANDIDATOS = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
];

function elegirMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  return MIME_CANDIDATOS.find((m) => MediaRecorder.isTypeSupported(m));
}

interface UseVoiceRecorderResult {
  estado: EstadoGrabacion;
  duracionSeg: number;
  error: string | null;
  // Un solo tap arranca a grabar (igual en mobile y desktop). Enviar y
  // descartar son botones explícitos en la barra de grabación — no hace
  // falta mantener nada presionado.
  iniciar: () => void;
  detenerYEnviar: () => void;
  descartar: () => void;
}

export function useVoiceRecorder(
  onTranscribed: (texto: string) => void,
): UseVoiceRecorderResult {
  const [estado, setEstado] = useState<EstadoGrabacion>("idle");
  const [duracionSeg, setDuracionSeg] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const limpiarStream = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    mediaRecorderRef.current = null;
  }, []);

  useEffect(() => () => limpiarStream(), [limpiarStream]);

  const detenerGrabacion = useCallback((): Promise<Blob | null> => {
    return new Promise((resolve) => {
      const recorder = mediaRecorderRef.current;
      if (!recorder || recorder.state === "inactive") {
        resolve(null);
        return;
      }
      recorder.onstop = () => {
        const mimeType = recorder.mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type: mimeType });
        resolve(blob.size > 0 ? blob : null);
      };
      recorder.stop();
    });
  }, []);

  const descartar = useCallback(async () => {
    await detenerGrabacion();
    limpiarStream();
    setEstado("idle");
    setDuracionSeg(0);
  }, [detenerGrabacion, limpiarStream]);

  const detenerYEnviar = useCallback(async () => {
    const blob = await detenerGrabacion();
    limpiarStream();

    if (!blob) {
      setEstado("idle");
      setDuracionSeg(0);
      return;
    }

    // Audio demasiado corto (click accidental) — se descarta sin transcribir.
    if (duracionSeg < 1) {
      setEstado("idle");
      setDuracionSeg(0);
      return;
    }

    setEstado("transcribing");
    const formData = new FormData();
    formData.append("audio", blob);

    const { texto, error: err } = await transcribirAudioIAAction(formData);
    setEstado("idle");
    setDuracionSeg(0);

    if (err || !texto) {
      setError(err ?? "No se entendió el audio. Probá de nuevo.");
      return;
    }
    onTranscribed(texto);
  }, [detenerGrabacion, duracionSeg, limpiarStream, onTranscribed]);

  const iniciar = useCallback(async () => {
    if (estado !== "idle") return;
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];

      const mimeType = elegirMimeType();
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.start();
      setEstado("recording");
      setDuracionSeg(0);
      timerRef.current = setInterval(() => {
        setDuracionSeg((d) => d + 1);
      }, 1000);
    } catch {
      setError(
        "No pude acceder al micrófono. Revisá los permisos del navegador.",
      );
      limpiarStream();
    }
  }, [estado, limpiarStream]);

  return { estado, duracionSeg, error, iniciar, detenerYEnviar, descartar };
}

function formatearDuracion(seg: number): string {
  const m = Math.floor(seg / 60);
  const s = seg % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

const MicIcon = ({ className }: { className?: string }) => (
  <svg width="17" height="17" viewBox="0 0 16 16" fill="none" className={className}>
    <rect x="5.5" y="1.5" width="5" height="8" rx="2.5" stroke="currentColor" strokeWidth="1.4" />
    <path
      d="M3 7.5v.5a5 5 0 0 0 10 0v-.5M8 13v1.5"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
    />
  </svg>
);

const TrashIcon = () => (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
    <path
      d="M2.5 4.5h11M6 4.5V3a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1.5M6.5 7.5v4M9.5 7.5v4M3.5 4.5l.6 8.4a1 1 0 0 0 1 .9h5.8a1 1 0 0 0 1-.9l.6-8.4"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const CheckIcon = () => (
  <svg width="17" height="17" viewBox="0 0 16 16" fill="none">
    <path d="M3 8.5 6.5 12 13 4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/** Botón de micrófono en estado idle. Mismo tamaño que el botón de enviar de cada chat. */
export function VoiceRecorderMicButton({
  recorder,
  disabled,
  className,
}: {
  recorder: UseVoiceRecorderResult;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={recorder.iniciar}
      aria-label="Grabar audio"
      title="Grabar un audio"
      className={
        className ??
        "flex-none w-[38px] h-[38px] rounded-xl bg-white border border-ys-border flex items-center justify-center cursor-pointer transition-all hover:bg-[#f7f9f8] disabled:opacity-40 disabled:cursor-not-allowed"
      }
    >
      <MicIcon className="text-[#3f4844]" />
    </button>
  );
}

/** Barra que reemplaza al input mientras se graba o se transcribe. */
export function VoiceRecorderActiveBar({ recorder }: { recorder: UseVoiceRecorderResult }) {
  if (recorder.estado === "transcribing") {
    return (
      <div className="flex-1 flex items-center gap-2.5 bg-white border border-ys-border rounded-2xl px-4 py-2.5 text-sm font-medium text-ys-dim">
        <div className="flex items-center gap-1">
          {[0, 150, 300].map((d) => (
            <span
              key={d}
              className="w-1.5 h-1.5 rounded-full bg-ys-green animate-bounce"
              style={{ animationDelay: `${d}ms` }}
            />
          ))}
        </div>
        Transcribiendo audio...
      </div>
    );
  }

  return (
    <div className="flex-1 flex items-center gap-2.5 bg-white border border-ys-border rounded-2xl pl-4 pr-2.5 py-2 min-h-[42px]">
      <span className="w-2 h-2 rounded-full bg-ys-red flex-none animate-pulse" />
      <span className="text-sm font-semibold text-ys-text tabular-nums">
        {formatearDuracion(recorder.duracionSeg)}
      </span>
      <span className="flex-1 text-[12.5px] font-medium text-ys-dim truncate">Grabando...</span>

      <button
        type="button"
        onClick={recorder.descartar}
        aria-label="Descartar audio"
        className="flex-none w-[34px] h-[34px] rounded-lg bg-ys-red-bg border border-ys-red-border text-ys-red-text flex items-center justify-center cursor-pointer transition-all hover:-translate-y-px"
      >
        <TrashIcon />
      </button>
      <button
        type="button"
        onClick={recorder.detenerYEnviar}
        aria-label="Enviar audio"
        className="flex-none w-[38px] h-[38px] rounded-xl bg-ys-green flex items-center justify-center cursor-pointer transition-all hover:bg-ys-green-hover hover:-translate-y-px text-white"
      >
        <CheckIcon />
      </button>
    </div>
  );
}
