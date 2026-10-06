"use client";

import { colorDeEtiqueta, esEtiquetaDeSistema, mostrarEtiqueta } from "@/lib/etiquetas/etiquetas";

/**
 * Etiqueta con color estable por nombre ("cliente" siempre en verde).
 *  - `onClick`: la vuelve un botón (por ejemplo, para elegirla como filtro).
 *  - `onQuitar`: muestra una × para sacarla; las de sistema nunca la muestran.
 */
export default function EtiquetaChip({
  nombre,
  cantidad,
  activa = false,
  onClick,
  onQuitar,
  chica = false,
}: {
  nombre: string;
  cantidad?: number;
  activa?: boolean;
  onClick?: () => void;
  onQuitar?: () => void;
  chica?: boolean;
}) {
  const c = colorDeEtiqueta(nombre);
  const puedeQuitar = !!onQuitar && !esEtiquetaDeSistema(nombre);
  const cuerpo = (
    <>
      {mostrarEtiqueta(nombre)}
      {typeof cantidad === "number" && <span className="font-mono opacity-70">{cantidad}</span>}
    </>
  );

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-bold whitespace-nowrap border ${
        chica ? "text-[10.5px] px-2 py-[1px]" : "text-[12px] px-2.5 py-[3px]"
      } ${activa ? "ring-2 ring-offset-1" : ""}`}
      style={{
        background: c.bg,
        color: c.text,
        borderColor: c.borde,
        ...(activa ? ({ "--tw-ring-color": c.text } as React.CSSProperties) : {}),
      }}
    >
      {onClick ? (
        <button type="button" onClick={onClick} className="inline-flex items-center gap-1.5 cursor-pointer">
          {cuerpo}
        </button>
      ) : (
        <span className="inline-flex items-center gap-1.5">{cuerpo}</span>
      )}
      {puedeQuitar && (
        <button
          type="button"
          onClick={onQuitar}
          aria-label={`Quitar etiqueta ${nombre}`}
          className="cursor-pointer leading-none opacity-60 hover:opacity-100"
        >
          ×
        </button>
      )}
    </span>
  );
}
