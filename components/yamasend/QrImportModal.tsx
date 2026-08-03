"use client";

interface QrImportModalProps {
  open: boolean;
  onClose: () => void;
  status: "loading" | "waiting" | "connected" | "error";
  qrImageUrl?: string | null;
}

export default function QrImportModal({
  open,
  onClose,
  status,
  qrImageUrl,
}: QrImportModalProps) {
  if (!open) return null;

  return (
    <div
      onClick={(e) => e.target === e.currentTarget && onClose()}
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-[2000]"
    >
      <div className="rounded-2xl border border-ys-border2 bg-ys-card px-8 py-7 w-[340px] flex flex-col items-center gap-4">
        <div className="font-display text-base font-bold">
          📲 Importar contactos
        </div>
        <div className="text-xs text-ys-muted text-center leading-relaxed">
          Escaneá el código QR con tu WhatsApp para conectar tu cuenta e
          importar tus contactos automáticamente.
        </div>
        <div className="w-[200px] h-[200px] rounded-[10px] bg-ys-el border border-ys-border flex items-center justify-center">
          {status === "loading" && (
            <div className="w-3 h-3 rounded-full border-2 border-ys-border border-t-ys-red animate-spin" />
          )}
          {status === "waiting" && qrImageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={qrImageUrl}
              alt="QR"
              className="w-[200px] h-[200px] rounded-[10px]"
            />
          )}
          {status === "connected" && (
            <div className="text-[56px] text-center">✅</div>
          )}
          {status === "error" && (
            <div className="text-[36px] text-center">⚠️</div>
          )}
        </div>
        <div
          className={`text-[11px] flex items-center gap-1.5 ${
            status === "connected"
              ? "text-[#34d399]"
              : status === "error"
                ? "text-[#ef4444]"
                : "text-ys-muted"
          }`}
        >
          {status === "loading" && "Generando QR..."}
          {status === "waiting" && "Escaneá con tu WhatsApp → Vincular dispositivo"}
          {status === "connected" && "✅ ¡Conectado!"}
          {status === "error" && "Error al obtener QR. Reintentando..."}
        </div>
        <button
          onClick={onClose}
          className="w-full mt-1 rounded-lg border border-ys-border text-ys-muted text-xs py-[7px] hover:border-ys-border2 hover:text-ys-text transition-colors cursor-pointer"
        >
          Cerrar
        </button>
      </div>
    </div>
  );
}
