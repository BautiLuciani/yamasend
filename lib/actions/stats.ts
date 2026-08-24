"use server";

import { createClient } from "@/lib/supabase/server";
import type { DashboardPeriodo, DashboardStats, VolumenBarra } from "@/lib/types";

const DIAS_CORTOS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

/**
 * Rango [desde, hasta) del período actual y del período anterior de igual
 * longitud (para calcular deltas), en base al período seleccionado en el
 * switch del Dashboard.
 *
 * - "7d": últimos 7 días corridos (hoy incluido). Se eligió por sobre la
 *   semana calendario porque esta última deja la mayoría de los días de
 *   la semana sin datos (barras vacías a futuro) según qué día sea hoy.
 * - "30d": últimos 30 días corridos.
 * - "ano": últimos 12 meses corridos.
 */
function resolverRangos(periodo: DashboardPeriodo) {
  const ahora = new Date();
  const hasta = new Date(ahora);
  hasta.setHours(23, 59, 59, 999);

  const desde = new Date(hasta);
  if (periodo === "7d") {
    desde.setDate(desde.getDate() - 6);
  } else if (periodo === "30d") {
    desde.setDate(desde.getDate() - 29);
  } else {
    desde.setMonth(desde.getMonth() - 11);
  }
  desde.setHours(0, 0, 0, 0);

  const duracionMs = hasta.getTime() - desde.getTime();
  const hastaAnterior = new Date(desde.getTime() - 1);
  const desdeAnterior = new Date(hastaAnterior.getTime() - duracionMs);

  return { desde, hasta, desdeAnterior, hastaAnterior };
}

/** Etiquetas y límites de cada barra del gráfico, según el período. */
function resolverBuckets(periodo: DashboardPeriodo, desde: Date, hasta: Date): { label: string; desde: Date; hasta: Date }[] {
  const buckets: { label: string; desde: Date; hasta: Date }[] = [];

  if (periodo === "7d") {
    for (let i = 0; i < 7; i++) {
      const dia = new Date(desde);
      dia.setDate(dia.getDate() + i);
      const finDia = new Date(dia);
      finDia.setHours(23, 59, 59, 999);
      buckets.push({ label: DIAS_CORTOS[dia.getDay()], desde: dia, hasta: finDia });
    }
    return buckets;
  }

  if (periodo === "30d") {
    // 5 buckets de ~6 días cada uno, para que se lea como "Sem 1..Sem 5"
    // sin saturar el ancho de la card con 30 barras.
    const totalDias = 30;
    const semanas = 5;
    const diasPorSemana = totalDias / semanas;
    for (let i = 0; i < semanas; i++) {
      const inicio = new Date(desde);
      inicio.setDate(inicio.getDate() + i * diasPorSemana);
      const fin = new Date(inicio);
      fin.setDate(fin.getDate() + diasPorSemana - 1);
      fin.setHours(23, 59, 59, 999);
      buckets.push({ label: `Sem ${i + 1}`, desde: inicio, hasta: fin });
    }
    return buckets;
  }

  // "ano": 12 buckets mensuales
  const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
  for (let i = 0; i < 12; i++) {
    const inicio = new Date(desde.getFullYear(), desde.getMonth() + i, 1);
    const finMes = new Date(desde.getFullYear(), desde.getMonth() + i + 1, 0, 23, 59, 59, 999);
    // El último bucket (mes en curso) no debe exceder "hasta" — si no, se
    // contarían días que todavía no pasaron dentro del rango consultado.
    const fin = finMes.getTime() > hasta.getTime() ? hasta : finMes;
    buckets.push({ label: MESES[inicio.getMonth()], desde: inicio, hasta: fin });
  }
  return buckets;
}

function pctDelta(actual: number, anterior: number): number | null {
  if (anterior === 0) return actual > 0 ? null : 0;
  return ((actual - anterior) / anterior) * 100;
}

/**
 * Estadísticas reales para el Dashboard: gráfico "Volumen de envíos" +
 * los 3 KPIs derivados de datos (mensajes enviados, tasa de entrega,
 * leads calificados por IA). "Créditos disponibles" queda fuera —
 * depende de un feature de billing todavía no implementado.
 *
 * send_time no se está poblando en yamas_send_mensajes hoy (ver nota en
 * getCampaignDetailAction), así que se usa created_at como aproximación
 * del momento de envío, igual que ya hace el resto de la app.
 */
export async function getDashboardStatsAction(
  tenantId: string,
  periodo: DashboardPeriodo,
): Promise<DashboardStats> {
  const supabase = await createClient();
  const { desde, hasta, desdeAnterior, hastaAnterior } = resolverRangos(periodo);
  const buckets = resolverBuckets(periodo, desde, hasta);

  const [mensajesActuales, mensajesAnteriores, leadsActuales, leadsAnteriores] = await Promise.all([
    supabase
      .from("yamas_send_mensajes")
      .select("status, created_at")
      .eq("tenant_id", tenantId)
      .gte("created_at", desde.toISOString())
      .lte("created_at", hasta.toISOString()),
    supabase
      .from("yamas_send_mensajes")
      .select("status", { count: "exact", head: false })
      .eq("tenant_id", tenantId)
      .gte("created_at", desdeAnterior.toISOString())
      .lte("created_at", hastaAnterior.toISOString()),
    supabase
      .from("yamas_send_leads")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .gte("fecha_analisis", desde.toISOString())
      .lte("fecha_analisis", hasta.toISOString()),
    supabase
      .from("yamas_send_leads")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .gte("fecha_analisis", desdeAnterior.toISOString())
      .lte("fecha_analisis", hastaAnterior.toISOString()),
  ]);

  const filasActuales = mensajesActuales.data ?? [];
  const filasAnteriores = mensajesAnteriores.data ?? [];

  const barras: VolumenBarra[] = buckets.map((b) => {
    let entregados = 0;
    let fallidos = 0;
    for (const m of filasActuales) {
      if (!m.created_at) continue;
      const t = new Date(m.created_at).getTime();
      if (t < b.desde.getTime() || t > b.hasta.getTime()) continue;
      if (m.status === "delivered" || m.status === "read") entregados++;
      else if (m.status === "failed") fallidos++;
    }
    return { label: b.label, entregados, fallidos };
  });

  const entregadosActuales = filasActuales.filter((m) => m.status === "delivered" || m.status === "read").length;
  const fallidosActuales = filasActuales.filter((m) => m.status === "failed").length;
  const entregadosAnteriores = filasAnteriores.filter((m) => m.status === "delivered" || m.status === "read").length;
  const fallidosAnteriores = filasAnteriores.filter((m) => m.status === "failed").length;

  const mensajesEnviados = filasActuales.length;
  const mensajesEnviadosAnterior = filasAnteriores.length;

  const confirmadosActuales = entregadosActuales + fallidosActuales;
  const confirmadosAnteriores = entregadosAnteriores + fallidosAnteriores;
  const tasaEntrega = confirmadosActuales > 0 ? (entregadosActuales / confirmadosActuales) * 100 : null;
  const tasaEntregaAnterior = confirmadosAnteriores > 0 ? (entregadosAnteriores / confirmadosAnteriores) * 100 : null;

  const leadsCalificados = leadsActuales.count ?? 0;
  const leadsCalificadosAnterior = leadsAnteriores.count ?? 0;

  return {
    barras,
    mensajesEnviados,
    mensajesEnviadosDeltaPct: pctDelta(mensajesEnviados, mensajesEnviadosAnterior),
    tasaEntrega,
    tasaEntregaDeltaPts: tasaEntrega !== null && tasaEntregaAnterior !== null ? tasaEntrega - tasaEntregaAnterior : null,
    leadsCalificados,
    leadsCalificadosDelta: leadsCalificados - leadsCalificadosAnterior,
  };
}
