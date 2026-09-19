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
  /** Plan preparado, pero motor_preparar_plan dice que no hay nada para
   * aprobar (plan_estado != 'PLAN_GENERADO') — estado terminal, nunca
   * ofrece "Aprobar plan". */
  | "sin_oportunidades"
  /** Approval1 se completó (ok=true), pero no se generó ningún draft —
   * defensa adicional para un caso que la UI ya debería evitar mostrando
   * el botón solo cuando corresponde. También estado terminal. */
  | "sin_draft"
  | "draft_listo"
  | "intent_listo"
  | "ejecucion_confirmada";

export default function MotorRecomendaciones() {
  const [paso, setPaso] = useState<Paso>("inicial");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [planId, setPlanId] = useState<string | null>(null);
  const [planMensaje, setPlanMensaje] = useState<string | null>(null);
  const [resumenSinOportunidades, setResumenSinOportunidades] = useState<{
    nEvaluados: number | null;
    nSeleccionados: number | null;
  } | null>(null);

  const [draftId, setDraftId] = useState<string | null>(null);
  const [preview, setPreview] = useState<Record<string, unknown> | null>(null);

  const [executionIntentId, setExecutionIntentId] = useState<string | null>(null);
  const [gate, setGate] = useState<Record<string, unknown> | null>(null);
  // AI-MOTOR-1.12 — provider real del canal resuelto server-side, solo
  // para decidir qué copy mostrar antes de "Confirmar ejecución". Nunca
  // se usa para decidir nada de negocio.
  const [provider, setProvider] = useState<string | null>(null);

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

    // Única defensa correcta: mostrar "Aprobar plan" solo cuando el propio
    // plan_estado dice que hay algo para decidir. Cualquier otro de los 5
    // estados posibles de motor.planes es un estado terminal informativo.
    if (r.planEstado !== "PLAN_GENERADO") {
      setPlanId(r.planId);
      setResumenSinOportunidades({
        nEvaluados: r.nEvaluados,
        nSeleccionados: r.nSeleccionados,
      });
      setPaso("sin_oportunidades");
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

    if (!r.ok) {
      // ERROR REAL: no se pudo completar ni el approval ni el materialize.
      setError(r.error ?? "No se pudo aprobar el plan.");
      return;
    }

    if (!r.draftId) {
      // OPERACIÓN VÁLIDA SIN DRAFT: Approval1 se registró, pero no hay
      // nada para materializar. Nunca volver a mostrar "Aprobar plan"
      // sobre este plan — defensa adicional, aunque la UI ya no debería
      // haber ofrecido este botón para un plan sin oportunidades.
      setPaso("sin_draft");
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
    setProvider(r.provider ?? null);

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
    setResumenSinOportunidades(null);
    setDraftId(null);
    setPreview(null);
    setExecutionIntentId(null);
    setGate(null);
    setProvider(null);
    setResultadoEjecucion(null);
  }

  const esProviderReal = Boolean(provider && provider !== "fake");
  const ESTADO_LABEL: Record<string, string> = {
    PENDIENTE: "Preparando ejecución",
    PROCESANDO: "Procesando",
    COMPLETADO: esProviderReal ? "Ejecución completada" : "Ejecución completada (entorno de prueba)",
    PARCIAL: esProviderReal ? "Ejecución parcial" : "Ejecución parcial (entorno de prueba)",
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
          {provider && provider !== "fake"
            ? "Este canal envía mensajes reales de WhatsApp."
            : "Entorno de prueba — ningún mensaje de WhatsApp se envía todavía."}
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

      {paso === "sin_oportunidades" && (
        <div className="flex flex-col gap-3">
          <div className="rounded-xl border border-ys-border px-4 py-3 text-[13px]">
            <div className="font-semibold mb-1">
              No hay recomendaciones para ejecutar por ahora.
            </div>
            <div className="text-ys-muted">
              El Motor analizó tus contactos, pero actualmente ninguno cumple todas las
              condiciones necesarias para preparar una campaña.
            </div>
            {resumenSinOportunidades?.nEvaluados != null ? (
              <div className="text-ys-muted mt-2">
                {resumenSinOportunidades.nEvaluados} contactos analizados ·{" "}
                {resumenSinOportunidades.nSeleccionados ?? 0} oportunidades listas ahora
              </div>
            ) : null}
          </div>
          <button
            type="button"
            onClick={handleReiniciar}
            className="self-start rounded-xl px-4 py-2 text-[13px] font-bold border border-ys-border hover:bg-ys-el2"
          >
            Volver a evaluar más tarde
          </button>
        </div>
      )}

      {paso === "sin_draft" && (
        <div className="flex flex-col gap-3">
          <div className="rounded-xl border border-ys-border px-4 py-3 text-[13px]">
            <div className="font-semibold mb-1">
              No hay recomendaciones para ejecutar por ahora.
            </div>
            <div className="text-ys-muted">
              El plan quedó aprobado, pero no se generó ninguna campaña para enviar.
            </div>
          </div>
          <button
            type="button"
            onClick={handleReiniciar}
            className="self-start rounded-xl px-4 py-2 text-[13px] font-bold border border-ys-border hover:bg-ys-el2"
          >
            Volver a evaluar más tarde
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
          {provider && provider !== "fake" ? (
            <div className="rounded-xl px-4 py-3 text-[13px] font-semibold bg-ys-warn-bg text-ys-warn-text border border-ys-border">
              Vas a enviar {gate && typeof gate.destinatarios === "number" ? gate.destinatarios : "un"}{" "}
              mensaje{gate && gate.destinatarios === 1 ? "" : "s"} real
              {gate && gate.destinatarios === 1 ? "" : "es"} de WhatsApp
              {gate && typeof gate.costo_creditos === "number"
                ? ` (${gate.costo_creditos} créditos)`
                : ""}
              . Esta acción no se puede deshacer.
            </div>
          ) : (
            <div className="text-[13px] text-ys-muted font-medium">
              {gate && typeof gate.costo_creditos === "number"
                ? `Esta ejecución va a usar ${gate.costo_creditos} créditos para ${gate.destinatarios ?? "?"} contactos.`
                : "Ejecución lista para confirmar."}
            </div>
          )}
          <button
            type="button"
            disabled={cargando}
            onClick={handleConfirmarYEjecutar}
            className="self-start rounded-xl px-4 py-2.5 text-[13.5px] font-bold bg-ys-green text-white hover:opacity-90 disabled:opacity-60"
          >
            {cargando
              ? "Confirmando..."
              : provider && provider !== "fake"
                ? "Confirmar envío real"
                : "Confirmar y ejecutar"}
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
