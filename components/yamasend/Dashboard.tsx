"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getRecentActivityAction } from "@/lib/actions/activity";
import { getCampaignInsightAction } from "@/lib/actions/write";
import { getDashboardStatsAction } from "@/lib/actions/stats";
import type {
  ActivityLogEntry,
  ActivityTipo,
  Campaign,
  CampaignStatus,
  DashboardPeriodo,
  DashboardStats,
} from "@/lib/types";

interface DashboardProps {
  userName: string;
  tenantId: string;
  campaigns: Campaign[];
  onViewAllCampaigns: () => void;
  onNewCampaign: () => void;
}

// Mismo mapeo de label/color por status que usa CampaignDetailModal, para
// que "Campañas recientes" del Dashboard se vea consistente con el resto
// de la app.
const ESTADO_CAMPANA: Record<
  CampaignStatus,
  { label: string; text: string; bg: string; stroke: string }
> = {
  borrador: { label: "BORRADOR", text: "text-[#5d6560]", bg: "bg-ys-el2", stroke: "#5d6560" },
  programada: { label: "PROGRAMADA", text: "text-[#3f4844]", bg: "bg-ys-el2", stroke: "#5d6560" },
  enviando: { label: "ENVIANDO", text: "text-ys-warn-text", bg: "bg-ys-warn-bg", stroke: "#8a5a00" },
  enviado: { label: "COMPLETADA", text: "text-ys-green-text", bg: "bg-ys-green-bg", stroke: "#067647" },
  error: { label: "ERROR", text: "text-[#a8443b]", bg: "bg-[#fdeeec]", stroke: "#a8443b" },
  cancelado: { label: "CANCELADO", text: "text-[#5d6560]", bg: "bg-ys-el2", stroke: "#5d6560" },
};

function formatFechaCorta(iso: string): string {
  return new Date(iso).toLocaleString("es-AR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Formatea un delta (variación % o en puntos) para los KPI cards, con
// signo explícito. null significa "no hay datos del período anterior
// para comparar" (ej. tenant nuevo).
function formatDelta(valor: number | null, sufijo: string = "%"): { texto: string; negativo: boolean } {
  if (valor === null) return { texto: "Sin datos previos", negativo: false };
  const signo = valor > 0 ? "+" : "";
  const texto = `${signo}${valor.toLocaleString("es-AR", { maximumFractionDigits: 1 })}${sufijo}`;
  return { texto, negativo: valor < 0 };
}

// Línea de detalle bajo el nombre de la campaña: si está programada (a
// futuro) muestra la fecha objetivo, igual que hacía el mock; para el
// resto de los estados muestra audiencia + contactos, ya que el listado
// liviano de campañas no trae mensajes_ok/mensajes_error/respuestas (esos
// números solo están en el detalle ampliado, pedido on-demand).
function detalleCampana(c: Campaign): string {
  if (c.status === "programada" && c.fechaProgramada) {
    return `Programada para ${formatFechaCorta(c.fechaProgramada)}`;
  }
  const audiencia = c.listaNombre ?? "Sin audiencia";
  const contactos = `${c.contactosCount} contacto${c.contactosCount === 1 ? "" : "s"}`;
  return `${audiencia} · ${contactos}`;
}

// Configuración visual por tipo de actividad: ícono + color de fondo/trazo,
// para que la card "Actividad reciente" distinga de un vistazo qué pasó,
// igual que EstadoBadge hace con las campañas.
const ACTIVITY_STYLES: Record<
  ActivityTipo,
  { bg: string; stroke: string }
> = {
  contactos_importados: { bg: "bg-[#e8f1fd]", stroke: "#2563eb" },
  grupo_creado: { bg: "bg-ys-green-bg", stroke: "#12B76A" },
  grupo_editado: { bg: "bg-ys-el2", stroke: "#5d6560" },
  grupo_eliminado: { bg: "bg-ys-warn-bg", stroke: "#b42318" },
  template_creado: { bg: "bg-ys-green-bg", stroke: "#12B76A" },
  template_estado: { bg: "bg-ys-el2", stroke: "#5d6560" },
  campana_creada: { bg: "bg-ys-green-bg", stroke: "#12B76A" },
  campana_duplicada: { bg: "bg-ys-el2", stroke: "#5d6560" },
  campana_eliminada: { bg: "bg-ys-warn-bg", stroke: "#b42318" },
  campana_completada: { bg: "bg-ys-green-bg", stroke: "#12B76A" },
  ia_analisis: { bg: "bg-ys-dark", stroke: "#3ddb8f" },
  whatsapp_conectado: { bg: "bg-ys-green-bg", stroke: "#12B76A" },
  whatsapp_desconectado: { bg: "bg-ys-warn-bg", stroke: "#b42318" },
};

function ActivityIcon({ tipo }: { tipo: ActivityTipo }) {
  const stroke = ACTIVITY_STYLES[tipo].stroke;

  switch (tipo) {
    case "contactos_importados":
      return (
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
          <circle cx="5.5" cy="5" r="2.2" stroke={stroke} strokeWidth="1.4" />
          <path d="M1.8 13c.4-2.4 1.9-3.6 3.7-3.6s3.3 1.2 3.7 3.6" stroke={stroke} strokeWidth="1.4" strokeLinecap="round" />
          <circle cx="11.2" cy="5.6" r="1.7" stroke={stroke} strokeWidth="1.3" />
          <path d="M9.5 13c.3-1.9 1.4-2.9 2.9-2.9" stroke={stroke} strokeWidth="1.3" strokeLinecap="round" />
        </svg>
      );
    case "grupo_creado":
    case "grupo_editado":
    case "grupo_eliminado":
      return (
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
          <path d="M2 4.5A1.5 1.5 0 0 1 3.5 3h2.6l1.2 1.6h5.2A1.5 1.5 0 0 1 14 6.1v5.4A1.5 1.5 0 0 1 12.5 13h-9A1.5 1.5 0 0 1 2 11.5v-7Z" stroke={stroke} strokeWidth="1.4" strokeLinejoin="round" />
        </svg>
      );
    case "template_creado":
    case "template_estado":
      return (
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
          <path d="M4 2.5h5.5L12 5v8.5a.8.8 0 0 1-.8.8H4a.8.8 0 0 1-.8-.8V3.3a.8.8 0 0 1 .8-.8Z" stroke={stroke} strokeWidth="1.4" strokeLinejoin="round" />
          <path d="M5.8 7h4.4M5.8 9.4h4.4" stroke={stroke} strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      );
    case "campana_creada":
    case "campana_duplicada":
    case "campana_eliminada":
    case "campana_completada":
      return (
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
          <path d="M2.5 6.5v3l7 3.5v-10l-7 3.5Z" stroke={stroke} strokeWidth="1.4" strokeLinejoin="round" />
          <path d="M12 6v4" stroke={stroke} strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      );
    case "ia_analisis":
      return (
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" style={{ animation: "ys-spark 3.2s ease-in-out infinite" }}>
          <path d="m8 2 1.6 3.6L13 7l-3.4 1.4L8 12 6.4 8.4 3 7l3.4-1.4L8 2Z" stroke={stroke} strokeWidth="1.3" strokeLinejoin="round" />
        </svg>
      );
    case "whatsapp_conectado":
    case "whatsapp_desconectado":
      return (
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
          <path d="M8 2.2a5.6 5.6 0 0 0-4.8 8.5L2.3 13.7l3.1-.9A5.6 5.6 0 1 0 8 2.2Z" stroke={stroke} strokeWidth="1.3" strokeLinejoin="round" />
          <path d="M5.9 6.6c-.1.9.6 2.2 1.5 3.1.9.9 2.2 1.6 3.1 1.5.4 0 1-.5 1.1-.9.1-.2 0-.4-.1-.5l-1.2-.9c-.2-.1-.4-.1-.5 0l-.4.4c-.5-.2-1-.6-1.4-1s-.8-.9-1-1.4l.4-.4c.1-.1.1-.3 0-.5l-.9-1.2c-.1-.1-.3-.2-.5-.1-.4.1-.9.6-1.1.9Z" stroke={stroke} strokeWidth="1.1" strokeLinejoin="round" />
        </svg>
      );
    default:
      return (
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="8" r="3" stroke={stroke} strokeWidth="1.4" />
        </svg>
      );
  }
}

// Formatea el timestamp como "hace X min/h" o fecha corta si es de otro día,
// siguiendo el mismo estilo compacto que ya usaba el mock ("12 min", "Ayer").
function formatearCuando(iso: string): string {
  const fecha = new Date(iso);
  const ahoraMs = Date.now();
  const diffMs = ahoraMs - fecha.getTime();
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 1) return "Ahora";
  if (diffMin < 60) return `${diffMin} min`;

  const diffHoras = Math.floor(diffMin / 60);
  if (diffHoras < 24) return `${diffHoras} h`;

  const hoy = new Date();
  const esAyer =
    fecha.getDate() === hoy.getDate() - 1 &&
    fecha.getMonth() === hoy.getMonth() &&
    fecha.getFullYear() === hoy.getFullYear();

  if (esAyer) return "Ayer";

  return fecha.toLocaleDateString("es-AR", { day: "2-digit", month: "short" });
}

function EstadoBadge({ estado, textClass, bgClass }: { estado: string; textClass: string; bgClass: string }) {
  return (
    <div className={`font-mono text-[11px] rounded-md px-[9px] py-[5px] ${textClass} ${bgClass}`}>
      {estado}
    </div>
  );
}

export default function Dashboard({ userName, tenantId, campaigns, onViewAllCampaigns, onNewCampaign }: DashboardProps) {
  const [periodo, setPeriodo] = useState<DashboardPeriodo>("7d");
  const [actividad, setActividad] = useState<ActivityLogEntry[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  // Período al que corresponden los datos actualmente en `stats`. Mientras
  // no coincida con `periodo` (o mientras stats sea null), se considera
  // "cargando" — evita un setState síncrono al inicio del efecto (que
  // dispara cascading renders) solo para prender un flag de loading.
  const [statsPeriodo, setStatsPeriodo] = useState<DashboardPeriodo | null>(null);
  const statsLoading = stats === null || statsPeriodo !== periodo;
  const firstName = userName.split(" ")[0] || userName;

  // Refetch de estadísticas cada vez que cambia el período seleccionado en
  // el switch (7 días / 30 días / año). Trae tanto el gráfico "Volumen de
  // envíos" como los 3 KPIs derivados de datos (mensajes enviados, tasa de
  // entrega, leads calificados por IA).
  useEffect(() => {
    let cancelado = false;

    getDashboardStatsAction(tenantId, periodo).then((result) => {
      if (!cancelado) {
        setStats(result);
        setStatsPeriodo(periodo);
      }
    });

    return () => {
      cancelado = true;
    };
  }, [tenantId, periodo]);

  // Ordena por el timestamp más relevante de cada campaña (enviado_at si ya
  // se envió, si no created_at) para que una campaña recién completada
  // salte al frente aunque se haya creado hace rato — el estado en
  // AppShell actualiza in-place vía Realtime y no reordena por sí solo.
  const campanasRecientes = [...campaigns]
    .sort((a, b) => {
      const fechaA = new Date(a.enviadoAt ?? a.createdAt ?? 0).getTime();
      const fechaB = new Date(b.enviadoAt ?? b.createdAt ?? 0).getTime();
      return fechaB - fechaA;
    })
    .slice(0, 5);

  // Carga inicial de las últimas 5 actividades vía Server Action.
  useEffect(() => {
    let cancelado = false;

    getRecentActivityAction(5).then((result) => {
      if (!cancelado && !result.error) {
        setActividad(result.activity);
      }
    });

    return () => {
      cancelado = true;
    };
  }, []);

  // Insight de IA sobre campañas: reutiliza getCampaignInsightAction, la
  // misma Server Action que ya usa el wizard de "Nueva campaña" — cacheada
  // en yamas_send_insights_cache (1 por tenant por día), así que esta
  // llamada no dispara un nuevo análisis salvo que no haya cache vigente.
  const [insight, setInsight] = useState<string | null>(null);
  const [insightLoading, setInsightLoading] = useState(true);

  useEffect(() => {
    let cancelado = false;

    getCampaignInsightAction().then((result) => {
      if (!cancelado) {
        setInsight(result.insight);
        setInsightLoading(false);
      }
    });

    return () => {
      cancelado = true;
    };
  }, []);

  // Suscripción en tiempo real: cualquier INSERT nuevo en
  // yamas_send_activity_log para este tenant se antepone a la lista sin
  // necesidad de refrescar la página, recortando siempre a las últimas 5.
  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel(`activity-log-${tenantId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "yamas_send_activity_log",
          filter: `tenant_id=eq.${tenantId}`,
        },
        (payload) => {
          const nueva = payload.new as {
            id: string;
            tipo: ActivityTipo;
            descripcion: string;
            created_at: string;
          };
          setActividad((prev) => [
            {
              id: nueva.id,
              tipo: nueva.tipo,
              descripcion: nueva.descripcion,
              createdAt: nueva.created_at,
            },
            ...prev,
          ].slice(0, 5));
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [tenantId]);

  return (
    <div className="flex-1 min-w-0 bg-ys-bg px-4 md:px-[38px] pt-3 md:pt-[34px] pb-7 md:pb-10 flex flex-col gap-5 md:gap-6 overflow-y-auto">
      <div className="flex items-end gap-5 flex-wrap">
        <div className="flex flex-col gap-1.5">
          <div className="text-2xl md:text-[28px] font-extrabold tracking-[-0.025em] text-ys-text">
            Hola, {firstName}
          </div>
          <div className="text-sm md:text-[15px] text-ys-muted font-medium">
            Así viene tu actividad de mensajería.
          </div>
        </div>
        <div className="ml-auto flex items-center gap-3 flex-wrap w-full md:w-auto">
          <div className="flex gap-[3px] bg-ys-el2 rounded-[10px] p-[3px] w-full md:w-auto">
            {(
              [
                { key: "7d", label: "7 días" },
                { key: "30d", label: "30 días" },
                { key: "ano", label: "Año" },
              ] as const
            ).map((p) => (
              <button
                key={p.key}
                onClick={() => setPeriodo(p.key)}
                className={`flex-1 md:flex-none text-[13px] rounded-lg px-[15px] py-[7px] cursor-pointer transition-colors ${
                  periodo === p.key
                    ? "font-bold text-ys-text bg-white shadow-[0_1px_2px_rgba(16,24,20,0.07)]"
                    : "font-semibold text-[#7b837e]"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <button
            onClick={onNewCampaign}
            className="w-full md:w-auto justify-center flex items-center gap-2 bg-ys-green text-white text-[13.5px] font-bold px-[17px] py-[11px] rounded-[10px] cursor-pointer shadow-[var(--shadow-cta)] hover:brightness-95 transition"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M8 3v10M3 8h10" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" />
            </svg>
            Nueva campaña
          </button>
        </div>
      </div>

      {/* 4 cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        <KpiCard
          icon={
            <svg width="19" height="19" viewBox="0 0 16 16" fill="none">
              <path d="M14 2 7 9M14 2l-4.5 12L7 9 2 6.5 14 2Z" stroke="#12B76A" strokeWidth="1.5" strokeLinejoin="round" />
            </svg>
          }
          value={statsLoading ? "…" : (stats?.mensajesEnviados ?? 0).toLocaleString("es-AR")}
          label="Mensajes enviados"
          delta={statsLoading ? "" : formatDelta(stats?.mensajesEnviadosDeltaPct ?? null).texto}
          deltaNegativo={!statsLoading && formatDelta(stats?.mensajesEnviadosDeltaPct ?? null).negativo}
        />
        <KpiCard
          icon={
            <svg width="19" height="19" viewBox="0 0 16 16" fill="none">
              <path d="m1.5 8.5 3 3 5-6M7 11.5l1 1 6.5-7.5" stroke="#12B76A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          }
          value={
            statsLoading
              ? "…"
              : stats?.tasaEntrega !== null && stats?.tasaEntrega !== undefined
                ? `${stats.tasaEntrega.toLocaleString("es-AR", { maximumFractionDigits: 1 })}%`
                : "—"
          }
          label="Tasa de entrega"
          delta={statsLoading ? "" : formatDelta(stats?.tasaEntregaDeltaPts ?? null, " pts").texto}
          deltaNegativo={!statsLoading && formatDelta(stats?.tasaEntregaDeltaPts ?? null).negativo}
        />
        <KpiCard
          dark
          icon={
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none" style={{ animation: "ys-spark 3.2s ease-in-out infinite" }}>
              <path d="m8 2 1.6 3.6L13 7l-3.4 1.4L8 12 6.4 8.4 3 7l3.4-1.4L8 2Z" stroke="#3ddb8f" strokeWidth="1.4" strokeLinejoin="round" />
            </svg>
          }
          value={statsLoading ? "…" : (stats?.leadsCalificados ?? 0).toLocaleString("es-AR")}
          label="Leads calificados por IA"
          delta={
            statsLoading
              ? ""
              : stats?.leadsCalificadosDelta !== null && stats?.leadsCalificadosDelta !== undefined
                ? `${stats.leadsCalificadosDelta >= 0 ? "+" : ""}${stats.leadsCalificadosDelta} este período`
                : "Sin datos previos"
          }
          deltaNegativo={!statsLoading && (stats?.leadsCalificadosDelta ?? 0) < 0}
        />
        <div className="bg-white border border-ys-green-border rounded-2xl px-5 py-[18px] flex flex-col gap-3 transition-all hover:-translate-y-0.5 hover:shadow-[var(--shadow-card)]">
          <div className="flex items-center gap-[13px]">
            <div className="w-10 h-10 flex-none rounded-[13px] bg-ys-green-bg flex items-center justify-center">
              <svg width="19" height="19" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="5.5" stroke="#12B76A" strokeWidth="1.5" />
                <path d="M8 4.8v6.4M6.3 6.4h3.1a1.3 1.3 0 0 1 0 2.6H6.6a1.3 1.3 0 0 0 0 2.6h3.1" stroke="#12B76A" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
            </div>
            <div className="flex flex-col gap-0.5 min-w-0">
              <div className="flex items-baseline gap-1.5 flex-wrap">
                <div className="font-mono text-xl md:text-2xl font-medium tracking-[-0.03em] text-ys-text">3.200</div>
                <div className="font-mono text-xs md:text-[13px] text-ys-dimmer">/ 50.000</div>
              </div>
              <div className="text-[12.5px] text-ys-muted font-semibold truncate">Créditos disponibles</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex-1 h-[5px] rounded-sm bg-ys-border-softest overflow-hidden">
              <div className="h-full bg-ys-green rounded-sm" style={{ width: "6.4%" }} />
            </div>
            <button
              disabled
              title="Disponible próximamente"
              className="text-[12.5px] font-bold text-ys-green-text whitespace-nowrap cursor-not-allowed opacity-70"
            >
              Comprar créditos
            </button>
          </div>
        </div>
      </div>

      {/* Gráfico + Insight */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.85fr_1fr] gap-[18px] items-start">
        <div className="bg-white border border-ys-border rounded-2xl px-5 md:px-6 pt-5 pb-[18px] flex flex-col gap-5">
          <div className="flex items-center justify-between">
            <div className="text-[15px] font-extrabold text-ys-text">Volumen de envíos</div>
            <div className="flex items-center gap-4 text-[11.5px] font-semibold text-[#7b837e]">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-sm bg-ys-green" />
                Entregados
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-sm bg-ys-border-softest" />
                Fallidos
              </span>
            </div>
          </div>
          {statsLoading ? (
            <div className="overflow-x-auto -mx-5 md:mx-0 px-5 md:px-0">
              <div className="flex items-end gap-3 md:gap-4 h-[172px] min-w-max md:min-w-0">
                {Array.from({ length: 7 }).map((_, i) => (
                  <div key={i} className="w-10 md:w-auto md:flex-1 flex flex-col items-center gap-2.5">
                    <div className="w-full h-[140px] rounded-[3px] bg-ys-el2 animate-pulse" />
                    <div className="text-[11.5px] text-ys-dimmer font-medium">&nbsp;</div>
                  </div>
                ))}
              </div>
            </div>
          ) : !stats || stats.barras.every((b) => b.entregados === 0 && b.fallidos === 0) ? (
            <div className="h-[140px] flex items-center justify-center text-[13px] text-ys-dim font-medium">
              Todavía no hay envíos en este período.
            </div>
          ) : (
            <div className="overflow-x-auto -mx-5 md:mx-0 px-5 md:px-0">
              <div className="flex items-end gap-3 md:gap-4 h-[172px] min-w-max md:min-w-0">
                {(() => {
                  const maxTotal = Math.max(1, ...stats.barras.map((b) => b.entregados + b.fallidos));
                  return stats.barras.map((b, i) => {
                    const total = b.entregados + b.fallidos;
                    // Altura mínima visual (2px) para que una barra con datos
                    // no desaparezca del todo cuando el total es muy chico
                    // respecto al máximo del set.
                    const altoEntregados = b.entregados > 0 ? Math.max(2, (b.entregados / maxTotal) * 140) : 0;
                    const altoFallidos = b.fallidos > 0 ? Math.max(2, (b.fallidos / maxTotal) * 140) : 0;
                    return (
                      <div key={`${b.label}-${i}`} className="w-10 flex-none md:w-auto md:flex-1 flex flex-col items-center gap-2.5">
                        <div
                          className="w-full flex flex-col justify-end gap-0.5 h-[140px]"
                          style={{ animation: "ys-grow .6s cubic-bezier(.4,0,.2,1) both", transformOrigin: "bottom" }}
                          title={`${b.label}: ${b.entregados} entregados, ${b.fallidos} fallidos${total === 0 ? " (sin envíos)" : ""}`}
                        >
                          <div className="rounded-t-[3px] bg-ys-border-softest" style={{ height: `${altoFallidos}px` }} />
                          <div className="rounded-b-[3px] bg-ys-green" style={{ height: `${altoEntregados}px` }} />
                        </div>
                        <div className="text-[11.5px] text-ys-dimmer font-medium">{b.label}</div>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
          )}
        </div>

        <div className="bg-ys-dark rounded-2xl px-[22px] py-5 flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ animation: "ys-spark 3.2s ease-in-out infinite" }}>
              <path d="m8 2 1.6 3.6L13 7l-3.4 1.4L8 12 6.4 8.4 3 7l3.4-1.4L8 2Z" stroke="#12B76A" strokeWidth="1.5" strokeLinejoin="round" />
            </svg>
            <div className="text-[11px] font-extrabold tracking-[0.12em] uppercase text-ys-green">
              Insight de IA
            </div>
          </div>
          <div className="text-[14.5px] leading-[1.55] text-ys-border-softest font-semibold">
            {insightLoading
              ? "Analizando tus campañas…"
              : (insight ?? "Todavía no hay suficientes datos para generar un insight. Mandá algunas campañas y volvé a mirar acá.")}
          </div>
          <button
            disabled
            title="Disponible cuando se implemente Campañas"
            className="self-start mt-0.5 text-[12.5px] font-extrabold text-[#0b1310] bg-ys-green rounded-[9px] px-3.5 py-2.5 opacity-70 cursor-not-allowed"
          >
            Programar próxima campaña
          </button>
        </div>
      </div>

      {/* Campañas recientes + Actividad */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.85fr_1fr] gap-[18px] items-start">
        <div className="bg-white border border-ys-border rounded-2xl flex flex-col overflow-hidden">
          <div className="px-5 md:px-6 pt-[18px] pb-3.5 flex items-center justify-between">
            <div className="text-[15px] font-extrabold text-ys-text">Campañas recientes</div>
            <button
              onClick={onViewAllCampaigns}
              className="text-[12.5px] font-bold text-ys-green-text hover:underline cursor-pointer"
            >
              Ver todas →
            </button>
          </div>
          {campanasRecientes.length === 0 ? (
            <div className="px-5 md:px-6 py-6 text-[13px] text-ys-dim font-medium">
              Todavía no creaste ninguna campaña.
            </div>
          ) : (
            campanasRecientes.map((c) => {
              const estilo = ESTADO_CAMPANA[c.status];
              return (
                <div key={c.id} className="flex items-center gap-3.5 px-5 md:px-6 py-3.5 border-t border-ys-border-soft">
                  <div className={`w-9 h-9 flex-none rounded-[11px] flex items-center justify-center ${estilo.bg}`}>
                    <svg width="17" height="17" viewBox="0 0 16 16" fill="none">
                      <path
                        d="M2.5 6.5v3l7 3.5v-10l-7 3.5Z"
                        stroke={estilo.stroke}
                        strokeWidth="1.5"
                        strokeLinejoin="round"
                      />
                      <path d="M12 6v4" stroke={estilo.stroke} strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                    <div className="text-sm font-bold text-ys-text truncate">{c.nombre}</div>
                    <div className="text-[12.5px] text-ys-dim font-medium truncate">{detalleCampana(c)}</div>
                  </div>
                  <EstadoBadge estado={estilo.label} textClass={estilo.text} bgClass={estilo.bg} />
                </div>
              );
            })
          )}
        </div>

        <div className="bg-white border border-ys-border rounded-2xl px-5 md:px-[22px] pt-[18px] pb-5 flex flex-col gap-1.5">
          <div className="text-[15px] font-extrabold text-ys-text pb-1.5">Actividad reciente</div>
          {actividad.length === 0 ? (
            <div className="text-[13px] text-ys-dim font-medium py-3">
              Todavía no hay actividad registrada.
            </div>
          ) : (
            actividad.map((a) => (
              <div key={a.id} className="flex gap-3 py-[11px] border-t border-ys-border-softer">
                <div
                  className={`w-[26px] h-[26px] flex-none rounded-lg flex items-center justify-center ${ACTIVITY_STYLES[a.tipo].bg}`}
                >
                  <ActivityIcon tipo={a.tipo} />
                </div>
                <div className="flex flex-col gap-0.5">
                  <div className="text-[13px] font-semibold text-[#2c3531] leading-[1.45]">{a.descripcion}</div>
                  <div className="font-mono text-[11px] text-ys-dimmer">{formatearCuando(a.createdAt)}</div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function KpiCard({
  icon,
  value,
  label,
  delta,
  deltaNegativo = false,
  dark = false,
}: {
  icon: React.ReactNode;
  value: string;
  label: string;
  delta: string;
  deltaNegativo?: boolean;
  dark?: boolean;
}) {
  return (
    <div className="bg-white border border-ys-border rounded-2xl px-4 md:px-5 py-[18px] flex flex-col gap-3 transition-all hover:-translate-y-0.5 hover:shadow-[var(--shadow-card)]">
      <div className="flex items-center gap-[13px]">
        <div className={`w-10 h-10 flex-none rounded-[13px] flex items-center justify-center ${dark ? "bg-ys-dark" : "bg-ys-green-bg"}`}>
          {icon}
        </div>
        <div className="flex flex-col gap-0.5 min-w-0">
          <div className="font-mono text-xl md:text-2xl font-medium tracking-[-0.03em] text-ys-text">{value}</div>
          <div className="text-[12.5px] text-ys-muted font-semibold truncate">{label}</div>
        </div>
      </div>
      <div className={`text-[12.5px] font-bold ${deltaNegativo ? "text-[#a8443b]" : "text-ys-green-text"}`}>
        {delta} <span className="text-ys-dimmer font-medium">vs. período anterior</span>
      </div>
    </div>
  );
}
