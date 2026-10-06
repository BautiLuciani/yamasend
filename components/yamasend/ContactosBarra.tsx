"use client";

import { useEffect, useMemo, useState } from "react";
import type { Contact } from "@/lib/types";
import { etiquetarContactosAction, getEtiquetasAction, type EtiquetasResumen } from "@/lib/actions/etiquetas";
import { contarEtiquetas, mostrarEtiqueta } from "@/lib/etiquetas/etiquetas";
import EtiquetaChip from "./EtiquetaChip";
import EtiquetasModal from "./EtiquetasModal";
import RevisarSugerenciaModal from "./RevisarSugerenciaModal";

/**
 * La única barra de Contactos: contador + filtros (score y etiquetas, que se
 * suman) + buscador + administrar etiquetas + Crear audiencia.
 *
 * Los filtros se combinan: el score elige entre sí (caliente O tibio) y las
 * etiquetas se acumulan (cliente Y producto Y nuevo).
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

const SCORES: { key: ScoreFiltro; label: string; cls: string; clsOn: string }[] = [
  { key: "caliente", label: "Caliente", cls: "text-ys-green-text bg-ys-green-bg border-ys-green-bg", clsOn: "ring-2 ring-ys-green" },
  { key: "tibio", label: "Tibio", cls: "text-ys-warn-text bg-ys-warn-bg border-ys-warn-bg", clsOn: "ring-2 ring-[#c07a12]" },
  { key: "frio", label: "Frío", cls: "text-[#5d6560] bg-ys-el2 border-ys-el2", clsOn: "ring-2 ring-[#8a908c]" },
];

const MAX_CHIPS = 10;

export default function ContactosBarra({
  contacts,
  visibles,
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
  onCambio,
  onNotificar,
}: {
  contacts: Contact[];
  /** Cantidad que pasa los filtros. */
  visibles: number;
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
  /** Cambiaron etiquetas: el padre vuelve a leer los contactos. */
  onCambio: () => void;
  onNotificar: (texto: string, tipo?: "error") => void;
}) {
  const [resumen, setResumen] = useState<EtiquetasResumen | null>(null);
  const [modalAbierto, setModalAbierto] = useState(false);
  const [revisando, setRevisando] = useState<{ etiqueta: string; descripcion: string } | null>(null);
  const [verTodas, setVerTodas] = useState(false);

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

  const enUso = useMemo(() => contarEtiquetas(contacts.map((c) => ({ etiquetas: c.etiquetas ?? [] }))), [contacts]);
  const conteoScore = useMemo(() => {
    const m = { caliente: 0, tibio: 0, frio: 0 };
    for (const c of contacts) {
      if (c.bloqueado) continue;
      if (c.score === "caliente" || c.score === "tibio" || c.score === "frio") m[c.score]++;
    }
    return m;
  }, [contacts]);

  const total = contacts.filter((c) => !c.bloqueado).length;
  const hayFiltros = scoreFilt.size > 0 || tagFilt.length > 0 || busqueda.trim() !== "";
  const chips = verTodas ? enUso : enUso.slice(0, MAX_CHIPS);
  // Las etiquetas elegidas siempre se ven, aunque queden fuera de las primeras.
  const elegidasOcultas = tagFilt.filter((t) => !chips.some((c) => c.nombre === t));
  const sugeridas = resumen?.sugerencias.length ?? 0;

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
      <div className="mx-4 md:mx-[38px] mt-4 md:mt-6 mb-4 bg-white border border-ys-border rounded-2xl px-4 md:px-5 py-4 flex flex-col gap-3.5">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-baseline gap-1.5 mr-1">
            <span className="font-mono text-[22px] font-medium tracking-[-0.03em] text-ys-text">{visibles}</span>
            <span className="text-[13px] font-semibold text-ys-muted">
              {hayFiltros && visibles !== total ? `de ${total} contactos` : visibles === 1 ? "contacto" : "contactos"}
            </span>
          </div>

          <div className="flex items-center gap-2.5 bg-ys-bg border border-ys-border rounded-[10px] px-3.5 py-2 flex-1 min-w-[180px] md:max-w-[320px] md:ml-auto transition-colors focus-within:border-ys-green-border">
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" className="flex-none">
              <circle cx="7" cy="7" r="4.5" stroke="#9aa19c" strokeWidth="1.5" />
              <path d="m10.5 10.5 3 3" stroke="#9aa19c" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <input
              type="text"
              value={busqueda}
              onChange={(e) => onBusqueda(e.target.value)}
              placeholder="Buscar contacto..."
              className="flex-1 min-w-0 bg-transparent border-none outline-none text-[13.5px] text-ys-text placeholder:text-[#9aa19c] placeholder:font-medium"
            />
          </div>

          <button
            type="button"
            onClick={() => setModalAbierto(true)}
            className="text-[13px] font-bold text-[#3f4844] border border-ys-border rounded-[10px] px-3.5 py-2 cursor-pointer transition-colors hover:bg-[#f7f9f8] inline-flex items-center gap-2"
          >
            Etiquetas
            {sugeridas > 0 && (
              <span className="font-mono text-[11px] font-bold text-white bg-ys-green rounded-full px-1.5 py-[1px]">{sugeridas}</span>
            )}
          </button>

          <button
            type="button"
            onClick={puedeCrear ? onCrearAudiencia : onSinPermiso}
            disabled={visibles === 0}
            className={`text-[13px] font-extrabold rounded-[10px] px-4 py-2 transition-all disabled:opacity-60 disabled:cursor-default ${
              puedeCrear ? "text-white bg-ys-green cursor-pointer hover:bg-ys-green-hover hover:-translate-y-px" : "bg-ys-el2 text-ys-faint cursor-not-allowed"
            }`}
          >
            Crear audiencia
          </button>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] font-extrabold tracking-[0.06em] uppercase text-ys-dimmer mr-1">Score</span>
          {SCORES.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => onToggleScore(s.key)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-[3px] text-[12px] font-bold cursor-pointer ring-offset-1 ${s.cls} ${scoreFilt.has(s.key) ? s.clsOn : ""}`}
            >
              {s.label}
              <span className="font-mono opacity-70">{conteoScore[s.key]}</span>
            </button>
          ))}
        </div>

        {enUso.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] font-extrabold tracking-[0.06em] uppercase text-ys-dimmer mr-1">Etiquetas</span>
            {chips.map((e) => (
              <EtiquetaChip key={e.nombre} nombre={e.nombre} cantidad={e.cantidad} activa={tagFilt.includes(e.nombre)} onClick={() => onToggleTag(e.nombre)} />
            ))}
            {elegidasOcultas.map((t) => (
              <EtiquetaChip key={t} nombre={t} activa onClick={() => onToggleTag(t)} />
            ))}
            {enUso.length > MAX_CHIPS && (
              <button type="button" onClick={() => setVerTodas((v) => !v)} className="text-[12px] font-bold text-ys-muted hover:text-ys-text cursor-pointer">
                {verTodas ? "Ver menos" : `Ver las ${enUso.length}`}
              </button>
            )}
          </div>
        )}

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

        {hayFiltros && (
          <div>
            <button type="button" onClick={onLimpiar} className="text-[12px] font-bold text-ys-muted hover:text-ys-text cursor-pointer">
              Limpiar filtros
            </button>
          </div>
        )}
      </div>

      {modalAbierto && resumen && !resumen.error && (
        <EtiquetasModal
          resumen={resumen}
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
