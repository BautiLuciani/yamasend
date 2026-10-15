"use client";

import { useEffect, useState } from "react";
import {
  getConexionYcloudAction,
  guardarYcloudApiAction,
  type ConexionYcloud as Estado,
} from "@/lib/actions/ycloud";

/**
 * Mi perfil → WhatsApp: dónde se pega la API key de YCloud.
 *
 * La clave nunca vuelve al navegador: se muestra solo si está configurada y
 * sus últimos 4 caracteres. Al guardar se verifica contra YCloud y tiene que
 * incluir el número de la cuenta.
 */
export default function ConexionYcloud() {
  const [estado, setEstado] = useState<Estado | null>(null);
  const [clave, setClave] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    let cancelado = false;
    getConexionYcloudAction().then((e) => {
      if (!cancelado) setEstado(e);
    });
    return () => {
      cancelado = true;
    };
  }, []);

  async function guardar() {
    setGuardando(true);
    setMsg(null);
    const r = await guardarYcloudApiAction(clave);
    setGuardando(false);
    if (!r.ok) {
      setMsg({ type: "err", text: r.error ?? "No se pudo guardar." });
      return;
    }
    setClave("");
    setMsg({
      type: "ok",
      text: `Listo: la clave es válida y tu número ${r.telefono ?? ""} quedó conectado. Ya podés crear campañas.`,
    });
    setEstado(await getConexionYcloudAction());
  }

  if (!estado) return <div className="text-[13px] font-semibold text-ys-muted">Cargando…</div>;

  return (
    <>
      <div className="flex flex-col gap-1">
        <div className="text-[19px] font-extrabold tracking-[-0.02em] text-ys-text">WhatsApp (YCloud)</div>
        <div className="text-[13.5px] text-ys-muted font-medium">
          La clave de YCloud conecta tu número para enviar campañas y templates.
        </div>
      </div>

      <div
        className={`flex items-center gap-3 rounded-[14px] border px-4 py-3.5 ${
          estado.configurada ? "bg-ys-green-bg border-ys-green-border" : "bg-ys-warn-bg border-ys-border"
        }`}
      >
        <span className={`w-2.5 h-2.5 rounded-full flex-none ${estado.configurada ? "bg-ys-green" : "bg-[#c07a12]"}`} />
        <div className="flex flex-col gap-0.5 min-w-0">
          <div className="text-[13.5px] font-extrabold text-ys-text">
            {estado.configurada ? "Clave configurada" : "Falta la clave de YCloud"}
          </div>
          <div className="text-[12.5px] font-semibold text-ys-muted truncate">
            {estado.configurada
              ? `Termina en ••••${estado.ultimos4 ?? ""}${estado.telefono ? ` · Número ${estado.telefono}` : ""}`
              : "Sin la clave no se pueden crear campañas ni enviar templates a Meta."}
          </div>
        </div>
      </div>

      {estado.error && (
        <div className="text-[12.5px] font-semibold text-ys-red-text bg-ys-red-bg rounded-[10px] px-3.5 py-2.5">{estado.error}</div>
      )}

      {estado.administradaPorEmpresa ? (
        <div className="text-[12.5px] font-semibold text-ys-warn-text bg-ys-warn-bg rounded-[10px] px-3.5 py-2.5">
          La conexión de WhatsApp la administra tu empresa: acá solo la podés ver.
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          <label className="text-[11px] font-extrabold tracking-[0.05em] uppercase text-ys-dimmer" htmlFor="ycloud-key">
            {estado.configurada ? "Reemplazar la clave" : "API key de YCloud"}
          </label>
          <input
            id="ycloud-key"
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={clave}
            onChange={(e) => setClave(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && clave.trim() && !guardando && guardar()}
            placeholder="Pegá acá la clave"
            className="border border-ys-border rounded-[10px] px-3.5 py-[11px] text-[13.5px] font-semibold text-ys-text outline-none transition-colors focus:border-ys-green"
          />
          <div className="flex items-center gap-3 flex-wrap">
            <button
              type="button"
              onClick={guardar}
              disabled={guardando || clave.trim().length === 0}
              className="h-11 px-[18px] rounded-[10px] bg-ys-green text-[#04210f] text-sm font-extrabold cursor-pointer transition-all hover:bg-ys-green-hover disabled:opacity-50 disabled:cursor-default"
            >
              {guardando ? "Verificando…" : "Guardar y verificar"}
            </button>
            <span className="text-[12px] font-medium text-ys-dim">
              En YCloud: Developers → API keys. La verificamos antes de guardarla.
            </span>
          </div>
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
    </>
  );
}
