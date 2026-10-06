"use client";

import { useEffect, useMemo, useState } from "react";
import type { Contact } from "@/lib/types";
import { contactosDeSugerenciaAction } from "@/lib/actions/etiquetas";
import { mostrarEtiqueta } from "@/lib/etiquetas/etiquetas";
import EtiquetaChip from "./EtiquetaChip";

/**
 * "Revisar" una etiqueta sugerida: lista a quiénes se les pondría. Se puede
 * destildar a alguien o sumar contactos que la sugerencia no incluía, y recién
 * después aplicar.
 */
export default function RevisarSugerenciaModal({
  etiqueta,
  descripcion,
  contacts,
  onAplicar,
  onClose,
}: {
  etiqueta: string;
  descripcion: string;
  contacts: Contact[];
  /** Devuelve un mensaje de error, o null si salió bien. */
  onAplicar: (ids: string[]) => Promise<string | null>;
  onClose: () => void;
}) {
  const [cargando, setCargando] = useState(true);
  const [sugeridos, setSugeridos] = useState<string[]>([]);
  const [agregados, setAgregados] = useState<string[]>([]);
  const [destildados, setDestildados] = useState<Set<string>>(new Set());
  const [busca, setBusca] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      const r = await contactosDeSugerenciaAction(etiqueta);
      if (cancelado) return;
      if (r.error) setError(r.error);
      setSugeridos(r.ids);
      setCargando(false);
    })();
    return () => {
      cancelado = true;
    };
  }, [etiqueta]);

  const porId = useMemo(() => new Map(contacts.map((c) => [c.id, c])), [contacts]);
  const enLista = useMemo(() => [...sugeridos, ...agregados.filter((a) => !sugeridos.includes(a))], [sugeridos, agregados]);
  const marcados = enLista.filter((id) => !destildados.has(id));

  const candidatos = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return [];
    const yaEsta = new Set(enLista);
    return contacts
      .filter((c) => !yaEsta.has(c.id) && !(c.etiquetas ?? []).includes(etiqueta))
      .filter((c) => (c.nombre || "").toLowerCase().includes(q) || (c.tel || "").toLowerCase().includes(q))
      .slice(0, 6);
  }, [busca, contacts, enLista, etiqueta]);

  function alternar(id: string) {
    setDestildados((d) => {
      const n = new Set(d);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  async function aplicar() {
    if (marcados.length === 0 || guardando) return;
    setGuardando(true);
    setError(null);
    const e = await onAplicar(marcados);
    setGuardando(false);
    if (e) setError(e);
  }

  return (
    <div
      onClick={(ev) => ev.target === ev.currentTarget && onClose()}
      className="fixed inset-0 bg-black/[.34] flex items-center justify-center z-[110] px-4"
      style={{ animation: "ys-fade .16s ease both" }}
    >
      <div
        onClick={(ev) => ev.stopPropagation()}
        className="w-full max-w-[520px] max-h-[88vh] bg-white rounded-[18px] px-6 py-5 flex flex-col gap-3.5 shadow-[var(--shadow-modal)]"
        style={{ animation: "ys-modal .19s cubic-bezier(.4,0,.2,1) both" }}
      >
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="text-[18px] font-extrabold tracking-[-0.02em] text-ys-text">Revisar</div>
            <EtiquetaChip nombre={etiqueta} />
          </div>
          <div className="text-[13px] text-ys-muted font-medium leading-[1.5]">
            {descripcion} Destildá a quien no corresponda o sumá contactos que falten.
          </div>
        </div>

        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar un contacto para sumar…"
          className="w-full border border-ys-border rounded-[10px] px-3 py-2 text-[13px] font-medium text-ys-text outline-none focus:border-ys-green"
        />
        {candidatos.length > 0 && (
          <div className="flex flex-col border border-ys-border-soft rounded-[10px] overflow-hidden">
            {candidatos.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  setAgregados((a) => [...a, c.id]);
                  setBusca("");
                }}
                className="flex items-center justify-between gap-2 px-3 py-2 text-left text-[13px] cursor-pointer hover:bg-[#f7fbf9] border-b border-ys-border-softest last:border-b-0"
              >
                <span className="font-bold text-ys-text truncate">{c.nombre || "Sin nombre"}</span>
                <span className="text-[12px] font-bold text-ys-green-text flex-none">+ Sumar</span>
              </button>
            ))}
          </div>
        )}

        <div className="flex-1 min-h-0 overflow-y-auto border border-ys-border-soft rounded-[10px]">
          {cargando ? (
            <div className="px-3 py-4 text-[13px] font-semibold text-ys-muted">Buscando contactos…</div>
          ) : enLista.length === 0 ? (
            <div className="px-3 py-4 text-[13px] font-semibold text-ys-muted">No hay contactos en esta sugerencia. Sumá alguno con el buscador.</div>
          ) : (
            enLista.map((id) => {
              const c = porId.get(id);
              const tilde = !destildados.has(id);
              return (
                <label
                  key={id}
                  className="flex items-center gap-3 px-3 py-2 border-b border-ys-border-softest last:border-b-0 cursor-pointer hover:bg-[#f7fbf9]"
                >
                  <input type="checkbox" checked={tilde} onChange={() => alternar(id)} className="w-4 h-4 accent-[#12B76A] cursor-pointer" />
                  <span className="min-w-0 flex-1 text-[13px] font-bold text-ys-text truncate">{c?.nombre || "Sin nombre"}</span>
                  <span className="font-mono text-[12px] text-ys-muted flex-none">{c?.tel || ""}</span>
                </label>
              );
            })
          )}
        </div>

        {error && <div className="text-[12.5px] font-semibold text-ys-red-text bg-ys-red-bg rounded-[10px] px-3 py-2">{error}</div>}

        <div className="flex items-center justify-between gap-2.5">
          <span className="text-[12.5px] font-semibold text-ys-muted">
            {marcados.length} de {enLista.length} tildados
          </span>
          <div className="flex gap-2.5">
            <button
              onClick={onClose}
              className="text-[13.5px] font-bold text-[#3f4844] border border-ys-border rounded-[10px] px-[18px] py-2.5 cursor-pointer transition-colors hover:bg-[#f7f9f8]"
            >
              Cancelar
            </button>
            <button
              onClick={aplicar}
              disabled={marcados.length === 0 || guardando}
              className="text-[13.5px] font-bold text-white bg-ys-green rounded-[10px] px-[18px] py-2.5 cursor-pointer transition-all hover:bg-ys-green-hover disabled:opacity-60 disabled:cursor-default"
            >
              {guardando ? "Aplicando…" : `Aplicar «${mostrarEtiqueta(etiqueta)}» a ${marcados.length}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
