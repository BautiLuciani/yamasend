"use client";

import type { LineaSalud, Semaforo } from "@/lib/types";
import { SEMAFORO_LABEL, saludVencida } from "@/lib/linea_salud/riesgo";

const TONO: Record<Semaforo, { dot: string; text: string; bg: string; border: string }> = {
  VERDE: { dot: "bg-[#12b76a]", text: "text-ys-green-text", bg: "bg-[#d3f2e3]", border: "border-[#b4e6cc]" },
  AMARILLO: { dot: "bg-[#f79009]", text: "text-ys-warn-text", bg: "bg-ys-warn-bg", border: "border-[#f3d9a4]" },
  ROJO: { dot: "bg-[#d92d20]", text: "text-ys-red-text", bg: "bg-ys-red-bg", border: "border-[#f4b9b3]" },
};

function hace(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const min = Math.round((Date.now() - t) / 60000);
  if (min < 2) return "recién";
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 48) return `hace ${h} h`;
  return `hace ${Math.round(h / 24)} días`;
}

function pct(v: number | null): string {
  return v === null ? "—" : `${v}%`;
}

/**
 * Estado de la línea de WhatsApp del tenant, arriba de la lista de campañas.
 * Es la misma información que frena los envíos en el server (ROJO), así que
 * el usuario ve el porqué antes de tocar "Nueva campaña".
 */
export default function LineaSaludBanner({ salud }: { salud: LineaSalud | null }) {
  if (!salud) {
    return (
      <div className="flex items-start gap-3 rounded-[14px] border border-ys-border bg-ys-el2 px-4 py-3 text-[13px] font-semibold text-ys-muted">
        <span className="mt-1.5 inline-block h-2.5 w-2.5 flex-none rounded-full bg-ys-faint" aria-hidden="true" />
        <span>Todavía no tenemos un chequeo de salud de tu línea de WhatsApp. Se hace dos veces por día hábil.</span>
      </div>
    );
  }

  const t = TONO[salud.semaforo];
  const vencida = saludVencida(salud);
  const linea = salud.lineas[0];

  return (
    <div className={`flex flex-col gap-2 rounded-[14px] border ${t.border} ${t.bg} px-4 py-3`} role={salud.semaforo === "ROJO" ? "alert" : "status"}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="inline-flex items-center gap-2">
          <span className={`inline-block h-2.5 w-2.5 rounded-full ${t.dot}`} aria-hidden="true" />
          <span className={`text-sm font-extrabold ${t.text}`}>{SEMAFORO_LABEL[salud.semaforo]}</span>
        </span>
        <span className="text-xs font-semibold text-ys-muted">
          {linea ? `${linea.tel} · calidad ${linea.calidad.toLowerCase()} · ${linea.estado.toLowerCase()}` : "sin línea"}
          {salud.saldoUsd !== null ? ` · saldo USD ${salud.saldoUsd.toFixed(2)}` : ""}
          {" · "}
          {vencida ? `chequeo viejo (${hace(salud.checkedAt)})` : `actualizado ${hace(salud.checkedAt)}`}
        </span>
      </div>

      {salud.muestra ? (
        <p className="m-0 text-xs font-semibold text-ys-muted">
          Últimos {salud.muestra} mensajes: {pct(salud.entregadosPct)} entregados, {pct(salud.leidosPct)} leídos, {pct(salud.fallidosPct)} fallidos.
        </p>
      ) : null}

      {salud.motivos.length > 0 && (
        <ul className={`m-0 list-disc pl-5 text-[13px] font-semibold ${t.text}`}>
          {salud.motivos.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
      )}
      {salud.avisos.length > 0 && (
        <ul className="m-0 list-disc pl-5 text-xs font-semibold text-ys-muted">
          {salud.avisos.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      )}
      {salud.semaforo === "ROJO" && (
        <p className={`m-0 text-[13px] font-semibold ${t.text}`}>
          Los envíos quedan frenados para proteger la línea. Se reanudan solos cuando el próximo chequeo la dé por recuperada.
        </p>
      )}
    </div>
  );
}
