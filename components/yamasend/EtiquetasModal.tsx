"use client";

import { useState } from "react";
import {
  aplicarSugerenciaAction,
  crearEtiquetaAction,
  eliminarEtiquetaAction,
  ignorarSugerenciaAction,
  renombrarEtiquetaAction,
  type EtiquetasResumen,
} from "@/lib/actions/etiquetas";
import { esEtiquetaDeSistema, mostrarEtiqueta, normalizarEtiqueta, ORIGEN_LABEL, type OrigenSugerencia } from "@/lib/etiquetas/etiquetas";
import EtiquetaChip from "./EtiquetaChip";

/**
 * Administración de etiquetas, dentro de Contactos: sugeridas (Aplicar, Revisar
 * o Ignorar), crear una propia y renombrar o eliminar las que ya existen.
 * Filtrar contactos por etiqueta se hace en la barra de Contactos.
 */

const BTN_PRIMARIO =
  "text-[12.5px] font-bold text-white bg-ys-green rounded-[10px] px-3.5 py-2 cursor-pointer transition-all hover:bg-ys-green-hover disabled:opacity-60 disabled:cursor-default";
const BTN_SECUNDARIO =
  "text-[12.5px] font-bold text-[#3f4844] border border-ys-border rounded-[10px] px-3.5 py-2 cursor-pointer transition-colors hover:bg-[#f7f9f8] disabled:opacity-60 disabled:cursor-default";

export default function EtiquetasModal({
  resumen,
  elegidas,
  onToggle,
  puedeCrear,
  onSinPermiso,
  onRevisar,
  onCambio,
  onClose,
}: {
  resumen: EtiquetasResumen;
  /** Etiquetas que hoy filtran la lista de contactos. */
  elegidas: string[];
  onToggle: (etiqueta: string) => void;
  puedeCrear: boolean;
  onSinPermiso: () => void;
  /** Abre la revisión de una sugerencia. */
  onRevisar: (etiqueta: string, descripcion: string) => void;
  /** Algo cambió: el padre vuelve a leer etiquetas y contactos. */
  onCambio: () => Promise<void>;
  onClose: () => void;
}) {
  const [propia, setPropia] = useState("");
  const [renombrando, setRenombrando] = useState<string | null>(null);
  const [nombreNuevo, setNombreNuevo] = useState("");
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  async function ejecutar(clave: string, fn: () => Promise<{ error: string | null }>, ok: string | (() => string)) {
    if (!puedeCrear) {
      onSinPermiso();
      return false;
    }
    setOcupado(clave);
    setMsg(null);
    const r = await fn();
    setOcupado(null);
    if (r.error) {
      setMsg({ type: "err", text: r.error });
      return false;
    }
    setMsg({ type: "ok", text: typeof ok === "string" ? ok : ok() });
    await onCambio();
    return true;
  }

  async function aplicar(etiqueta: string) {
    let afectados = 0;
    await ejecutar(
      `sug-${etiqueta}`,
      async () => {
        const r = await aplicarSugerenciaAction(etiqueta);
        afectados = r.afectados;
        return r;
      },
      () => `Etiqueta «${mostrarEtiqueta(etiqueta)}» agregada a ${afectados} contactos.`,
    );
  }

  async function crear() {
    const n = normalizarEtiqueta(propia);
    if (!n) {
      setMsg({ type: "err", text: "Escribí un nombre válido (letras, números y espacios, hasta 30 caracteres)." });
      return;
    }
    const ok = await ejecutar(
      "crear",
      async () => ({ error: (await crearEtiquetaAction(n)).error }),
      `Etiqueta «${mostrarEtiqueta(n)}» creada. Ponésela a tus contactos seleccionándolos y tocando «Etiquetar».`,
    );
    if (ok) setPropia("");
  }

  async function renombrar(de: string) {
    const a = normalizarEtiqueta(nombreNuevo);
    if (!a) {
      setMsg({ type: "err", text: "Escribí un nombre válido." });
      return;
    }
    const ok = await ejecutar("renombrar", () => renombrarEtiquetaAction(de, a), `Etiqueta renombrada a «${mostrarEtiqueta(a)}».`);
    if (ok) setRenombrando(null);
  }

  async function eliminar(nombre: string) {
    if (!window.confirm(`¿Eliminar la etiqueta «${mostrarEtiqueta(nombre)}» de todos los contactos? Los contactos no se borran.`)) return;
    await ejecutar("eliminar", () => eliminarEtiquetaAction(nombre), `Etiqueta «${mostrarEtiqueta(nombre)}» eliminada.`);
  }

  return (
    <div
      onClick={(ev) => ev.target === ev.currentTarget && onClose()}
      className="fixed inset-0 bg-black/[.34] flex items-center justify-center z-[100] px-4"
      style={{ animation: "ys-fade .16s ease both" }}
    >
      <div
        onClick={(ev) => ev.stopPropagation()}
        className="w-full max-w-[760px] max-h-[90vh] bg-white rounded-[18px] px-6 py-5 flex flex-col gap-4 shadow-[var(--shadow-modal)]"
        style={{ animation: "ys-modal .19s cubic-bezier(.4,0,.2,1) both" }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <div className="text-[19px] font-extrabold tracking-[-0.02em] text-ys-text">Etiquetas</div>
            <div className="text-[13px] text-ys-muted font-medium leading-[1.5]">
              Sirven para filtrar y ordenar tus contactos y armar audiencias. Combinalas en la barra de Contactos: <b className="text-ys-text">cliente + producto + nuevo</b> muestra a quienes tienen las tres.
            </div>
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="flex-none w-8 h-8 rounded-lg text-ys-muted text-xl leading-none cursor-pointer hover:bg-ys-el2">
            ×
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-5 pr-1">
          {msg && (
            <div className={`text-[12.5px] font-semibold rounded-[10px] px-3.5 py-2.5 ${msg.type === "ok" ? "bg-ys-green-bg text-ys-green-text" : "bg-ys-red-bg text-ys-red-text"}`}>
              {msg.text}
            </div>
          )}

          <div className="flex flex-col gap-2.5">
            <div className="text-[14px] font-extrabold text-ys-text">
              Elegí etiquetas para filtrar <span className="font-mono text-ys-muted font-bold">({resumen.etiquetas.length})</span>
            </div>
            <div className="text-[12.5px] font-medium text-ys-dim">Tocá una o más: aparecen arriba en la barra y los contactos que las tengan todas quedan seleccionados.</div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={propia}
                onChange={(e) => setPropia(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && crear()}
                maxLength={30}
                placeholder="Crear etiqueta propia (ej: vip, mayorista, evento)"
                className="flex-1 min-w-[220px] max-w-[380px] border border-ys-border rounded-[10px] px-3 py-2 text-[13px] font-medium text-ys-text outline-none focus:border-ys-green"
              />
              <button type="button" disabled={!propia.trim() || ocupado === "crear"} onClick={crear} className={BTN_PRIMARIO}>
                {ocupado === "crear" ? "Creando…" : "Crear etiqueta"}
              </button>
            </div>

            {resumen.etiquetas.length === 0 ? (
              <div className="text-[13px] font-semibold text-ys-muted bg-ys-el2 rounded-[10px] px-3.5 py-3 leading-[1.5]">
                Todavía no hay etiquetas. Creá una o aceptá alguna sugerencia.
              </div>
            ) : (
              <div className="flex flex-col">
                {resumen.etiquetas.map((e) => (
                  <div key={e.nombre} className="flex items-center gap-2 py-2 border-b border-ys-border-softest last:border-b-0 flex-wrap">
                    {renombrando === e.nombre ? (
                      <>
                        <input
                          value={nombreNuevo}
                          onChange={(ev) => setNombreNuevo(ev.target.value)}
                          onKeyDown={(ev) => ev.key === "Enter" && renombrar(e.nombre)}
                          maxLength={30}
                          autoFocus
                          className="min-w-[160px] border border-ys-border rounded-[10px] px-3 py-1.5 text-[13px] font-medium text-ys-text outline-none focus:border-ys-green"
                        />
                        <button type="button" disabled={ocupado === "renombrar"} onClick={() => renombrar(e.nombre)} className={BTN_PRIMARIO}>
                          Guardar
                        </button>
                        <button type="button" onClick={() => setRenombrando(null)} className={BTN_SECUNDARIO}>
                          Cancelar
                        </button>
                      </>
                    ) : (
                      <>
                        <EtiquetaChip nombre={e.nombre} activa={elegidas.includes(e.nombre)} onClick={() => onToggle(e.nombre)} />
                        <span className="text-[12px] font-semibold text-ys-muted">{e.cantidad} contacto{e.cantidad === 1 ? "" : "s"}</span>
                        {esEtiquetaDeSistema(e.nombre) ? (
                          <span className="ml-auto text-[11.5px] font-semibold text-ys-dim">La administra el sistema</span>
                        ) : (
                          <span className="ml-auto flex gap-3">
                            <button
                              type="button"
                              onClick={() => {
                                setRenombrando(e.nombre);
                                setNombreNuevo(e.nombre);
                              }}
                              className="text-[12px] font-bold text-ys-muted hover:text-ys-text cursor-pointer"
                            >
                              Renombrar
                            </button>
                            <button type="button" disabled={ocupado === "eliminar"} onClick={() => eliminar(e.nombre)} className="text-[12px] font-bold text-ys-red-text cursor-pointer disabled:opacity-60">
                              Eliminar
                            </button>
                          </span>
                        )}
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {resumen.sugerencias.length > 0 && (
            <div className="flex flex-col gap-3.5">
              <div className="text-[14px] font-extrabold text-ys-text">
                Etiquetas sugeridas <span className="font-mono text-ys-muted font-bold">({resumen.sugerencias.length})</span>
              </div>
              {(["comportamiento", "texto", "producto", "tema"] as OrigenSugerencia[]).map((origen) => {
                const grupo = resumen.sugerencias.filter((s) => s.origen === origen);
                if (grupo.length === 0) return null;
                return (
                  <div key={origen} className="flex flex-col gap-2">
                    <div className="text-[11px] font-extrabold tracking-[0.06em] uppercase text-ys-dimmer">{ORIGEN_LABEL[origen]}</div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {grupo.map((s) => (
                        <div key={s.etiqueta} className="border border-ys-border rounded-xl p-3 flex flex-col gap-2">
                          <div className="flex items-center justify-between gap-2">
                            <EtiquetaChip nombre={s.etiqueta} />
                            <span className="text-[12px] font-bold text-ys-muted">{s.cantidad} contactos</span>
                          </div>
                          <div className="text-[12.5px] font-medium text-ys-muted leading-[1.45]">{s.descripcion}</div>
                          <div className="flex flex-wrap gap-2">
                            <button type="button" disabled={ocupado !== null} onClick={() => aplicar(s.etiqueta)} className={BTN_PRIMARIO}>
                              {ocupado === `sug-${s.etiqueta}` ? "Aplicando…" : "Aplicar"}
                            </button>
                            <button
                              type="button"
                              disabled={ocupado !== null}
                              onClick={() => (puedeCrear ? onRevisar(s.etiqueta, s.descripcion) : onSinPermiso())}
                              className={BTN_SECUNDARIO}
                            >
                              Revisar
                            </button>
                            <button
                              type="button"
                              disabled={ocupado !== null}
                              onClick={() => ejecutar(`ign-${s.etiqueta}`, () => ignorarSugerenciaAction(s.etiqueta), "Listo, no te la volvemos a sugerir.")}
                              className={BTN_SECUNDARIO}
                            >
                              Ignorar
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="text-[13.5px] font-bold text-white bg-ys-green rounded-[10px] px-5 py-2.5 cursor-pointer transition-all hover:bg-ys-green-hover"
          >
            Listo
          </button>
        </div>
      </div>
    </div>
  );
}
