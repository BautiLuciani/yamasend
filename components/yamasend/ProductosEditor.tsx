"use client";

import { useRef } from "react";
import type { Producto } from "@/lib/types";

/** Cartel de resultado (ok/error) reusado por las distintas secciones. */
export function StatusMsg({ msg }: { msg: { type: "ok" | "err"; text: string } }) {
  return (
    <div
      className={`text-[13px] font-medium rounded-lg px-3.5 py-2.5 border ${
        msg.type === "ok"
          ? "bg-ys-green-bg text-ys-green-text border-ys-green-border"
          : "bg-ys-red-bg text-ys-red-text border-ys-red-border"
      }`}
    >
      {msg.text}
    </div>
  );
}

/**
 * Lista editable de productos/servicios. Se guarda como array jsonb en la
 * columna `productos`, no como texto libre: la IA (generación de templates,
 * agente conversacional) consume esto y una lista estructurada es mucho
 * más confiable de extraer y de reinyectar en un prompt que un párrafo.
 *
 * El botón de subir archivo delega en analizarCatalogoProductosAction, que
 * NO persiste nada: los productos extraídos reemplazan lo que hay en
 * pantalla y quedan editables hasta que la persona toque "Guardar". Es
 * deliberado — la extracción puede equivocarse, sobre todo leyendo fotos.
 */
export function ProductosEditor({
  productos,
  onChange,
  readOnly,
  onSubirArchivo,
  analizando,
  msg,
  accept = ".pdf,.csv,.xls,.xlsx,image/*",
  textoAyuda = "Aceptamos PDF, Excel/CSV o una foto del catálogo. La IA completa la lista y después la podés corregir.",
}: {
  productos: Producto[];
  onChange: (p: Producto[]) => void;
  readOnly?: boolean;
  onSubirArchivo: (file: File) => void;
  analizando: boolean;
  msg: { type: "ok" | "err"; text: string } | null;
  /** Tipos de archivo que acepta el selector. */
  accept?: string;
  /** Texto de ayuda bajo los botones. */
  textoAyuda?: string;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  function actualizar(i: number, campo: keyof Producto, valor: string) {
    onChange(
      productos.map((p, idx) => (idx === i ? { ...p, [campo]: valor } : p)),
    );
  }

  return (
    <div className="flex flex-col gap-2.5">
      {productos.map((p, i) => (
        <div
          key={i}
          className="flex flex-col gap-2 border rounded-[10px] p-[11px]"
          style={{ borderColor: "#e8ebe9" }}
        >
          <div className="flex items-start gap-2">
            <div className="flex-1 min-w-0 flex flex-col gap-2">
              <input
                value={p.nombre}
                readOnly={readOnly}
                onChange={(e) => actualizar(i, "nombre", e.target.value)}
                placeholder="Nombre del producto o servicio"
                autoComplete="off"
                className={`w-full border-none outline-none bg-transparent text-sm font-bold text-ys-text ${
                  readOnly ? "cursor-not-allowed text-ys-muted" : ""
                }`}
              />
              <input
                value={p.precio ?? ""}
                readOnly={readOnly}
                onChange={(e) => actualizar(i, "precio", e.target.value)}
                placeholder="Precio (opcional)"
                autoComplete="off"
                className={`w-full border-none outline-none bg-transparent text-[13px] font-semibold text-ys-muted ${
                  readOnly ? "cursor-not-allowed" : ""
                }`}
              />
              <input
                value={p.descripcion ?? ""}
                readOnly={readOnly}
                onChange={(e) => actualizar(i, "descripcion", e.target.value)}
                placeholder="Descripción (opcional)"
                autoComplete="off"
                className={`w-full border-none outline-none bg-transparent text-[13px] font-semibold text-ys-muted ${
                  readOnly ? "cursor-not-allowed" : ""
                }`}
              />
            </div>
            {!readOnly && (
              <button
                type="button"
                onClick={() => onChange(productos.filter((_, idx) => idx !== i))}
                aria-label="Quitar producto"
                className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-ys-muted hover:text-ys-text hover:bg-ys-el2 transition-colors cursor-pointer text-lg leading-none"
              >
                ×
              </button>
            )}
          </div>
        </div>
      ))}

      {!productos.length && (
        <div className="text-[13px] font-semibold text-ys-muted py-1">
          Todavía no cargaste productos. Agregalos a mano o subí un archivo con
          tu catálogo.
        </div>
      )}

      {!readOnly && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() =>
              onChange([...productos, { nombre: "", precio: "", descripcion: "" }])
            }
            className="px-3 py-2 rounded-[10px] border text-[13px] font-extrabold text-ys-text hover:bg-ys-el2 transition-colors cursor-pointer"
            style={{ borderColor: "#e8ebe9" }}
          >
            + Agregar producto
          </button>

          <button
            type="button"
            disabled={analizando}
            onClick={() => fileInputRef.current?.click()}
            className="px-3 py-2 rounded-[10px] text-[13px] font-extrabold text-white bg-ys-green cursor-pointer transition-all hover:bg-ys-green-hover hover:-translate-y-px disabled:opacity-60 disabled:cursor-default disabled:hover:translate-y-0"
          >
            {analizando ? "Analizando archivo..." : "Subir catálogo con IA"}
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept={accept}
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              // Se limpia el value para que volver a elegir el MISMO archivo
              // dispare onChange de nuevo (si no, el input lo considera sin
              // cambios y el segundo intento no hace nada).
              e.target.value = "";
              if (file) onSubirArchivo(file);
            }}
          />
        </div>
      )}

      {msg && <StatusMsg msg={msg} />}

      {!readOnly && (
        <div className="text-[12px] font-semibold text-ys-muted">
          {textoAyuda}
        </div>
      )}
    </div>
  );
}
