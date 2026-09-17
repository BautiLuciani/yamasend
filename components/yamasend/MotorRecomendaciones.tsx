"use client";

import { useState } from "react";
import {
  prepararPlanMotorAction,
  aprobarPlanMotorAction,
  obtenerDraftPreviewMotorAction,
  aprobarDraftMotorAction,
  confirmarEjecucionMotorAction,
  obtenerEstadoEjecucionMotorAction,
} from "@/lib/actions/motor";

/**
 * PRODUCT-P3 — "Recomendaciones del Motor" dentro del Dashboard.
 *
 * Ningún paso corre al montar/refrescar este componente (DASHBOARD_RENDER_MUTATIONS=0):
 * todo se dispara por click humano explícito. La identidad y el tenant se
 * resuelven server-side en cada Server Action — este componente nunca
 * envía tenant_id ni "quién soy" al servidor, solo IDs de los objetos que
 * el propio flujo ya fue devolviendo.
 *
 * El provider detrás de esto es siempre `fake` mientras
 * REAL_PROVIDER_ENABLED=false: el wording de esta pantalla nunca afirma un
 * envío real a WhatsApp.
 */

type Paso =
  | "inicial"
  | "plan_listo"
  | "draft_listo"
  | "intent_listo"
  | "ejecucion_confirmada";

export default function MotorRecomendaciones() {
  const [paso, setPaso] = useState<Paso>("inicial");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [planId, setPlanId] = useState<string | null>(null);
  const [planMensaje, setPlanMensaje] = useState<string | null>(null);

  const [draftId, setDraftId] = useState<string | null>(null);
  const [preview, setPreview] = useState<Record<string, unknown> | null>(null);

  const [executionIntentId, setExecutionIntentId] = useState<string | null>(null);
  const [gate, setGate] = useState<Record<string, unknown> | null>(null);

  const [resultadoEjecucion, setResultadoEjecucion] = useState<{
    estado: string | null;
    detalle: Record<string, unknown> | null;
  } | null>(null);

  async function handlePrepararPlan() {
    setCargando(true);
    setError(null);
    const r = await prepararPlanMotorAction();
    setCargando(false);

    if (!r.ok || !r.planId) {
      setError(r.error ?? "No se pudo preparar el plan.");
      return;
    }

    setPlanId(r.planId);
    setPlanMensaje(
      r.resultado === "PENDING_PLAN_REUSED"
        ? "Ya había una recomendación preparada sin aprobar — la retomamos."
        : "Recomendación nueva preparada.",
    );
    setPaso("plan_listo");
  }

  async function handleAprobarPlan() {
    if (!planId) return;
    setCargando(true);
    setError(null);
    const r = await aprobarPlanMotorAction(planId);
    setCargando(false);

    if (!r.ok || !r.draftId) {
      setError(r.error ?? "No se pudo aprobar el plan.");
      return;
    }

    setDraftId(r.draftId);

    const p = await obtenerDraftPreviewMotorAction(r.draftId);
    if (!p.ok || !p.preview) {
      setError(p.error ?? "No se pudo leer el draft.");
      return;
    }
    setPreview(p.preview);
    setPaso("draft_listo");
  }

  async function handleAprobarDraft() {
    if (!draftId) return;
    setCargando(true);
    setError(null);
    const r = await aprobarDraftMotorAction(draftId);
    setCargando(false);

    setGate(r.gate);

    if (!r.ok || !r.executionIntentId) {
      setError(
        r.error ?? "La ejecución quedó bloqueada. Revisá el detalle antes de reintentar.",
      );
      return;
    }

    setExecutionIntentId(r.executionIntentId);
    setPaso("intent_listo");
  }

  async function handleConfirmarYEjecutar() {
    if (!executionIntentId) return;
    setCargando(true);
    setError(null);
    const r = await confirmarEjecucionMotorAction(executionIntentId);
    setCargando(false);

    if (!r.ok) {
      setError(r.error ?? "No se pudo confirmar la ejecución.");
      return;
    }

    setPaso("ejecucion_confirmada");
    void handleRevisarEstado();
  }

  async function handleRevisarEstado() {
    if (!executionIntentId) return;
    const r = await obtenerEstadoEjecucionMotorAction(executionIntentId);
    if (r.ok) {
      setResultadoEjecucion({ estado: r.estado, detalle: r.detalle });
    }
  }

  function handleReiniciar() {
    setPaso("inicial");
    setError(null);
    setPlanId(null);
    setPlanMensaje(null);
    setDraftId(null);
    setPreview(null);
    setExecutionIntentId(null);
    setGate(null);
    setResultadoEjecucion(null);
  }

  const ESTADO_LABEL: Record<string, string> = {
    PENDIENTE: "Preparando ejecución",
    PROCESANDO: "Procesando",
    COMPLETADO: "Ejecución completada (entorno de prueba)",
    PARCIAL: "Ejecución parcial (entorno de prueba)",
    FALLIDO: "Ejecución fallida",
    DESCONOCIDO: "Estado desconocido",
  };

  return (
    <div className="rounded-2xl border border-ys-border bg-white px-5 py-5 flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <div className="text-[15px] font-extrabold text-ys-text">
          Recomendaciones del Motor
        </div>
        <div className="text-[12.5px] text-ys-muted font-medium">
          Entorno de prueba — ningún mensaje de WhatsApp se envía todavía.
        </div>
      </div>

      {error ? (
        <div className="rounded-xl px-4 py-3 text-[13px] font-semibold bg-red-50 text-red-700 border border-red-200">
          {error}
        </div>
      ) : null}

      {paso === "inicial" && (
        <button
          type="button"
          disabled={cargando}
          onClick={handlePrepararPlan}
          className="self-start rounded-xl px-4 py-2.5 text-[13.5px] font-bold bg-ys-green text-white hover:opacity-90 disabled:opacity-60"
        >
          {cargando ? "Preparando..." : "Preparar plan"}
        </button>
      )}

      {paso === "plan_listo" && (
        <div className="flex flex-col gap-3">
          {planMensaje ? (
            <div className="text-[13px] text-ys-muted font-medium">{planMensaje}</div>
          ) : null}
          <button
            type="button"
            disabled={cargando}
            onClick={handleAprobarPlan}
            className="self-start rounded-xl px-4 py-2.5 text-[13.5px] font-bold bg-ys-green text-white hover:opacity-90 disabled:opacity-60"
          >
            {cargando ? "Procesando..." : "Aprobar plan"}
          </button>
        </div>
      )}

      {paso === "draft_listo" && preview ? (
        <div className="flex flex-col gap-3">
          <div className="rounded-xl border border-ys-border px-4 py-3 flex flex-col gap-1.5 text-[13px]">
            <div>
              <span className="font-bold">Oferta:</span> {String(preview.oferta ?? "—")}
            </div>
            <div>
              <span className="font-bold">Contactos incluidos:</span>{" "}
              {String(preview.incluidos ?? 0)}
              {typeof preview.removidos === "number" && preview.removidos > 0
                ? ` (${preview.removidos} removidos)`
                : ""}
            </div>
            <div>
              <span className="font-bold">Costo estimado:</span>{" "}
              {String(preview.costo_creditos ?? "—")} créditos
            </div>
            {preview.mensaje_draft ? (
              <div>
                <span className="font-bold">Mensaje:</span> {String(preview.mensaje_draft)}
              </div>
            ) : null}
            {Array.isArray(preview.warnings) && preview.warnings.length > 0 ? (
              <div className="text-ys-warn-text">
                Avisos: {preview.warnings.map((w) => (w as { codigo?: string }).codigo).join(", ")}
              </div>
            ) : null}
            {Array.isArray(preview.bloqueos) && preview.bloqueos.length > 0 ? (
              <div className="text-red-700">
                Bloqueos: {preview.bloqueos.map((b) => (b as { codigo?: string }).codigo).join(", ")}
              </div>
            ) : null}
          </div>
          <button
            type="button"
            disabled={cargando}
            onClick={handleAprobarDraft}
            className="self-start rounded-xl px-4 py-2.5 text-[13.5px] font-bold bg-ys-green text-white hover:opacity-90 disabled:opacity-60"
          >
            {cargando ? "Procesando..." : "Aprobar draft"}
          </button>
        </div>
      ) : null}

      {paso === "intent_listo" && (
        <div className="flex flex-col gap-3">
          <div className="text-[13px] text-ys-muted font-medium">
            {gate && typeof gate.costo_creditos === "number"
              ? `Esta ejecución va a usar ${gate.costo_creditos} créditos para ${gate.destinatarios ?? "?"} contactos.`
              : "Ejecución lista para confirmar."}
          </div>
          <button
            type="button"
            disabled={cargando}
            onClick={handleConfirmarYEjecutar}
            className="self-start rounded-xl px-4 py-2.5 text-[13.5px] font-bold bg-ys-green text-white hover:opacity-90 disabled:opacity-60"
          >
            {cargando ? "Confirmando..." : "Confirmar y ejecutar"}
          </button>
        </div>
      )}

      {paso === "ejecucion_confirmada" && (
        <div className="flex flex-col gap-3">
          <div className="rounded-xl border border-ys-border px-4 py-3 text-[13px] font-semibold">
            {resultadoEjecucion?.estado
              ? ESTADO_LABEL[resultadoEjecucion.estado] ?? resultadoEjecucion.estado
              : "Preparando ejecución"}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleRevisarEstado}
              className="self-start rounded-xl px-4 py-2 text-[13px] font-bold border border-ys-border hover:bg-ys-el2"
            >
              Actualizar estado
            </button>
            <button
              type="button"
              onClick={handleReiniciar}
              className="self-start rounded-xl px-4 py-2 text-[13px] font-bold border border-ys-border hover:bg-ys-el2"
            >
              Preparar otra recomendación
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
