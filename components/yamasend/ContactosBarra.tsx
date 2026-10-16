"use client";

import { useEffect, useMemo, useState } from "react";
import type { Contact } from "@/lib/types";
import { etiquetarContactosAction, getEtiquetasAction, type EtiquetasResumen } from "@/lib/actions/etiquetas";
import { colorDeEtiqueta, mostrarEtiqueta } from "@/lib/etiquetas/etiquetas";
import EtiquetasModal from "./EtiquetasModal";
import RevisarSugerenciaModal from "./RevisarSugerenciaModal";
import { ActionBar, BtnPrimary, FilterBand, SearchBox, Segmented } from "./SectionChrome";

/**
 * Barra de Contactos, con la misma estructura que el resto de las secciones:
 *
 *  - Barra de acciones: «+ Etiquetas» (administra las etiquetas), buscador y
 *    Todos | Excluidos.
 *  - Franja de filtros: Caliente / Tibio / Frío (siempre están, en tres
 *    azules), las etiquetas elegidas con su ×, el contador y limpiar.
 *
 * Los filtros se combinan: el score elige entre sí (caliente O tibio) y las
 * etiquetas se acumulan (cliente Y producto Y nuevo). Lo que queda filtrado
 * queda seleccionado: esa selección es la que después se vuelve audiencia
 * desde la barra flotante.
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

/** Tres tonos de azul: Caliente es el más oscuro y Frío el más claro. */
const SCORE_CHIP: Record<ScoreFiltro, { label: string; bg: string; text: string }> = {
  caliente: { label: "Caliente", bg: "#1e40af", text: "#ffffff" },
  tibio: { label: "Tibio", bg: "#2563eb", text: "#ffffff" },
  frio: { label: "Frío", bg: "#93c5fd", text: "#0b1b3a" },
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
  vista,
  onVista,
  cantidadExcluidos,
  puedeCrear,
  onSinPermiso,
  onEtiquetarSel,
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
  vista: "todos" | "excluidos";
  onVista: (v: "todos" | "excluidos") => void;
  cantidadExcluidos: number;
  puedeCrear: boolean;
  onSinPermiso: () => void;
  /** Abre el modal para ponerles una etiqueta a los contactos seleccionados. */
  onEtiquetarSel: () => void;
  /** Cambiaron etiquetas: el padre vuelve a leer los contactos. */
  onCambio: () => void;
  onNotificar: (texto: string, tipo?: "error") => void;
}) {
  const [resumen, setResumen] = useState<EtiquetasResumen | null>(null);
  const [modalAbierto, setModalAbierto] = useState(false);
  const [revisando, setRevisando] = useState<{ etiqueta: string; descripcion: string } | null>(null);

  async function recargar() {
    try {
      setResumen(await getEtiquetasAction());
    } catch {
      setResumen({ error: "No se pudieron cargar las etiquetas. Probá de nuevo." } as EtiquetasResumen);
    }
  }

  // Si todavía no cargó (o falló), el clic vuelve a pedirlas en vez de no hacer nada.
  function abrirEtiquetas() {
    setModalAbierto(true);
    if (!resumen || resumen.error) void recargar();
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
  const contador = hayFiltros || seleccionados > 0 ? seleccionados : totalContactos;

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
      <ActionBar>
        <BtnPrimary onClick={abrirEtiquetas} title="Crear, renombrar y revisar las etiquetas sugeridas">
          Etiquetas
        </BtnPrimary>
        <SearchBox value={busqueda} onChange={onBusqueda} placeholder="Buscar contacto..." />
        <Segmented<"todos" | "excluidos">
          value={vista}
          onChange={onVista}
          options={[
            { key: "todos", label: "Todos" },
            { key: "excluidos", label: `Excluidos${cantidadExcluidos > 0 ? ` (${cantidadExcluidos})` : ""}` },
          ]}
        />
      </ActionBar>

      {vista === "todos" && (
        <FilterBand>
          {SCORES.map((k) => {
            const c = SCORE_CHIP[k];
            const on = scoreFilt.has(k);
            return (
              <button
                key={k}
                type="button"
                onClick={() => onToggleScore(k)}
                aria-pressed={on}
                className={`inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full text-xs font-extrabold cursor-pointer transition-all ${
                  on ? "" : "opacity-60 hover:opacity-100"
                }`}
                style={{ background: c.bg, color: c.text }}
              >
                {c.label}
                <span className="font-mono text-[11px] font-medium opacity-85">{conteoScore[k]}</span>
                {on && <span className="text-[13px] leading-none">×</span>}
              </button>
            );
          })}

          {tagFilt.length > 0 && <span className="w-px h-5 bg-ys-border mx-1" aria-hidden="true" />}

          {tagFilt.map((t) => {
            const c = colorDeEtiqueta(t);
            return (
              <span
                key={t}
                className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full border text-xs font-bold"
                style={{ background: c.bg, color: c.text, borderColor: c.borde }}
              >
                {mostrarEtiqueta(t)}
                <button
                  type="button"
                  onClick={() => onToggleTag(t)}
                  aria-label={`Sacar ${mostrarEtiqueta(t)} del filtro`}
                  className="text-[13px] leading-none cursor-pointer opacity-70 hover:opacity-100"
                >
                  ×
                </button>
              </span>
            );
          })}

          <span className="flex-1" />
          <span className="text-[13px] font-bold text-ys-muted mr-1.5">
            {contador} contacto{contador === 1 ? "" : "s"}
          </span>
          {(tagFilt.length > 0 || scoreFilt.size > 0) && (
            <button
              type="button"
              onClick={onLimpiar}
              aria-label="Limpiar filtros"
              title="Limpiar filtros"
              className="w-9 h-9 flex items-center justify-center border border-ys-border rounded-[10px] text-ys-muted cursor-pointer transition-colors hover:text-ys-text hover:bg-[#f7f9f8]"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M3 4.5h10M6.2 4.5V3h3.6v1.5M4.5 4.5l.6 8h5.8l.6-8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}
        </FilterBand>
      )}

      {modalAbierto && resumen && !resumen.error && (
        <EtiquetasModal
          resumen={resumen}
          elegidas={tagFilt}
          onToggle={onToggleTag}
          puedeCrear={puedeCrear}
          onSinPermiso={onSinPermiso}
          seleccionados={seleccionados}
          onEtiquetarSeleccion={() => {
            setModalAbierto(false);
            onEtiquetarSel();
          }}
          onRevisar={(etiqueta, descripcion) => setRevisando({ etiqueta, descripcion })}
          onCambio={async () => {
            await recargar();
            onCambio();
          }}
          onClose={() => setModalAbierto(false)}
        />
      )}
      {modalAbierto && !resumen && (
        <div className="fixed bottom-6 right-6 z-[120] bg-ys-card border border-ys-border text-ys-muted text-[13px] font-semibold rounded-xl px-4 py-3 shadow-lg">
          Cargando etiquetas…
        </div>
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
