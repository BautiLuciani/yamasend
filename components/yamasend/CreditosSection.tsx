"use client";

import { useEffect, useState } from "react";
import { getMisCreditosAction, type MisCreditos } from "@/lib/actions/creditos";
import PacksCompra from "./PacksCompra";

/**
 * Sección "Créditos" de Mi Perfil.
 *
 * Vive en su propio archivo y no dentro de MyProfileModal porque ese archivo ya
 * pasa las 750 líneas y esto es una pantalla entera con su propia carga de
 * datos.
 *
 * Los textos van en español directo, igual que EmpresaEmpleadosSection: las
 * secciones nuevas de la app dejaron de pasar por LangContext y mezclarlos
 * dejaría media pantalla traducida y la otra media no.
 */

/** Los montos ya vienen calculados del servidor; acá solo se les da formato. */
function pesos(n: number): string {
  return n.toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function numero(n: number): string {
  return n.toLocaleString("es-AR");
}

function Metrica({
  label,
  valor,
  ayuda,
}: {
  label: string;
  valor: number;
  ayuda?: string;
}) {
  return (
    <div className="flex flex-col gap-0.5 min-w-0">
      <div className="font-mono text-[17px] font-medium tracking-[-0.02em] text-ys-text">
        {numero(valor)}
      </div>
      <div className="text-[11.5px] text-ys-muted font-semibold truncate">{label}</div>
      {ayuda && <div className="text-[11px] text-ys-dimmer leading-[1.4]">{ayuda}</div>}
    </div>
  );
}

export default function CreditosSection() {
  const [datos, setDatos] = useState<MisCreditos | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let vivo = true;
    getMisCreditosAction()
      .then((d) => {
        if (vivo) {
          setDatos(d);
          setCargando(false);
        }
      })
      .catch(() => {
        if (vivo) setCargando(false);
      });
    return () => {
      vivo = false;
    };
  }, []);

  if (cargando) {
    return (
      <div className="flex-1 flex items-center justify-center py-10">
        <div className="text-[13px] text-ys-muted font-medium">Cargando tus créditos…</div>
      </div>
    );
  }

  if (!datos) {
    return (
      <div className="flex-1 flex items-center justify-center py-10">
        <div className="text-[13px] text-ys-muted font-medium text-center max-w-[300px]">
          No pudimos cargar tus créditos. Probá cerrar y volver a abrir esta ventana.
        </div>
      </div>
    );
  }

  const precios = datos.precios;

  return (
    <div className="flex flex-col gap-5">
      {/* Saldo */}
      <div className="bg-white border border-ys-green-border rounded-2xl px-5 py-[18px] flex flex-col gap-4">
        <div className="flex items-end justify-between gap-3 flex-wrap">
          <div className="flex flex-col gap-0.5 min-w-0">
            <div className="font-mono text-[30px] leading-none font-medium tracking-[-0.03em] text-ys-text">
              {numero(datos.disponible)}
            </div>
            <div className="text-[12.5px] text-ys-muted font-semibold">
              Créditos disponibles
            </div>
          </div>
          <div className="text-[12px] text-ys-dimmer font-medium">
            1 crédito = 1 mensaje enviado
          </div>
        </div>

        <div className="h-px bg-ys-border-softest" />

        <div className="grid grid-cols-3 gap-3">
          <Metrica label="Cargados" valor={datos.asignados} />
          <Metrica label="Usados" valor={datos.usados} />
          <Metrica
            label="Reservados"
            valor={datos.reservados}
            ayuda={
              datos.reservados > 0
                ? "Apartados para campañas programadas"
                : undefined
            }
          />
        </div>
      </div>

      {/* Empleado sin permiso de compra: los créditos se los asigna la empresa */}
      {datos.tieneEmpresa && !datos.puedeComprar && (
        <div className="border border-ys-border2 rounded-2xl px-5 py-4 bg-ys-el2">
          <div className="text-[13px] text-ys-muted font-medium leading-[1.55]">
            Tus créditos los administra tu empresa. Si necesitás más, pedíselos y te
            los asignan al instante.
          </div>
        </div>
      )}

      {/* Packs */}
      {datos.puedeComprar && (
        <div className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between gap-3 flex-wrap">
            <div className="text-[15px] font-extrabold text-ys-text">
              Comprar créditos
            </div>
            {precios && (
              <div className="text-[12px] text-ys-dimmer font-medium">
                {pesos(precios.precioUnitarioArs)} por crédito
              </div>
            )}
          </div>

          {!precios && (
            <div className="border border-dashed border-ys-border2 rounded-2xl px-5 py-6 text-center">
              <div className="text-[13px] text-ys-muted font-medium leading-[1.55]">
                {datos.errorPrecios ??
                  "No pudimos calcular el precio en este momento."}
              </div>
            </div>
          )}

          {precios && (
            <PacksCompra packs={precios.packs} habilitado={precios.habilitado} />
          )}
        </div>
      )}
    </div>
  );
}
