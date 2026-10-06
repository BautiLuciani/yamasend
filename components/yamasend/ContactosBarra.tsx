"use client";

import { useEffect, useMemo, useState } from "react";
import type { Contact } from "@/lib/types";
import { etiquetarContactosAction, getEtiquetasAction, type EtiquetasResumen } from "@/lib/actions/etiquetas";
import { colorDeEtiqueta, mostrarEtiqueta } from "@/lib/etiquetas/etiquetas";
import { SCORE_PILL } from "./ContactsTable";
import EtiquetasModal from "./EtiquetasModal";
import RevisarSugerenciaModal from "./RevisarSugerenciaModal";

/**
 * La única barra de Contactos.
 *
 *  - Arriba: «+ Etiquetas» (abre la sección de etiquetas), Caliente / Tibio /
 *    Frío (están siempre) y las etiquetas elegidas, cada una con su ×.
 *  - Abajo: cuántos contactos hay seleccionados (los que van a ser la
 *    audiencia), el buscador y «Crear audiencia».
 *
 * Los filtros se combinan: el score elige entre sí (caliente O tibio) y las
 * etiquetas se acumulan (cliente Y producto Y nuevo). Lo que queda filtrado
 * queda seleccionado.
 */

export type ScoreFiltro = "caliente" | "tibio" | "frio";
export type OrdenKey = "nombre" | "tel" | "etiquetas" | "score" | "mensajes" | "ultimo";

export const ORDEN_LABEL: Record<OrdenKey, string> = {
  nombre: "Nombre",
  tel: "Teléfono",
  etiquetas: "Etiquetas",
  score: "Score",
  mensajes: "Mensajes",
  ultimo: "Último mensaje",
};

const SCORES: ScoreFiltro[] = ["caliente", "tibio", "frio"];

export default function ContactosBarra({
  contacts,
  seleccionados,
  totalContactos,
  scoreFilt,
  onToggleScore,
  tagFilt,
  onToggleTag,
  onLimpiar,
  busqueda,
  onBusqueda,
  ordenKey,
  ordenDir,
  onOrden,
  puedeCrear,
  onSinPermiso,
  onCrearAudiencia,
  onEtiquetarSel,
  onAgregarAExistente,
  onCambio,
  onNotificar,
}: {
  contacts: Contact[];
  /** Contactos seleccionados: los que van a ser la audiencia. */
  seleccionados: number;
  totalContactos: number;
  scoreFilt: Set<string>;
  onToggleScore: (k: ScoreFiltro) => void;
  tagFilt: string[];
  onToggleTag: (t: string) => void;
  onLimpiar: () => void;
  busqueda: string;
  onBusqueda: (v: string) => void;
  ordenKey: OrdenKey | null;
  ordenDir: "asc" | "desc";
  onOrden: (k: OrdenKey) => void;
  puedeCrear: boolean;
  onSinPermiso: () => void;
  onCrearAudiencia: () => void;
  onEtiquetarSel: () => void;
  onAgregarAExistente: () => void;
  /** Cambiaron etiquetas: el padre vuelve a leer los contactos. */
  onCambio: () => void;
  onNotificar: (texto: string, tipo?: "error") => void;
}) {
  const [resumen, setResumen] = useState<EtiquetasResumen | null>(null);
  const [modalAbierto, setModalAbierto] = useState(false);
  const [revisando, setRevisando] = useState<{ etiqueta: string; descripcion: string } | null>(null);

  async function recargar() {
    setResumen(await getEtiquetasAction());
  }

  // Al entrar a Contactos se sincronizan los clientes (los que compraron pero
  // nunca escribieron) y se calculan las sugerencias.
  useEffect(() => {
    let cancelado = false;
    (async () => {
      const r = await getEtiquetasAction();
      if (cancelado) return;
      setResumen(r);
      if (r.clientesNuevos > 0) onCambio();
    })();
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al montar
  }, []);

  const conteoScore = useMemo(() => {
    const m = { caliente: 0, tibio: 0, frio: 0 };
    for (const c of contacts) {
      if (c.bloqueado) continue;
      if (c.score === "caliente" || c.score === "tibio" || c.score === "frio") m[c.score]++;
    }
    return m;
  }, [contacts]);

  const hayFiltros = scoreFilt.size > 0 || tagFilt.length > 0 || busqueda.trim() !== "";
  const sugeridas = resumen?.sugerencias.length ?? 0;
  const etiquetaContador = hayFiltros ? "encontrado" : seleccionados > 0 ? "seleccionado" : "";

  async function aplicarRevision(etiqueta: string, ids: string[]): Promise<string | null> {
    const r = await etiquetarContactosAction(ids, [etiqueta]);
    if (r.error) return r.error;
    onNotificar(`Etiqueta «${mostrarEtiqueta(etiqueta)}» agregada a ${r.afectados} contacto${r.afectados === 1 ? "" : "s"}.`);
    setRevisando(null);
    await recargar();
    onCambio();
    return null;
  }

  return (
    <>
      <div className="mx-4 md:mx-[38px] mt-4 md:mt-6 mb-4 bg-white border border-ys-border rounded-2xl px-4 md:px-5 py-4 flex flex-col gap-4">
        {/* Fila 1: etiquetas y score */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            type="button"
            onClick={() => setModalAbierto(true)}
            className="inline-flex items-center gap-2 text-[13.5px] font-bold text-white bg-ys-green rounded-[10px] px-4 py-2 cursor-pointer transition-all hover:bg-ys-green-hover"
          >
            <span className="text-[17px] leading-none">+</span>
            Etiquetas
            {sugeridas > 0 && (
              <span className="font-mono text-[11px] font-bold text-ys-green-text bg-white rounded-full px-1.5 py-[1px]">{sugeridas}</span>
            )}
          </button>

          {SCORES.map((k) => {
            const c = SCORE_PILL[k];
            const on = scoreFilt.has(k);
            return (
              <button
                key={k}
                type="button"
                onClick={() => onToggleScore(k)}
                className="inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-[13px] font-bold cursor-pointer transition-colors"
                style={{
                  color: c.solido,
                  borderColor: c.solido,
                  background: on ? c.suave : "#fff",
                  boxShadow: on ? `0 0 0 2px ${c.suave}` : undefined,
                }}
              >
                {c.label}
                <span className="font-mono text-[11px] opacity-70">{conteoScore[k]}</span>
                {on && <span className="text-[14px] leading-none">×</span>}
              </button>
            );
          })}

          {tagFilt.map((t) => {
            const c = colorDeEtiqueta(t);
            return (
              <span
                key={t}
                className="inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-[13px] font-bold"
                style={{ background: c.bg, color: c.text, borderColor: c.borde }}
              >
                {mostrarEtiqueta(t)}
                <button
                  type="button"
                  onClick={() => onToggleTag(t)}
                  aria-label={`Sacar ${t} del filtro`}
                  className="text-[14px] leading-none cursor-pointer opacity-70 hover:opacity-100"
                >
                  ×
                </button>
              </span>
            );
          })}

          {(tagFilt.length > 0 || scoreFilt.size > 0) && (
            <button
              type="button"
              onClick={onLimpiar}
              className="ml-auto inline-flex items-center gap-1.5 text-[13px] font-semibold text-ys-muted hover:text-ys-text cursor-pointer"
            >
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                <path d="M3 4.5h10M6.2 4.5V3h3.6v1.5M4.5 4.5l.6 8h5.8l.6-8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Limpiar etiquetas
            </button>
          )}
        </div>

        <div className="border-t border-ys-border-softest" />

        {/* Fila 2: contador de la selección, buscador y Crear audiencia */}
        <div className="flex items-center gap-3 md:gap-5 flex-wrap">
          <div className="flex flex-col gap-0.5 md:min-w-[190px]">
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-[26px] font-medium tracking-[-0.03em] text-ys-green-text leading-none">
                {hayFiltros || seleccionados > 0 ? seleccionados : totalContactos}
              </span>
              <span className="text-[14px] font-medium text-ys-muted">
                contacto{(hayFiltros || seleccionados > 0 ? seleccionados : totalContactos) === 1 ? "" : "s"} {etiquetaContador}
                {etiquetaContador && (seleccionados === 1 ? "" : "s")}
              </span>
            </div>
            {seleccionados > 0 && (
              <div className="flex items-center gap-3 text-[12px] font-bold text-ys-muted">
                <button type="button" onClick={onEtiquetarSel} className="cursor-pointer hover:text-ys-text">
                  Etiquetar
                </button>
                <button type="button" onClick={onAgregarAExistente} className="cursor-pointer hover:text-ys-text">
                  Agregar a una audiencia
                </button>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2.5 bg-white border border-ys-border rounded-[10px] px-3.5 py-2.5 flex-1 min-w-[200px] transition-colors focus-within:border-ys-green-border">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="flex-none">
              <circle cx="7" cy="7" r="4.5" stroke="#3f4844" strokeWidth="1.6" />
              <path d="m10.5 10.5 3 3" stroke="#3f4844" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
            <input
              type="text"
              value={busqueda}
              onChange={(e) => onBusqueda(e.target.value)}
              placeholder="Buscar por nombre o teléfono"
              className="flex-1 min-w-0 bg-transparent border-none outline-none text-[14px] text-ys-text placeholder:text-[#9aa19c] placeholder:font-medium"
            />
          </div>

          <button
            type="button"
            onClick={puedeCrear ? onCrearAudiencia : onSinPermiso}
            disabled={seleccionados === 0}
            className={`inline-flex items-center gap-2 text-[14px] font-extrabold rounded-[10px] px-5 py-2.5 transition-all disabled:opacity-50 disabled:cursor-default ${
              puedeCrear ? "text-white bg-ys-green cursor-pointer hover:bg-ys-green-hover hover:-translate-y-px" : "bg-ys-el2 text-ys-faint cursor-not-allowed"
            }`}
          >
            <span className="text-[17px] leading-none">+</span>
            Crear audiencia
          </button>
        </div>

        <div className="flex items-center gap-3 flex-wrap md:hidden">
          <span className="text-[11px] font-extrabold tracking-[0.06em] uppercase text-ys-dimmer">Ordenar</span>
          <select
            value={ordenKey ?? ""}
            onChange={(e) => e.target.value && onOrden(e.target.value as OrdenKey)}
            className="border border-ys-border rounded-[10px] px-2.5 py-1.5 text-[13px] font-semibold text-ys-text bg-white"
          >
            <option value="">Sin orden</option>
            {(Object.keys(ORDEN_LABEL) as OrdenKey[]).map((k) => (
              <option key={k} value={k}>
                {ORDEN_LABEL[k]}
              </option>
            ))}
          </select>
          {ordenKey && (
            <button type="button" onClick={() => onOrden(ordenKey)} className="text-[13px] font-bold text-ys-muted cursor-pointer">
              {ordenDir === "asc" ? "↑ Ascendente" : "↓ Descendente"}
            </button>
          )}
        </div>
      </div>

      {modalAbierto && resumen && !resumen.error && (
        <EtiquetasModal
          resumen={resumen}
          elegidas={tagFilt}
          onToggle={onToggleTag}
          puedeCrear={puedeCrear}
          onSinPermiso={onSinPermiso}
          onRevisar={(etiqueta, descripcion) => setRevisando({ etiqueta, descripcion })}
          onCambio={async () => {
            await recargar();
            onCambio();
          }}
          onClose={() => setModalAbierto(false)}
        />
      )}
      {modalAbierto && resumen?.error && (
        <div className="fixed bottom-6 right-6 z-[120] bg-ys-red-bg text-ys-red-text text-[13px] font-semibold rounded-xl px-4 py-3" onClick={() => setModalAbierto(false)}>
          {resumen.error}
        </div>
      )}
      {revisando && (
        <RevisarSugerenciaModal
          etiqueta={revisando.etiqueta}
          descripcion={revisando.descripcion}
          contacts={contacts}
          onAplicar={(ids) => aplicarRevision(revisando.etiqueta, ids)}
          onClose={() => setRevisando(null)}
        />
      )}
    </>
  );
}
