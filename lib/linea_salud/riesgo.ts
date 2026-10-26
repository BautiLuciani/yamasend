import type { LineaSalud, Semaforo } from "@/lib/types";

/**
 * Reglas de riesgo de la línea, compartidas por el server (gate de las
 * acciones) y el cliente (botones y banner). Sin "use server": es lógica pura.
 *
 * El chequeo corre dos veces por día hábil; si el último dato tiene más de
 * dos días se considera vencido: no bloquea (no sabemos nada nuevo), pero el
 * banner lo dice para que no se confíe en un verde viejo.
 */
export const SALUD_VENCIDA_MS = 48 * 60 * 60 * 1000;

export function saludVencida(salud: LineaSalud | null, ahora = Date.now()): boolean {
  if (!salud) return true;
  const t = new Date(salud.checkedAt).getTime();
  return Number.isNaN(t) || ahora - t > SALUD_VENCIDA_MS;
}

/** ROJO = no se crea ni se envía ninguna campaña. */
export function saludBloqueaEnvios(salud: LineaSalud | null): boolean {
  return salud?.semaforo === "ROJO";
}

/**
 * Texto para el usuario cuando la línea está en rojo. Sin códigos internos ni
 * nombres de tablas; los motivos vienen del chequeo en lenguaje llano.
 */
export function mensajeBloqueoSalud(salud: LineaSalud): string {
  const motivos = salud.motivos.length ? ` Motivo: ${salud.motivos.join("; ")}.` : "";
  return `Tu línea de WhatsApp está en riesgo y los envíos quedaron frenados para protegerla.${motivos} Cuando el próximo chequeo la dé por recuperada, vas a poder enviar de nuevo.`;
}

export const SEMAFORO_LABEL: Record<Semaforo, string> = {
  VERDE: "Línea en buen estado",
  AMARILLO: "Línea con avisos",
  ROJO: "Línea en riesgo: envíos frenados",
};
