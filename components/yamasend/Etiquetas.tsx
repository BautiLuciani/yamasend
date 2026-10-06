"use client";

import { useEffect, useState } from "react";
import type { ContactList } from "@/lib/types";
import {
  aplicarSugerenciaAction,
  buscarPorEtiquetasAction,
  crearAudienciaPorEtiquetasAction,
  eliminarEtiquetaAction,
  etiquetarPorFiltroAction,
  getEtiquetasAction,
  ignorarSugerenciaAction,
  renombrarEtiquetaAction,
  type BusquedaEtiquetas,
  type EtiquetasResumen,
} from "@/lib/actions/etiquetas";
import { esEtiquetaDeSistema, mostrarEtiqueta, normalizarEtiqueta } from "@/lib/etiquetas/etiquetas";
import EtiquetaChip from "./EtiquetaChip";

/**
 * Submenú "Etiquetas" de Audiencias.
 *
 * Las etiquetas se acumulan: elegir "cliente" + "eukanuba" + "nuevo" muestra a
 * los contactos que tienen LAS TRES, y de ahí se arma una audiencia. "Cliente"
 * la pone sola el sistema a quien recibió una confirmación de compra; el resto
 * se pone a mano o aceptando las sugerencias.
 */

interface Props {
  puedeCrear: boolean;
  onSinPermiso: () => void;
  /** La audiencia ya está armada: el padre la suma a las listas. */
  onAudienciaCreada: (lista: ContactList, cantidad: number) => void;
  /** Cambiaron etiquetas: el padre refresca los contactos. */
  onCambio: () => void;
}

const BTN_PRIMARIO =
  "text-[12.5px] font-bold text-white bg-ys-green rounded-[10px] px-3.5 py-2 cursor-pointer transition-all hover:bg-ys-green-hover disabled:opacity-60 disabled:cursor-default";
const BTN_SECUNDARIO =
  "text-[12.5px] font-bold text-[#3f4844] border border-ys-border rounded-[10px] px-3.5 py-2 cursor-pointer transition-colors hover:bg-[#f7f9f8] disabled:opacity-60 disabled:cursor-default";

export default function Etiquetas({ puedeCrear, onSinPermiso, onAudienciaCreada, onCambio }: Props) {
  const [resumen, setResumen] = useState<EtiquetasResumen | null>(null);
  const [filtro, setFiltro] = useState<string[]>([]);
  const [busqueda, setBusqueda] = useState<BusquedaEtiquetas | null>(null);
  const [nueva, setNueva] = useState("");
  const [renombrando, setRenombrando] = useState<string | null>(null);
  const [nombreNuevo, setNombreNuevo] = useState("");
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  async function recargar() {
    setResumen(await getEtiquetasAction());
  }

  useEffect(() => {
    let cancelado = false;
    (async () => {
      const r = await getEtiquetasAction();
      if (!cancelado) setResumen(r);
    })();
    return () => {
      cancelado = true;
    };
  }, []);

  // Cada vez que cambia el filtro (o los datos) se busca a quién corresponde.
  useEffect(() => {
    if (filtro.length === 0) return;
    let cancelado = false;
    (async () => {
      const r = await buscarPorEtiquetasAction(filtro);
      if (!cancelado) setBusqueda(r);
    })();
    return () => {
      cancelado = true;
    };
  }, [filtro, resumen]);

  function alternar(nombre: string) {
    setMsg(null);
    setRenombrando(null);
    setFiltro((f) => (f.includes(nombre) ? f.filter((x) => x !== nombre) : [...f, nombre]));
  }

  /** Corre una acción que escribe: pide permiso, muestra el resultado y refresca. */
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
    await recargar();
    onCambio();
    return true;
  }

  async function aplicarSugerencia(etiqueta: string) {
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

  async function etiquetarResultado() {
    const n = normalizarEtiqueta(nueva);
    if (!n) {
      setMsg({ type: "err", text: "Escribí una etiqueta válida (letras, números y espacios, hasta 30 caracteres)." });
      return;
    }
    let afectados = 0;
    const ok = await ejecutar(
      "etiquetar",
      async () => {
        const r = await etiquetarPorFiltroAction(filtro, [n]);
        afectados = r.afectados;
        return r;
      },
      () => `Etiqueta «${mostrarEtiqueta(n)}» agregada a ${afectados} contactos.`,
    );
    if (ok) setNueva("");
  }

  async function crearAudiencia() {
    if (!puedeCrear) {
      onSinPermiso();
      return;
    }
    setOcupado("audiencia");
    setMsg(null);
    const r = await crearAudienciaPorEtiquetasAction(filtro);
    setOcupado(null);
    if (r.error || !r.lista) {
      setMsg({ type: "err", text: r.error ?? "No se pudo armar la audiencia." });
      return;
    }
    setMsg({ type: "ok", text: `Audiencia «${r.lista.nombre}» lista con ${r.cantidad} contactos.` });
    onAudienciaCreada(r.lista, r.cantidad);
  }

  async function renombrar(de: string) {
    const a = normalizarEtiqueta(nombreNuevo);
    if (!a) {
      setMsg({ type: "err", text: "Escribí un nombre válido." });
      return;
    }
    const ok = await ejecutar("renombrar", () => renombrarEtiquetaAction(de, a), `Etiqueta renombrada a «${mostrarEtiqueta(a)}».`);
    if (ok) {
      setFiltro((f) => f.map((x) => (x === de ? a : x)));
      setRenombrando(null);
    }
  }

  async function eliminar(nombre: string) {
    if (!window.confirm(`¿Eliminar la etiqueta «${mostrarEtiqueta(nombre)}» de todos los contactos? Los contactos no se borran.`)) return;
    const ok = await ejecutar("eliminar", () => eliminarEtiquetaAction(nombre), `Etiqueta «${mostrarEtiqueta(nombre)}» eliminada.`);
    if (ok) setFiltro((f) => f.filter((x) => x !== nombre));
  }

  if (resumen === null) {
    return <div className="text-[13px] font-semibold text-ys-muted py-4">Cargando etiquetas…</div>;
  }
  if (resumen.error) {
    return <div className="text-[13px] font-semibold text-ys-red-text py-4">{resumen.error}</div>;
  }

  const unica = filtro.length === 1 && !esEtiquetaDeSistema(filtro[0]) ? filtro[0] : null;

  return (
    <div className="flex flex-col gap-5">
      <div className="text-[13.5px] font-medium text-ys-muted leading-[1.55] max-w-[760px]">
        Etiquetá a tus contactos y combinalas para armar audiencias: <b className="text-ys-text">cliente + eukanuba + nuevo</b>{" "}
        muestra a quienes tienen las tres. «Cliente» se pone sola a quien recibió un «gracias por tu compra» o una
        confirmación de pago.
      </div>

      {resumen.clientesNuevos > 0 && (
        <div className="text-[12.5px] font-semibold text-ys-green-text bg-ys-green-bg rounded-[10px] px-3.5 py-2.5">
          Actualizamos tus clientes: {resumen.clientesNuevos} contactos quedaron etiquetados como «Cliente».
        </div>
      )}
      {msg && (
        <div
          className={`text-[12.5px] font-semibold rounded-[10px] px-3.5 py-2.5 ${
            msg.type === "ok" ? "bg-ys-green-bg text-ys-green-text" : "bg-ys-red-bg text-ys-red-text"
          }`}
        >
          {msg.text}
        </div>
      )}

      {/* Sugeridas */}
      {resumen.sugerencias.length > 0 && (
        <div className="flex flex-col gap-2.5">
          <div className="text-[14px] font-extrabold text-ys-text">Etiquetas sugeridas</div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5">
            {resumen.sugerencias.map((s) => (
              <div key={s.etiqueta} className="bg-white border border-ys-border rounded-xl p-3.5 flex flex-col gap-2.5">
                <div className="flex items-center justify-between gap-2">
                  <EtiquetaChip nombre={s.etiqueta} />
                  <span className="text-[12px] font-bold text-ys-muted">{s.cantidad} contactos</span>
                </div>
                <div className="text-[12.5px] font-medium text-ys-muted leading-[1.45]">{s.descripcion}</div>
                <div className="flex gap-2">
                  <button type="button" disabled={ocupado === `sug-${s.etiqueta}`} onClick={() => aplicarSugerencia(s.etiqueta)} className={BTN_PRIMARIO}>
                    {ocupado === `sug-${s.etiqueta}` ? "Aplicando…" : "Aplicar"}
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
      )}

      {/* Etiquetas en uso */}
      <div className="flex flex-col gap-2.5">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="text-[14px] font-extrabold text-ys-text">
            Tus etiquetas <span className="font-mono text-ys-muted font-bold">({resumen.etiquetas.length})</span>
          </div>
          {filtro.length > 0 && (
            <button type="button" onClick={() => setFiltro([])} className="text-[12px] font-bold text-ys-muted hover:text-ys-text cursor-pointer">
              Limpiar selección
            </button>
          )}
        </div>
        {resumen.etiquetas.length === 0 ? (
          <div className="text-[13px] font-semibold text-ys-muted bg-ys-el2 rounded-[10px] px-3.5 py-3 leading-[1.5]">
            Todavía no hay etiquetas. Podés ponerlas desde el detalle de un contacto o aceptar alguna sugerencia.
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {resumen.etiquetas.map((e) => (
              <EtiquetaChip key={e.nombre} nombre={e.nombre} cantidad={e.cantidad} activa={filtro.includes(e.nombre)} onClick={() => alternar(e.nombre)} />
            ))}
          </div>
        )}
        {resumen.etiquetas.length > 0 && filtro.length === 0 && (
          <div className="text-[12px] font-medium text-ys-dim">Tocá una o más etiquetas para ver quiénes las tienen todas.</div>
        )}
      </div>

      {/* Resultado del filtro */}
      {filtro.length > 0 && (
        <div className="bg-white border border-ys-border rounded-xl p-4 flex flex-col gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            {filtro.map((f, i) => (
              <span key={f} className="inline-flex items-center gap-2">
                {i > 0 && <span className="text-ys-dim font-bold">+</span>}
                <EtiquetaChip nombre={f} />
              </span>
            ))}
          </div>

          {busqueda === null ? (
            <div className="text-[13px] font-semibold text-ys-muted">Buscando…</div>
          ) : (
            <>
              <div className="text-[20px] font-extrabold tracking-[-0.02em] text-ys-text leading-none">
                {busqueda.cantidad} <span className="text-[13px] font-bold text-ys-muted">contacto{busqueda.cantidad === 1 ? "" : "s"} con todas</span>
              </div>
              {busqueda.muestra.length > 0 && (
                <div className="text-[12.5px] font-medium text-ys-dim leading-[1.5]">
                  {busqueda.muestra.map((m) => m.nombre || "Sin nombre").join(", ")}
                  {busqueda.cantidad > busqueda.muestra.length ? ` y ${busqueda.cantidad - busqueda.muestra.length} más…` : ""}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <button type="button" disabled={busqueda.cantidad === 0 || ocupado === "audiencia"} onClick={crearAudiencia} className={BTN_PRIMARIO}>
                  {ocupado === "audiencia" ? "Armando…" : "Crear audiencia"}
                </button>
              </div>

              {busqueda.cantidad > 0 && (
                <div className="flex flex-wrap items-center gap-2 border-t border-ys-border-softest pt-3">
                  <input
                    value={nueva}
                    onChange={(e) => setNueva(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && etiquetarResultado()}
                    maxLength={30}
                    placeholder="Agregar otra etiqueta a estos contactos"
                    className="flex-1 min-w-[200px] border border-ys-border rounded-[10px] px-3 py-2 text-[13px] font-medium text-ys-text outline-none focus:border-ys-green"
                  />
                  <button type="button" disabled={!nueva.trim() || ocupado === "etiquetar"} onClick={etiquetarResultado} className={BTN_SECUNDARIO}>
                    {ocupado === "etiquetar" ? "Etiquetando…" : `Etiquetar ${busqueda.cantidad}`}
                  </button>
                </div>
              )}
            </>
          )}

          {unica && (
            <div className="flex flex-wrap items-center gap-2 border-t border-ys-border-softest pt-3">
              {renombrando === unica ? (
                <>
                  <input
                    value={nombreNuevo}
                    onChange={(e) => setNombreNuevo(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && renombrar(unica)}
                    maxLength={30}
                    placeholder="Nuevo nombre"
                    className="min-w-[180px] border border-ys-border rounded-[10px] px-3 py-2 text-[13px] font-medium text-ys-text outline-none focus:border-ys-green"
                  />
                  <button type="button" disabled={ocupado === "renombrar"} onClick={() => renombrar(unica)} className={BTN_PRIMARIO}>
                    Guardar
                  </button>
                  <button type="button" onClick={() => setRenombrando(null)} className={BTN_SECUNDARIO}>
                    Cancelar
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setRenombrando(unica);
                      setNombreNuevo(unica);
                    }}
                    className={BTN_SECUNDARIO}
                  >
                    Renombrar etiqueta
                  </button>
                  <button type="button" disabled={ocupado === "eliminar"} onClick={() => eliminar(unica)} className="text-[12.5px] font-bold text-ys-red-text border border-ys-red-border rounded-[10px] px-3.5 py-2 cursor-pointer hover:bg-ys-red-bg disabled:opacity-60">
                    Eliminar etiqueta
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
