"use client";

import { useFormStatus } from "react-dom";

export default function BotonesDecision() {
  const { pending } = useFormStatus();

  return (
    <div className="w-full flex flex-col gap-2.5">
      <button
        type="submit"
        name="decision"
        value="aprobar"
        disabled={pending}
        className="w-full flex items-center justify-center gap-2.5 bg-ys-green text-white text-sm font-bold py-[13px] rounded-[11px] cursor-pointer transition-all hover:bg-ys-green-hover hover:-translate-y-px shadow-[var(--shadow-cta)] disabled:opacity-60 disabled:cursor-default disabled:translate-y-0"
      >
        {pending ? "Conectando..." : "Permitir acceso"}
      </button>
      <button
        type="submit"
        name="decision"
        value="cancelar"
        disabled={pending}
        className="w-full text-sm font-semibold text-ys-muted py-[11px] rounded-[11px] border border-ys-border cursor-pointer hover:bg-ys-el2 disabled:opacity-60 disabled:cursor-default"
      >
        Cancelar
      </button>
    </div>
  );
}
