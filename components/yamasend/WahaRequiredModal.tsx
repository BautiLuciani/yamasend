"use client";

interface WahaRequiredModalProps {
  open: boolean;
  onClose: () => void;
  onVincular: () => void;
}

/**
 * Se muestra en vez de SyncConfigModal cuando el usuario intenta analizar
 * contactos sin tener el WhatsApp vinculado (yamas_send_waha_sessions.estado
 * !== "conectada"). El botón "Vincular WhatsApp" cierra este modal y abre
 * QrImportModal directamente, para no obligar al usuario a ir a buscarlo.
 */
export default function WahaRequiredModal({
  open,
  onClose,
  onVincular,
}: WahaRequiredModalProps) {
  if (!open) return null;

  return (
    <div
      onClick={(e) => e.target === e.currentTarget && onClose()}
      className="fixed inset-0 bg-black/[.34] flex items-center justify-center z-[100] px-4"
      style={{ animation: "ys-fade .16s ease both" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[440px] bg-white rounded-[18px] px-7 py-[26px] flex flex-col gap-5 shadow-[var(--shadow-modal)]"
        style={{ animation: "ys-modal .19s cubic-bezier(.4,0,.2,1) both" }}
      >
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="w-14 h-14 rounded-full bg-ys-el2 flex items-center justify-center">
            <svg width="26" height="26" viewBox="0 0 16 16" fill="none">
              <path
                d="M4.5 2.5h4.6c.3 0 .5.1.7.3l1.9 1.9c.2.2.3.4.3.7v7.6a1 1 0 0 1-1 1h-6.5a1 1 0 0 1-1-1v-9.5a1 1 0 0 1 1-1Z"
                stroke="#7b837e"
                strokeWidth="1.3"
                strokeLinejoin="round"
              />
              <path d="M5.5 8h4M5.5 10.2h2.6" stroke="#7b837e" strokeWidth="1.3" strokeLinecap="round" />
              <circle cx="11.2" cy="10.8" r="3.3" fill="#fff" stroke="#a8443b" strokeWidth="1.3" />
              <path d="M11.2 9.3v1.6M11.2 12v.05" stroke="#a8443b" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
          </div>
          <div className="text-[18px] font-extrabold tracking-[-0.02em] text-ys-text">
            Vinculá tu WhatsApp para analizar
          </div>
          <p className="text-[13.5px] text-ys-muted font-medium leading-[1.55]">
            Para analizar tus contactos necesitamos leer tus conversaciones de WhatsApp,
            y tu celular todavía no está vinculado. Vinculalo y volvé a intentar.
          </p>
        </div>

        <div className="flex justify-end gap-2.5 border-t border-ys-border-soft pt-[18px]">
          <button
            onClick={onClose}
            className="text-[13.5px] font-bold text-[#3f4844] border border-ys-border rounded-[10px] px-[18px] py-2.5 cursor-pointer transition-colors hover:bg-[#f7f9f8]"
          >
            Ahora no
          </button>
          <button
            onClick={onVincular}
            className="text-[13.5px] font-bold text-white bg-ys-green rounded-[10px] px-[18px] py-2.5 cursor-pointer transition-all hover:bg-ys-green-hover hover:-translate-y-px"
          >
            Vincular WhatsApp
          </button>
        </div>
      </div>
    </div>
  );
}
