"use client";

/**
 * Confirmación para excluir contactos del Motor desde la selección de
 * Contactos. Existe para explicar qué implica antes de hacerlo (no es
 * borrar: es que el motor deje de considerarlos) y que se puede deshacer.
 */
export default function ExcluirMotorModal({
  open,
  cantidad,
  guardando,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  cantidad: number;
  guardando: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!open) return null;

  const plural = cantidad !== 1;

  return (
    <div
      onClick={(e) => e.target === e.currentTarget && !guardando && onCancel()}
      className="fixed inset-0 bg-black/[.34] flex items-center justify-center z-[100] px-4"
      style={{ animation: "ys-fade .16s ease both" }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="excluir-motor-titulo"
        className="w-full max-w-[440px] bg-white rounded-[18px] px-6 py-[22px] flex flex-col gap-4 shadow-[var(--shadow-modal)]"
        style={{ animation: "ys-modal .19s cubic-bezier(.4,0,.2,1) both" }}
      >
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 flex-none rounded-[12px] bg-ys-el2 flex items-center justify-center">
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="5.8" stroke="#5d6560" strokeWidth="1.5" />
              <path d="M3.9 12.1 12.1 3.9" stroke="#5d6560" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </div>
          <div className="flex flex-col gap-1 min-w-0">
            <h3 id="excluir-motor-titulo" className="text-[17px] font-extrabold tracking-[-0.015em] text-ys-text">
              Excluir {cantidad} contacto{plural ? "s" : ""} del motor
            </h3>
            <p className="text-[13px] text-ys-muted font-medium leading-[1.55]">
              Usalo para números que no son clientes, como otras sucursales, proveedores o tu equipo.
            </p>
          </div>
        </div>

        <ul className="flex flex-col gap-2 text-[12.5px] text-[#3f4844] font-medium leading-[1.5]">
          <li className="flex gap-2">
            <span className="text-ys-green-text font-bold">•</span>
            <span>El motor deja de tener{plural ? "los" : "lo"} en cuenta para recomendaciones y campañas sugeridas.</span>
          </li>
          <li className="flex gap-2">
            <span className="text-ys-green-text font-bold">•</span>
            <span>Sale{plural ? "n" : ""} de la lista de contactos y de los contadores de leads.</span>
          </li>
          <li className="flex gap-2">
            <span className="text-ys-green-text font-bold">•</span>
            <span>No se borra nada: podés volver a incluir{plural ? "los" : "lo"} cuando quieras desde la pestaña &ldquo;Excluidos&rdquo;.</span>
          </li>
        </ul>

        <div className="flex items-center gap-2.5 pt-1">
          <button
            onClick={onCancel}
            disabled={guardando}
            className="text-[13.5px] font-bold text-[#3f4844] border border-ys-border rounded-[10px] px-[18px] py-2.5 cursor-pointer transition-colors hover:bg-[#f7f9f8] disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            disabled={guardando}
            className="ml-auto text-[13.5px] font-bold text-ys-card bg-ys-dark rounded-[10px] px-[18px] py-2.5 cursor-pointer transition-all hover:-translate-y-px disabled:opacity-60 disabled:cursor-wait disabled:transform-none"
          >
            {guardando ? "Excluyendo..." : `Excluir del motor`}
          </button>
        </div>
      </div>
    </div>
  );
}
