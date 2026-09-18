"use client";

import { useState } from "react";
import {
  leerEstadoFixtureP5Action,
  prepararIntentP5Action,
  autorizarEjecucionP5Action,
  reaprobarDraftP5Action,
  type EstadoFixtureP5,
} from "@/lib/actions/motor-p5";

/**
 * TEMPORAL — PRODUCT-P5-D.4. Ver comentario de page.tsx en este directorio.
 *
 * El estado inicial llega como prop desde el Server Component (page.tsx),
 * que ya lo leyó server-side sin ningún side effect. Este componente nunca
 * hace fetch al montar — solo vuelve a leer (refrescar()) después de una
 * acción humana explícita, dentro del propio handler del botón. "Preparar
 * intent" y "Autorizar ejecución económica" solo se disparan por click,
 * cada uno con su propio botón deshabilitado mientras está en curso.
 */

interface Props {
  estadoInicial: EstadoFixtureP5;
}

export default function MotorP5AutorizacionForm({ estadoInicial }: Props) {
  const [fixture, setFixture] = useState<EstadoFixtureP5>(estadoInicial);
  const [accionEnCurso, setAccionEnCurso] = useState<"preparar" | "autorizar" | "reaprobar" | null>(null);
  const [mensaje, setMensaje] = useState<{ tipo: "ok" | "error"; texto: string } | null>(
    estadoInicial.ok ? null : { tipo: "error", texto: estadoInicial.error ?? "No se pudo leer el estado del fixture." },
  );
  const [mensajeReaprobar, setMensajeReaprobar] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);

  async function refrescar() {
    const r = await leerEstadoFixtureP5Action();
    setFixture(r);
    return r;
  }

  async function handlePrepararIntent() {
    if (accionEnCurso) return;
    setAccionEnCurso("preparar");
    setMensaje(null);
    const r = await prepararIntentP5Action();
    setAccionEnCurso(null);

    if (!r.ok) {
      setMensaje({ tipo: "error", texto: r.error ?? "No se pudo preparar el intent." });
      return;
    }
    setMensaje({ tipo: "ok", texto: "Intent preparado." });
    await refrescar();
  }

  async function handleAutorizar() {
    if (accionEnCurso) return;
    setAccionEnCurso("autorizar");
    setMensaje(null);
    const r = await autorizarEjecucionP5Action();
    setAccionEnCurso(null);

    if (!r.ok) {
      setMensaje({ tipo: "error", texto: r.error ?? "No se pudo autorizar la ejecución económica." });
      await refrescar();
      return;
    }
    setMensaje({
      tipo: "ok",
      texto: `Autorización completada. Binding: ${r.bindingEstado ?? "OK"} · Reserva: ${r.reservaEstado ?? "OK"}${r.jobId ? ` · Job: ${r.jobId}` : ""}${typeof r.dispatchCount === "number" ? ` · Dispatches: ${r.dispatchCount}` : ""}`,
    });
    await refrescar();
  }

  async function handleReaprobar() {
    if (accionEnCurso) return;
    setAccionEnCurso("reaprobar");
    setMensajeReaprobar(null);
    const r = await reaprobarDraftP5Action();
    setAccionEnCurso(null);

    if (!r.ok) {
      setMensajeReaprobar({ tipo: "error", texto: r.error ?? "No se pudo generar la nueva aprobación." });
      return;
    }
    setMensajeReaprobar({ tipo: "ok", texto: `Nueva aprobación generada (versión ${r.version ?? "?"}).` });
  }

  if (!fixture.ok) {
    return (
      <div className="rounded-xl px-4 py-3 text-[13px] font-semibold bg-red-50 text-red-700 border border-red-200">
        {fixture.error ?? "No se pudo cargar el estado."}
      </div>
    );
  }

  const ESTADOS_TERMINALES = new Set(["COMPLETED", "PARTIAL", "FAILED"]);
  const intentEsTerminal = fixture.intentId !== null && fixture.intentEstado !== null && ESTADOS_TERMINALES.has(fixture.intentEstado);
  const intentPreparado = Boolean(fixture.intentId) && fixture.intentEstado === "READY";
  const autorizacionRealizada = fixture.bindingExiste && fixture.reservaExiste && !intentEsTerminal;

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-ys-border px-4 py-3 flex flex-col gap-1.5 text-[13px]">
        <div>
          <span className="font-bold">Destinatario:</span> {fixture.recipientMasked}
        </div>
        <div>
          <span className="font-bold">Template:</span> {fixture.template}
        </div>
        <div>
          <span className="font-bold">Proveedor:</span> {fixture.provider}
        </div>
        <div>
          <span className="font-bold">Costo máximo:</span> {fixture.costoMaximoCreditos} crédito
        </div>
      </div>

      <div className="rounded-xl border border-ys-border px-4 py-3 flex flex-col gap-1 text-[12.5px] text-ys-muted">
        {intentEsTerminal ? (
          <div className="text-ys-text font-semibold">
            Intento histórico: {fixture.intentEstado} ({fixture.intentId}) — no reutilizable, generá una nueva
            aprobación para empezar un segundo intento.
          </div>
        ) : (
          <div>Intent: {intentPreparado ? `preparado (${fixture.intentEstado})` : "no preparado"}</div>
        )}
        <div>Autorización económica: {autorizacionRealizada ? "realizada" : "pendiente"}</div>
        <div>Reserva: {fixture.reservaExiste ? fixture.reservaEstado : "—"}</div>
        <div>Job: {fixture.jobId ? `${fixture.jobEstado} (${fixture.jobId})` : "—"}</div>
        <div>Dispatch: {fixture.dispatchExiste ? fixture.dispatchEstado : "—"}</div>
      </div>

      {mensaje ? (
        <div
          className={
            "rounded-xl px-4 py-3 text-[13.5px] font-semibold " +
            (mensaje.tipo === "ok"
              ? "bg-green-50 text-green-800 border border-green-200"
              : "bg-red-50 text-red-700 border border-red-200")
          }
        >
          {mensaje.texto}
        </div>
      ) : null}

      {!intentPreparado ? (
        <button
          type="button"
          disabled={accionEnCurso !== null}
          onClick={handlePrepararIntent}
          className="rounded-xl px-4 py-3 text-[14px] font-bold bg-ys-el2 text-ys-text hover:opacity-90 transition-opacity disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {accionEnCurso === "preparar" ? "Preparando…" : "Preparar intent"}
        </button>
      ) : (
        <>
          <div className="text-[12.5px] font-semibold text-ys-muted">
            Esta acción autoriza y reserva 1 crédito. NO envía todavía el WhatsApp.
          </div>
          <button
            type="button"
            disabled={accionEnCurso !== null || autorizacionRealizada}
            onClick={handleAutorizar}
            className="rounded-xl px-4 py-3 text-[14px] font-bold bg-ys-green text-white hover:opacity-90 transition-opacity disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {accionEnCurso === "autorizar"
              ? "Autorizando…"
              : autorizacionRealizada
                ? "Ya autorizado"
                : "Autorizar ejecución económica"}
          </button>
        </>
      )}

      <div className="rounded-xl border border-dashed border-ys-border px-4 py-3 flex flex-col gap-2 mt-2">
        <div className="text-[13px] font-bold text-ys-text">Segundo intento (nuevo Approval 2)</div>
        <div className="text-[12px] text-ys-muted font-medium leading-[1.5]">
          Esto crea una nueva aprobación humana del draft. NO reserva créditos. NO envía WhatsApp.
        </div>
        {mensajeReaprobar ? (
          <div
            className={
              "rounded-xl px-4 py-3 text-[13.5px] font-semibold " +
              (mensajeReaprobar.tipo === "ok"
                ? "bg-green-50 text-green-800 border border-green-200"
                : "bg-red-50 text-red-700 border border-red-200")
            }
          >
            {mensajeReaprobar.texto}
          </div>
        ) : null}
        <button
          type="button"
          disabled={accionEnCurso !== null}
          onClick={handleReaprobar}
          className="rounded-xl px-4 py-3 text-[14px] font-bold bg-ys-el2 text-ys-text hover:opacity-90 transition-opacity disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {accionEnCurso === "reaprobar" ? "Generando…" : "Generar nueva aprobación P5"}
        </button>
      </div>
    </div>
  );
}
