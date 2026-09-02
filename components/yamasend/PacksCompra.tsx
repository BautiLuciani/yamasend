"use client";

import { useState } from "react";
import { iniciarCompraCreditosAction } from "@/lib/actions/creditos";
import type { PackPrecio } from "@/lib/creditos/precio";

/**
 * Grilla de packs con su precio y el botón de compra.
 *
 * Se comparte entre la sección Créditos de Mi Perfil (empleado / individual,
 * los créditos van a su saldo) y el modal de la cuenta empresa (van al pool).
 * La diferencia entre los dos casos es solo el texto: a qué destino van los
 * créditos lo decide la RPC según el rol de quien llama, nunca el cliente,
 * así que el mismo componente sirve para ambos sin poder equivocarse.
 */

function pesos(n: number): string {
  return n.toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function numero(n: number): string {
  return n.toLocaleString("es-AR");
}

export default function PacksCompra({
  packs,
  habilitado,
  paraPool = false,
}: {
  packs: PackPrecio[];
  /** false mientras el cobro esté apagado globalmente. */
  habilitado: boolean;
  /** true en la cuenta empresa: los créditos van al pool. */
  paraPool?: boolean;
}) {
  // Código del pack en curso, para bloquear solo ese botón mientras se crea la
  // preferencia y se redirige, y no los otros.
  const [comprando, setComprando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function comprar(codigo: string) {
    setError(null);
    setComprando(codigo);
    const res = await iniciarCompraCreditosAction(codigo);
    if (!res.ok || !res.initPoint) {
      setError(res.error ?? "No pudimos iniciar la compra.");
      setComprando(null);
      return;
    }
    // Redirección de página completa: Checkout Pro necesita salir del contexto
    // de la SPA, no es una navegación interna de Next.
    window.location.assign(res.initPoint);
  }

  return (
    // @container habilita que el grid de abajo reaccione al ancho real de
    // este contenedor y no al de la pantalla. Este componente vive en dos
    // lugares con anchos muy distintos: el panel ancho de Mi Perfil y el
    // modal angosto (440px) de la cuenta empresa. Con un breakpoint de
    // viewport (md:) las tres columnas se activaban en cualquier pantalla
    // desktop sin importar cuánto lugar hubiera de verdad, y en el modal
    // angosto eso apretaba el contenido hasta cortarlo.
    <div className="@container flex flex-col gap-3">
      <div className="grid grid-cols-1 @[560px]:grid-cols-2 @[820px]:grid-cols-3 gap-3">
        {packs.map((pack) => (
          <div
            key={pack.codigo}
            className={`relative flex flex-col gap-3 rounded-2xl px-4 py-4 border transition-all hover:-translate-y-0.5 hover:shadow-[var(--shadow-card)] ${
              pack.destacado
                ? "border-ys-green-border bg-ys-green-bg"
                : "border-ys-border bg-white"
            }`}
          >
            {pack.descuentoPct > 0 && (
              <div className="absolute top-3 right-3 text-[10.5px] font-extrabold text-ys-green-text bg-white border border-ys-green-border rounded-full px-2 py-0.5 whitespace-nowrap">
                -{Math.round(pack.descuentoPct)}%
              </div>
            )}

            <div className="flex flex-col gap-0.5 pr-14">
              <div className="text-[14px] font-extrabold text-ys-text truncate">
                {pack.nombre}
              </div>
              <div className="font-mono text-[13px] text-ys-muted">
                {numero(pack.creditos)} mensajes
              </div>
            </div>

            <div className="flex flex-col gap-0.5">
              <div className="flex items-baseline gap-1.5 flex-wrap">
                <div className="font-mono text-[20px] font-medium tracking-[-0.03em] text-ys-text">
                  ${pesos(pack.precioArs)}
                </div>
                {pack.descuentoPct > 0 && (
                  <div className="font-mono text-[12px] text-ys-dimmer line-through">
                    ${pesos(pack.precioSinDescuentoArs)}
                  </div>
                )}
              </div>
              <div className="text-[11.5px] text-ys-dimmer font-medium">
                {pesos(pack.precioUnitarioArs)} por crédito
              </div>
            </div>

            {pack.descripcion && (
              <div className="text-[12px] text-ys-muted font-medium leading-[1.45]">
                {pack.descripcion}
              </div>
            )}

            <button
              onClick={() => comprar(pack.codigo)}
              disabled={!habilitado || comprando !== null}
              title={!habilitado ? "Disponible muy pronto" : undefined}
              className={`mt-auto w-full rounded-xl px-3 py-2.5 text-[13px] font-bold transition-opacity ${
                !habilitado
                  ? "bg-ys-el2 text-ys-dimmer cursor-not-allowed"
                  : "bg-ys-green text-white hover:opacity-90 disabled:opacity-60 disabled:cursor-wait"
              }`}
            >
              {!habilitado
                ? "Próximamente"
                : comprando === pack.codigo
                  ? "Redirigiendo…"
                  : "Comprar"}
            </button>
          </div>
        ))}
      </div>

      {error && (
        <div className="text-[12.5px] text-red-600 font-semibold text-center">{error}</div>
      )}

      <div className="text-[11.5px] text-ys-dimmer font-medium leading-[1.5]">
        {paraPool
          ? "Los créditos entran al pool y los repartís entre tus empleados. "
          : ""}
        Los precios se actualizan solos según la cotización del día. Los créditos no
        vencen.
      </div>
    </div>
  );
}
