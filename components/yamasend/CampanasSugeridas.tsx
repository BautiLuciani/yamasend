"use client";

import { useEffect, useState } from "react";
import {
  crearAudienciaSugeridaAction,
  getCampanasSugeridasAction,
  type CampanaSugeridaVista,
  type CrearAudienciaSugeridaResult,
} from "@/lib/actions/campanas_sugeridas";

/**
 * Tres campañas sugeridas que se arman solas con el perfil del negocio y las
 * compras detectadas en los chats. Aparecen arriba de la lista de campañas.
 *
 * "Crear campaña" arma la audiencia y abre el asistente de campañas en el paso
 * del template. NADA se envía sin que la persona revise y confirme ahí.
 */

interface Props {
  /** false deja el botón visible pero bloqueado (mismo criterio que "Nueva campaña"). */
  puedeCrear: boolean;
  onSinPermiso: () => void;
  /** La audiencia ya está armada: el padre abre el asistente de campañas. */
  onCrear: (resultado: CrearAudienciaSugeridaResult) => void;
  /** Abre el editor de templates con el mensaje sugerido ya escrito. */
  onUsarMensaje: (texto: string, nombreTemplate: string) => void;
}

const ICONOS: Record<CampanaSugeridaVista["tipo"], string> = {
  inactivos_2_semanas: "⏰",
  por_producto: "🛍️",
  mejores_compradores: "⭐",
};

function Tarjeta({
  s,
  creando,
  puedeCrear,
  onCrear,
  onCambiarProducto,
  onUsarMensaje,
}: {
  s: CampanaSugeridaVista;
  creando: boolean;
  puedeCrear: boolean;
  onCrear: () => void;
  onCambiarProducto: (nombre: string) => void;
  onUsarMensaje: () => void;
}) {
  const [verMensaje, setVerMensaje] = useState(false);

  return (
    <div className="bg-white border border-ys-border rounded-[14px] p-4 flex flex-col gap-3 min-w-0">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[18px] leading-none" aria-hidden>
            {ICONOS[s.tipo]}
          </span>
          <div className="text-[14.5px] font-extrabold text-ys-text leading-[1.25]">{s.titulo}</div>
        </div>
        <span className="flex-none text-[10.5px] font-extrabold tracking-[0.04em] uppercase text-ys-green-text bg-ys-green-bg rounded-full px-2 py-0.5">
          Sugerida
        </span>
      </div>

      <div className="text-[12.5px] font-medium text-ys-muted leading-[1.5]">{s.descripcion}</div>

      {s.tipo === "por_producto" && s.disponible && (s.productosAlternativos?.length ?? 0) > 1 && (
        <select
          value={s.producto}
          onChange={(e) => onCambiarProducto(e.target.value)}
          className="w-full border border-ys-border rounded-[10px] px-2.5 py-2 text-[12.5px] font-semibold text-ys-text bg-white outline-none focus:border-ys-green"
        >
          {s.productosAlternativos!.map((p) => (
            <option key={p.nombre} value={p.nombre}>
              {p.nombre} ({p.cantidad})
            </option>
          ))}
        </select>
      )}
      {s.tipo === "por_producto" && s.disponible && (s.productosAlternativos?.length ?? 0) === 1 && (
        <div className="text-[12.5px] font-bold text-ys-text">{s.producto}</div>
      )}

      {s.disponible ? (
        <div className="flex flex-col gap-1">
          <div className="text-[22px] font-extrabold tracking-[-0.02em] text-ys-text leading-none">
            {s.cantidad} <span className="text-[13px] font-bold text-ys-muted">cliente{s.cantidad === 1 ? "" : "s"}</span>
          </div>
          {s.ejemplos.length > 0 && (
            <div className="text-[12px] font-medium text-ys-dim truncate">Ej: {s.ejemplos.join(", ")}</div>
          )}
          {s.excluidosPorCampanaReciente > 0 && (
            <div className="text-[11.5px] font-medium text-ys-dim">
              {s.excluidosPorCampanaReciente} quedaron afuera por haber recibido una campaña en los últimos 7 días.
            </div>
          )}
        </div>
      ) : (
        <div className="text-[12.5px] font-semibold text-ys-muted bg-ys-el2 rounded-[10px] px-3 py-2.5 leading-[1.5]">
          {s.motivoNoDisponible}
        </div>
      )}

      {s.disponible && (
        <div className="flex flex-col gap-1.5">
          <button
            type="button"
            onClick={() => setVerMensaje((v) => !v)}
            className="self-start text-[12px] font-bold text-ys-muted hover:text-ys-text cursor-pointer"
          >
            {verMensaje ? "Ocultar mensaje sugerido" : "Ver mensaje sugerido"}
          </button>
          {verMensaje && (
            <div className="flex flex-col gap-2">
              <div className="text-[12.5px] font-medium text-ys-text bg-ys-el2 rounded-[10px] px-3 py-2.5 leading-[1.5] whitespace-pre-wrap">
                {s.mensajeSugerido}
              </div>
              <button
                type="button"
                onClick={onUsarMensaje}
                className="self-start text-[12px] font-bold text-[#3f4844] border border-ys-border rounded-lg px-3 py-1.5 cursor-pointer hover:bg-[#f7f9f8]"
              >
                Crear template con este mensaje
              </button>
            </div>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={onCrear}
        disabled={!s.disponible || creando}
        className={`mt-auto text-[13px] font-bold rounded-[10px] px-4 py-2.5 transition-all ${
          s.disponible && puedeCrear
            ? "bg-ys-green text-white cursor-pointer hover:bg-ys-green-hover disabled:opacity-60 disabled:cursor-default"
            : s.disponible
              ? "bg-ys-el2 text-ys-faint cursor-pointer"
              : "bg-ys-el2 text-ys-faint cursor-not-allowed"
        }`}
      >
        {creando ? "Armando audiencia…" : "Crear campaña"}
      </button>
    </div>
  );
}

export default function CampanasSugeridas({ puedeCrear, onSinPermiso, onCrear, onUsarMensaje }: Props) {
  const [producto, setProducto] = useState<string | null>(null);
  const [sugeridas, setSugeridas] = useState<CampanaSugeridaVista[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creando, setCreando] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      const r = await getCampanasSugeridasAction(producto);
      if (cancelado) return;
      setSugeridas(r.sugeridas);
      setError(r.error);
    })();
    return () => {
      cancelado = true;
    };
  }, [producto]);

  async function crear(s: CampanaSugeridaVista) {
    if (!puedeCrear) {
      onSinPermiso();
      return;
    }
    setCreando(s.tipo);
    setMsg(null);
    const r = await crearAudienciaSugeridaAction(s.tipo, s.producto);
    setCreando(null);
    if (r.error || !r.lista) {
      setMsg(r.error ?? "No se pudo armar la audiencia.");
      return;
    }
    onCrear(r);
  }

  // Cuenta sin WhatsApp propio (empresa/admin): no hay chats de los que sugerir.
  if (sugeridas !== null && sugeridas.length === 0 && !error) return null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <div className="text-[16px] font-extrabold tracking-[-0.01em] text-ys-text">Campañas sugeridas</div>
        <div className="text-[12.5px] font-medium text-ys-muted leading-[1.5] max-w-[760px]">
          Armadas con el perfil de tu negocio y lo que detectamos en tus chats. Se actualizan solas y nunca se envía
          nada sin que lo revises. Solo incluyen contactos con chats analizados.
        </div>
      </div>

      {sugeridas === null && <div className="text-[13px] font-semibold text-ys-muted">Preparando sugerencias…</div>}
      {error && <div className="text-[13px] font-semibold text-ys-red-text">{error}</div>}
      {msg && <div className="text-[12.5px] font-semibold text-ys-red-text bg-ys-red-bg rounded-[10px] px-3 py-2">{msg}</div>}

      {sugeridas && sugeridas.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3.5">
          {sugeridas.map((s) => (
            <Tarjeta
              key={s.tipo}
              s={s}
              creando={creando === s.tipo}
              puedeCrear={puedeCrear}
              onCrear={() => crear(s)}
              onCambiarProducto={setProducto}
              onUsarMensaje={() => onUsarMensaje(s.mensajeSugerido, s.nombreTemplate)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
