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
      className="fixed inset-0 bg-black/[.34] flex items-center justify-center z-[100] px-4"
      style={{ animation: "ys-fade .16s ease both" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[440px] bg-white rounded-[18px] px-7 py-[22px] flex flex-col gap-[18px] shadow-[var(--shadow-modal)]"
        style={{ animation: "ys-modal .19s cubic-bezier(.4,0,.2,1) both" }}
      >
        <div className="flex flex-col gap-1.5">
          <div className="text-[19px] font-extrabold tracking-[-0.02em] text-ys-text">
            Vinculá tu WhatsApp
          </div>
          <div className="text-[13.5px] text-ys-muted font-medium leading-[1.5]">
            Escaneá este código QR desde WhatsApp para conectar tu cuenta.
          </div>
        </div>

        <div className="self-center w-[196px] h-[196px] rounded-[14px] border border-dashed border-[#cfd8d3] bg-[#fbfcfb] flex items-center justify-center overflow-hidden">
          {status === "loading" && (
            <div className="w-8 h-8 rounded-full border-[3px] border-ys-green-bg border-t-ys-green animate-spin" />
          )}
          {status === "waiting" && qrImageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qrImageUrl} alt="QR" className="w-[196px] h-[196px]" />
          )}
          {status === "connected" && (
            <div className="w-14 h-14 rounded-full bg-ys-green-bg flex items-center justify-center">
              <svg width="26" height="26" viewBox="0 0 16 16" fill="none">
                <path d="m3 8.4 3.4 3L13 4.6" stroke="#12B76A" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          )}
          {status === "error" && (
            <div className="text-[36px] text-center">⚠️</div>
          )}
        </div>

        <div
          className="text-center text-[13px] font-semibold"
          style={{
            color:
              status === "connected"
                ? "#067647"
                : status === "error"
                  ? "#a8443b"
                  : "#6b736e",
          }}
        >
          {status === "loading" && "Generando QR..."}
          {status === "waiting" && "Escaneá con tu WhatsApp → Vincular dispositivo"}
          {status === "connected" && "¡Conectado!"}
          {status === "error" && "Error al obtener QR. Reintentando..."}
        </div>

        <div className="bg-[#fbfcfb] border border-ys-border-softest rounded-xl px-4 py-3.5 flex flex-col gap-2.5">
          <Step n={1} texto="Abrí WhatsApp en tu celular." />
          <Step n={2} texto="Entrá a Dispositivos vinculados." />
          <Step n={3} texto="Tocá “Vincular un dispositivo”." />
          <Step n={4} texto="Escaneá este código." />
        </div>

        <button
          onClick={onClose}
          className="self-end text-[13.5px] font-bold text-[#3f4844] border border-ys-border rounded-[10px] px-[18px] py-2.5 cursor-pointer transition-colors hover:bg-[#f7f9f8]"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}

function Step({ n, texto }: { n: number; texto: string }) {
  return (
    <div className="flex gap-2.5 text-[13px] text-[#3f4844] font-semibold">
      <span className="font-mono text-ys-green-text">{n}.</span>
      {texto}
    </div>
  );
}
