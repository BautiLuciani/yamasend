"use client";

import { useEffect, useState } from "react";
import { getConexionYcloudAction, type ConexionYcloud as Estado } from "@/lib/actions/ycloud";

/**
 * Mi perfil → WhatsApp: estado de la conexión. Solo lectura: la API key de
 * YCloud es única para toda la plataforma y la administra YamaSend; nadie la
 * pega acá.
 */
const FALTA: Record<NonNullable<Estado["falta"]>, string> = {
  clave_plataforma: "La conexión con YCloud todavía no está habilitada en la plataforma. Lo resuelve el administrador de YamaSend.",
  numero: "Tu cuenta todavía no tiene un número de WhatsApp asociado.",
  waba: "Tu cuenta todavía no tiene la cuenta de WhatsApp Business (WABA) asociada.",
};

export default function ConexionYcloud() {
  const [estado, setEstado] = useState<Estado | null>(null);

  useEffect(() => {
    let cancelado = false;
    getConexionYcloudAction().then((e) => {
      if (!cancelado) setEstado(e);
    });
    return () => {
      cancelado = true;
    };
  }, []);

  if (!estado) return <div className="text-[13px] font-semibold text-ys-muted">Cargando…</div>;

  return (
    <>
      <div className="flex flex-col gap-1">
        <div className="text-[19px] font-extrabold tracking-[-0.02em] text-ys-text">WhatsApp</div>
        <div className="text-[13.5px] text-ys-muted font-medium">
          Tu número conectado por coexistencia. Los envíos y templates salen por YamaSend: no necesitás cargar ninguna clave.
        </div>
      </div>

      <div
        className={`flex items-center gap-3 rounded-[14px] border px-4 py-3.5 ${
          estado.lista ? "bg-ys-green-bg border-ys-green-border" : "bg-ys-warn-bg border-ys-border"
        }`}
      >
        <span className={`w-2.5 h-2.5 rounded-full flex-none ${estado.lista ? "bg-ys-green" : "bg-[#c07a12]"}`} />
        <div className="flex flex-col gap-0.5 min-w-0">
          <div className="text-[13.5px] font-extrabold text-ys-text">
            {estado.lista ? "Listo para enviar" : "Todavía no está listo"}
          </div>
          <div className="text-[12.5px] font-semibold text-ys-muted">
            {estado.lista
              ? `Número ${estado.telefono}${estado.wabaid ? ` · WABA ${estado.wabaid}` : ""}`
              : estado.falta
                ? FALTA[estado.falta]
                : "Sin información de conexión."}
          </div>
        </div>
      </div>

      {estado.error && (
        <div className="text-[12.5px] font-semibold text-ys-red-text bg-ys-red-bg rounded-[10px] px-3.5 py-2.5">{estado.error}</div>
      )}

      <div className="text-[12.5px] font-semibold text-ys-muted">
        Estás entrando como <b className="text-ys-text">{estado.cuenta.email ?? "—"}</b>
        {estado.cuenta.tenantId ? (
          <>
            {" "}
            · cuenta <span className="font-mono text-ys-text">{estado.cuenta.tenantId}</span>
          </>
        ) : null}
        .
      </div>
    </>
  );
}
