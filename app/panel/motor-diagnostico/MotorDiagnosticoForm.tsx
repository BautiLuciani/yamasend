"use client";

import { useState } from "react";
import {
  confirmarEjecucionMotorAction,
  type ConfirmarEjecucionMotorResult,
} from "@/lib/actions/motor";

/**
 * DIAGNOSTIC_ONLY=true — ver comentario de page.tsx en este mismo directorio.
 *
 * Formulario mínimo: un campo de texto y un botón. Invoca exclusivamente
 * confirmarEjecucionMotorAction; nunca llama Supabase directamente ni
 * ninguna otra Server Action. Nunca se dispara solo (ni al montar, ni al
 * pegar el ID) — solo por click humano explícito, y el botón queda
 * deshabilitado mientras la acción está en curso para evitar doble submit.
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Status = "idle" | "pending" | "success" | "error";

export default function MotorDiagnosticoForm() {
  const [intentId, setIntentId] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [resultado, setResultado] = useState<ConfirmarEjecucionMotorResult | null>(
    null,
  );
  const [validationError, setValidationError] = useState<string | null>(null);

  const disabled = status === "pending";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (disabled) return;

    const value = intentId.trim();

    if (!value) {
      setValidationError("Ingresá el Execution Intent ID.");
      return;
    }
    if (!UUID_RE.test(value)) {
      setValidationError("Eso no tiene formato de UUID válido.");
      return;
    }

    setValidationError(null);
    setStatus("pending");
    setResultado(null);

    const r = await confirmarEjecucionMotorAction(value);

    setResultado(r);
    setStatus(r.ok ? "success" : "error");
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="intentId"
          className="text-[12.5px] font-bold text-ys-text"
        >
          Execution Intent ID
        </label>
        <input
          id="intentId"
          value={intentId}
          onChange={(e) => setIntentId(e.target.value)}
          placeholder="00000000-0000-0000-0000-000000000000"
          disabled={disabled}
          className="border border-ys-border rounded-[10px] px-3 py-2.5 text-[14px] font-medium text-ys-text outline-none focus:border-ys-green disabled:opacity-60"
        />
        {validationError ? (
          <div className="text-[12.5px] font-semibold text-red-600">
            {validationError}
          </div>
        ) : null}
      </div>

      <button
        type="submit"
        disabled={disabled}
        className="rounded-xl px-4 py-3 text-[14px] font-bold bg-ys-green text-white hover:opacity-90 transition-opacity disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {disabled ? "Procesando..." : "Confirmar y reservar créditos"}
      </button>

      {resultado ? (
        <div
          className={
            "rounded-xl px-4 py-3 text-[13.5px] font-semibold " +
            (resultado.ok
              ? "bg-green-50 text-green-800 border border-green-200"
              : "bg-red-50 text-red-700 border border-red-200")
          }
        >
          {resultado.ok ? (
            <>
              Binding: {resultado.bindingEstado ?? "OK"} · Reserva: {resultado.reservaEstado ?? "OK"}
              {resultado.jobId ? ` · Job: ${resultado.jobId}` : ""}
            </>
          ) : (
            <>
              Error: {resultado.error ?? "desconocido"}
              {resultado.bindingEstado
                ? ` (binding: ${resultado.bindingEstado}${resultado.reservaEstado ? `, reserva: ${resultado.reservaEstado}` : ""})`
                : ""}
            </>
          )}
        </div>
      ) : null}
    </form>
  );
}
