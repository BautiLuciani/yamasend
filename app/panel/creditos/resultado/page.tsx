"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";

/**
 * Pantalla a la que Mercado Pago redirige al comprador después de pagar
 * (back_urls). Es puramente informativa: el estado ?estado=... solo controla
 * el mensaje que se muestra, nunca decide si se acreditan créditos.
 *
 * La acreditación real ya pasó (o está por pasar) en el webhook, de forma
 * asíncrona e independiente de esta pantalla. Alguien podría escribir esta
 * URL a mano con ?estado=success sin haber pagado nada, y no pasaría nada:
 * acá no se actualiza ninguna fila.
 *
 * Con estado=success el saldo puede tardar unos segundos en reflejar los
 * créditos nuevos, porque el webhook es asíncrono y puede llegar después de
 * que el navegador ya redirigió de vuelta acá.
 */

const CONTENIDO: Record<
  string,
  { titulo: string; texto: string; icono: "ok" | "reloj" | "x" }
> = {
  success: {
    titulo: "¡Listo! Ya estamos procesando tu compra",
    texto:
      "En unos segundos vas a ver los créditos nuevos en tu cuenta. Si no aparecen enseguida, dales un minuto.",
    icono: "ok",
  },
  pending: {
    titulo: "Tu pago está pendiente",
    texto:
      "Algunos medios de pago tardan en confirmarse. Apenas se acredite, sumamos los créditos a tu cuenta automáticamente.",
    icono: "reloj",
  },
  failure: {
    titulo: "No pudimos procesar el pago",
    texto: "No te preocupes, no se te cobró nada. Podés intentar de nuevo cuando quieras.",
    icono: "x",
  },
};

function Icono({ tipo }: { tipo: "ok" | "reloj" | "x" }) {
  if (tipo === "ok") {
    return (
      <svg width="28" height="28" viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="8" r="6.5" stroke="#12B76A" strokeWidth="1.4" />
        <path d="M5.2 8.2l1.8 1.8 3.8-4" stroke="#12B76A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (tipo === "reloj") {
    return (
      <svg width="28" height="28" viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="8" r="6.5" stroke="#B7791F" strokeWidth="1.4" />
        <path d="M8 4.6V8l2.2 1.6" stroke="#B7791F" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  return (
    <svg width="28" height="28" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="6.5" stroke="#C4372B" strokeWidth="1.4" />
      <path d="M6 6l4 4M10 6l-4 4" stroke="#C4372B" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function ResultadoContenido() {
  const router = useRouter();
  const params = useSearchParams();
  const estado = params.get("estado") ?? "pending";
  const info = CONTENIDO[estado] ?? CONTENIDO.pending;

  return (
    <div className="min-h-screen flex items-center justify-center px-5 bg-ys-bg">
      <div className="w-full max-w-[420px] bg-white border border-ys-border rounded-2xl px-6 py-8 flex flex-col items-center gap-4 text-center">
        <div className="w-14 h-14 rounded-full bg-ys-el2 flex items-center justify-center">
          <Icono tipo={info.icono} />
        </div>
        <div className="text-[17px] font-extrabold text-ys-text leading-[1.3]">
          {info.titulo}
        </div>
        <div className="text-[13.5px] text-ys-muted font-medium leading-[1.55]">
          {info.texto}
        </div>
        <button
          onClick={() => router.push("/panel")}
          className="mt-2 w-full rounded-xl px-4 py-3 text-[14px] font-bold bg-ys-green text-white hover:opacity-90 transition-opacity"
        >
          Volver al panel
        </button>
      </div>
    </div>
  );
}

export default function ResultadoCompraCreditosPage() {
  return (
    <Suspense fallback={null}>
      <ResultadoContenido />
    </Suspense>
  );
}
