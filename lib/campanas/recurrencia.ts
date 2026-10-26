import type { RecurrenciaConfig } from "@/lib/types";

/**
 * Campañas recurrentes: lógica pura (sin red ni base) para describirlas y
 * validarlas. El cálculo de la próxima fecha vive en Postgres
 * (yamas_send_recurrente_proxima, docs/migraciones/2026-10-campanas-recurrentes.sql)
 * porque ahí corre el generador; acá solo se muestra.
 */

/** 1 = lunes … 7 = domingo (isodow de Postgres). */
export const DIAS_SEMANA: { n: number; corto: string; largo: string }[] = [
  { n: 1, corto: "L", largo: "lunes" },
  { n: 2, corto: "M", largo: "martes" },
  { n: 3, corto: "X", largo: "miércoles" },
  { n: 4, corto: "J", largo: "jueves" },
  { n: 5, corto: "V", largo: "viernes" },
  { n: 6, corto: "S", largo: "sábado" },
  { n: 7, corto: "D", largo: "domingo" },
];

export const RECURRENCIA_POR_DEFECTO: RecurrenciaConfig = {
  frecuencia: "semanal",
  diasSemana: [1],
  intervaloDias: 15,
  diaMes: 1,
  hora: "11:00",
  maxOcurrencias: null,
};

function listar(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} y ${items[items.length - 1]}`;
}

/** "Todos los lunes a las 11:00", "Cada 15 días a las 11:00", "El día 1 de cada mes a las 11:00". */
export function describirRecurrencia(c: RecurrenciaConfig): string {
  const hora = `a las ${c.hora}`;
  if (c.frecuencia === "semanal") {
    const dias = [...c.diasSemana]
      .sort((a, b) => a - b)
      .map((n) => DIAS_SEMANA.find((d) => d.n === n)?.largo)
      .filter((x): x is string => Boolean(x));
    if (dias.length === 0) return `Todas las semanas ${hora}`;
    if (dias.length === 7) return `Todos los días ${hora}`;
    // "Todos los lunes" / "Todos los lunes y jueves": plural de cada día.
    return `Todos los ${listar(dias.map((d) => (d.endsWith("s") ? d : `${d}s`)))} ${hora}`;
  }
  if (c.frecuencia === "cada_n_dias") {
    const n = c.intervaloDias ?? 0;
    return n === 1 ? `Todos los días ${hora}` : `Cada ${n} días ${hora}`;
  }
  return `El día ${c.diaMes ?? 1} de cada mes ${hora}`;
}

/** Devuelve el motivo si la configuración no es válida; null si se puede crear. */
export function validarRecurrencia(c: RecurrenciaConfig): string | null {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(c.hora)) return "Elegí una hora válida.";
  if (c.frecuencia === "semanal" && c.diasSemana.length === 0) return "Elegí al menos un día de la semana.";
  if (c.frecuencia === "cada_n_dias") {
    const n = c.intervaloDias;
    if (!n || !Number.isInteger(n) || n < 1 || n > 90) return "Cada cuántos días: un número entre 1 y 90.";
  }
  if (c.frecuencia === "mensual") {
    const d = c.diaMes;
    if (!d || !Number.isInteger(d) || d < 1 || d > 28) return "El día del mes tiene que estar entre 1 y 28.";
  }
  if (c.maxOcurrencias !== null && (!Number.isInteger(c.maxOcurrencias) || c.maxOcurrencias < 1 || c.maxOcurrencias > 365)) {
    return "La cantidad de repeticiones tiene que estar entre 1 y 365.";
  }
  return null;
}

/** "lunes 20/10, 11:00" para la próxima ejecución, en hora de Argentina. */
export function formatearProxima(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("es-AR", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Argentina/Buenos_Aires",
  });
}
