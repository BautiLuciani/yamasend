"use server";

import { createClient } from "@/lib/supabase/server";
import type { LineaSalud, Semaforo } from "@/lib/types";
import { mensajeBloqueoSalud, saludBloqueaEnvios } from "@/lib/linea_salud/riesgo";

type Fila = {
  semaforo: string;
  motivos: unknown;
  avisos: unknown;
  saldo_usd: number | string | null;
  lineas: unknown;
  muestra: number | null;
  entregados_pct: number | string | null;
  leidos_pct: number | string | null;
  fallidos_pct: number | string | null;
  checked_at: string;
};

function textos(v: unknown): string[] {
  return Array.isArray(v) ? v.map((x) => String(x)) : [];
}

function numero(v: number | string | null): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function mapear(r: Fila): LineaSalud {
  const sem = ["VERDE", "AMARILLO", "ROJO"].includes(r.semaforo) ? (r.semaforo as Semaforo) : "ROJO";
  const lineas = Array.isArray(r.lineas)
    ? (r.lineas as Record<string, unknown>[]).map((l) => ({
        tel: String(l.tel ?? ""),
        calidad: String(l.calidad ?? ""),
        estado: String(l.estado ?? ""),
        limite: String(l.limite ?? ""),
      }))
    : [];
  return {
    semaforo: sem,
    motivos: textos(r.motivos),
    avisos: textos(r.avisos),
    saldoUsd: numero(r.saldo_usd),
    lineas,
    muestra: r.muestra ?? null,
    entregadosPct: numero(r.entregados_pct),
    leidosPct: numero(r.leidos_pct),
    fallidosPct: numero(r.fallidos_pct),
    checkedAt: r.checked_at,
  };
}

/**
 * Último chequeo de salud de la línea del tenant. null si todavía no corrió
 * ninguno (tenant nuevo) o si falló la lectura: en ese caso la app no bloquea
 * nada, porque no tiene con qué.
 */
export async function getLineaSaludAction(tenantId: string): Promise<LineaSalud | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("yamas_send_linea_salud")
    .select("semaforo, motivos, avisos, saldo_usd, lineas, muestra, entregados_pct, leidos_pct, fallidos_pct, checked_at")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (error || !data) return null;
  return mapear(data as Fila);
}

/**
 * Gate de salud para crear o enviar campañas. Devuelve el texto de error si la
 * línea está en ROJO, o null si se puede seguir. Se usa en saveCampaignAction y
 * sendCampaignAction (el cliente solo esconde botones; el bloqueo real es
 * este). Si no hay chequeo guardado no bloquea: el workflow de envío tiene el
 * mismo gate y es la última barrera.
 */
export async function bloqueoPorSaludLinea(tenantId: string): Promise<string | null> {
  const salud = await getLineaSaludAction(tenantId);
  if (!saludBloqueaEnvios(salud) || !salud) return null;
  return mensajeBloqueoSalud(salud);
}
