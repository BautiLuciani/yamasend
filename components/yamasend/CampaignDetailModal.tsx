"use client";

import { useEffect, useState } from "react";
import type { CampaignDetail, CampaignStatus } from "@/lib/types";

interface CampaignDetailModalProps {
  campaignId: string | null;
  tenantId: string;
  onClose: () => void;
  onFetchDetail: (tenantId: string, campaignId: string) => Promise<CampaignDetail | null>;
  onFetchInsight: () => Promise<{ insight: string | null; error: string | null }>;
  onContinueDraft?: (campaignId: string) => void;
  onDuplicate?: (detail: CampaignDetail) => void;
  onDelete?: (campaignId: string) => Promise<{ error: string | null }>;
}

const ESTADO_BADGE: Record<
  CampaignStatus,
  { label: string; text: string; bg: string; dot: string; dotOutline?: boolean; pulse?: boolean }
> = {
  borrador: { label: "Borrador", text: "text-[#5d6560]", bg: "bg-[#f2f4f3]", dot: "border-[#8a908c]", dotOutline: true },
  programada: { label: "Programada", text: "text-[#3f4844]", bg: "bg-[#f2f4f3]", dot: "border-[#5d6560]", dotOutline: true },
  enviando: { label: "Enviando", text: "text-[#8a5a00]", bg: "bg-[#fdf5e6]", dot: "bg-[#c07a12]", pulse: true },
  enviado: { label: "Completada", text: "text-[#067647]", bg: "bg-[#ecf9f2]", dot: "bg-[#12B76A]" },
  error: { label: "Error", text: "text-[#a8443b]", bg: "bg-[#fdeeec]", dot: "bg-[#a8443b]" },
  cancelado: { label: "Cancelado", text: "text-[#5d6560]", bg: "bg-[#f2f4f3]", dot: "bg-[#8a908c]" },
};

function formatFechaHora(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function formatDuracion(min: number | null): string {
  if (min === null) return "—";
  if (min < 1) return "<1 min";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

function formatCreditos(costoUsd: number | null): string {
  if (costoUsd === null) return "—";
  return costoUsd.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}

function pct(part: number, total: number): string {
  if (!total) return "—";
  return `${Math.round((part / total) * 1000) / 10}%`;
}

export default function CampaignDetailModal({
  campaignId,
  tenantId,
  onClose,
  onFetchDetail,
  onFetchInsight,
  onContinueDraft,
  onDuplicate,
  onDelete,
}: CampaignDetailModalProps) {
  const [detail, setDetail] = useState<CampaignDetail | null>(null);
  const [insight, setInsight] = useState<string | null>(null);
  const [confirmandoEliminar, setConfirmandoEliminar] = useState(false);
  const [eliminando, setEliminando] = useState(false);
  const [errorEliminar, setErrorEliminar] = useState<string | null>(null);
  const loading = detail === null;

  useEffect(() => {
    if (!campaignId) {
      return;
    }

    let cancelled = false;

    onFetchDetail(tenantId, campaignId).then((result) => {
      if (!cancelled) {
        setDetail(result);
      }
    });

    onFetchInsight().then((result) => {
      if (!cancelled) setInsight(result.insight);
    });

    return () => {
      cancelled = true;
    };
  }, [campaignId, tenantId, onFetchDetail, onFetchInsight]);

  if (!campaignId) return null;

  const conMetricas = detail && (detail.status === "enviado" || detail.status === "error");
  const badge = detail ? ESTADO_BADGE[detail.status] : null;
  const puedeEliminar = detail && detail.status !== "enviando";

  async function handleEliminar() {
    if (!detail || !onDelete) return;
    setEliminando(true);
    setErrorEliminar(null);
    const result = await onDelete(detail.id);
    setEliminando(false);
    if (result.error) {
      setErrorEliminar(result.error);
      setConfirmandoEliminar(false);
    }
    // Si no hay error, el padre ya cierra el modal (onDelete hace
    // setDetailCampaignId(null) tras eliminar con éxito).
  }

  return (
    <div
      onClick={(e) => e.target === e.currentTarget && onClose()}
      className="fixed inset-0 bg-black/[.34] flex items-center justify-center z-[100] px-4 py-8"
      style={{ animation: "ys-fade .16s ease both" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[600px] max-h-[calc(100vh-64px)] overflow-y-auto bg-white rounded-[18px] px-7 pt-[26px] pb-[22px] flex flex-col gap-5 shadow-[0_24px_60px_rgba(16,24,20,0.24)]"
        style={{ animation: "ys-modal .19s cubic-bezier(.4,0,.2,1) both" }}
      >
        {loading || !detail ? (
          <div className="py-16 flex items-center justify-center text-sm text-ys-muted font-semibold">
            Cargando campaña…
          </div>
        ) : (
          <>
            <div className="flex items-start gap-3.5">
              <div className="w-11 h-11 flex-none rounded-[14px] bg-ys-green-bg flex items-center justify-center">
                <svg width="21" height="21" viewBox="0 0 16 16" fill="none">
                  <path d="M2.5 6.5v3l7 3.5v-10l-7 3.5Z" stroke="#12B76A" strokeWidth="1.5" strokeLinejoin="round" />
                  <path d="M12 6v4" stroke="#12B76A" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </div>
              <div className="flex-1 min-w-0 flex flex-col gap-[5px]">
                <div className="text-xl font-extrabold tracking-[-0.02em] text-ys-text truncate">
                  {detail.nombre}
                </div>
                <div className="text-[13px] text-[#6b736e] font-semibold">
                  {detail.listaNombre ?? "—"} · {formatFechaHora(detail.enviadoAt ?? detail.fechaProgramada ?? detail.createdAt)}
                </div>
              </div>
              {badge && (
                <span
                  className={`flex-none inline-flex items-center gap-1.5 text-[11.5px] font-bold rounded-full px-2.5 py-1 ${badge.text} ${badge.bg}`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${badge.dotOutline ? `border-[1.5px] ${badge.dot}` : badge.dot} ${badge.pulse ? "animate-pulse" : ""}`}
                  />
                  {badge.label}
                </span>
              )}
              <button
                onClick={onClose}
                className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-ys-dimmer hover:bg-ys-el2 hover:text-ys-text transition-colors cursor-pointer text-xl leading-none"
              >
                ×
              </button>
            </div>

            {conMetricas && (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="border border-[#e8ebe9] rounded-[14px] px-4 py-3.5 flex flex-col gap-[3px]">
                    <div className="font-mono text-[19px] text-ys-text tracking-[-0.02em]">
                      {detail.contactosCount.toLocaleString("es-AR")}
                    </div>
                    <div className="text-[11.5px] text-[#8a908c] font-semibold">Destinatarios</div>
                  </div>
                  <div className="border border-[#e8ebe9] rounded-[14px] px-4 py-3.5 flex flex-col gap-[3px]">
                    <div className="font-mono text-[19px] text-ys-text tracking-[-0.02em]">
                      {detail.mensajesOk.toLocaleString("es-AR")}
                    </div>
                    <div className="text-[11.5px] text-[#8a908c] font-semibold">Enviados</div>
                  </div>
                  {/* "Entregados" usa mensajesOk como aproximación: yamas_send_mensajes
                      solo registra status "accepted" hoy, no hay webhook de status de
                      YCloud (delivered/read) todavía. Cuando exista, reemplazar por el
                      conteo real de status = 'delivered'. */}
                  <div className="border border-[#e8ebe9] rounded-[14px] px-4 py-3.5 flex flex-col gap-[3px]">
                    <div className="font-mono text-[19px] text-ys-text tracking-[-0.02em]">
                      {detail.mensajesOk.toLocaleString("es-AR")}
                    </div>
                    <div className="text-[11.5px] text-[#067647] font-bold">
                      {pct(detail.mensajesOk, detail.contactosCount)} entregados
                    </div>
                  </div>
                  <div className="border border-[#e8ebe9] rounded-[14px] px-4 py-3.5 flex flex-col gap-[3px]">
                    <div className="font-mono text-[19px] text-ys-text tracking-[-0.02em]">
                      {detail.respuestas.toLocaleString("es-AR")}
                    </div>
                    <div className="text-[11.5px] text-[#067647] font-bold">
                      {pct(detail.respuestas, detail.mensajesOk)} respuestas
                    </div>
                  </div>
                </div>

                {insight && (
                  <div className="bg-[#16211b] rounded-2xl px-5 py-[18px] flex flex-col gap-[9px]">
                    <div className="flex items-center gap-2">
                      <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                        <path d="m8 2 1.6 3.6L13 7l-3.4 1.4L8 12 6.4 8.4 3 7l3.4-1.4L8 2Z" stroke="#12B76A" strokeWidth="1.5" strokeLinejoin="round" />
                      </svg>
                      <div className="text-[11px] font-extrabold tracking-[0.12em] uppercase text-ys-green">
                        Insight de IA
                      </div>
                    </div>
                    <div className="text-sm leading-[1.55] text-[#eef1ef] font-semibold text-pretty">
                      {insight}
                    </div>
                  </div>
                )}
              </>
            )}

            <div className="bg-[#fbfcfb] border border-[#eef1ef] rounded-[14px] px-[18px] py-4 grid grid-cols-2 md:grid-cols-3 gap-4">
              <div className="flex flex-col gap-[3px]">
                <div className="text-[11px] font-extrabold tracking-[0.07em] uppercase text-[#9aa19c]">Grupo</div>
                <div className="text-[13px] font-bold text-ys-text truncate">{detail.listaNombre ?? "—"}</div>
              </div>
              <div className="flex flex-col gap-[3px]">
                <div className="text-[11px] font-extrabold tracking-[0.07em] uppercase text-[#9aa19c]">Template</div>
                <div className="font-mono text-[12.5px] text-[#3f4844] truncate">{detail.templateNombre ?? "—"}</div>
              </div>
              <div className="flex flex-col gap-[3px]">
                <div className="text-[11px] font-extrabold tracking-[0.07em] uppercase text-[#9aa19c]">Envío</div>
                <div className="font-mono text-[12.5px] text-[#3f4844]">
                  {formatFechaHora(detail.enviadoAt ?? detail.fechaProgramada ?? detail.createdAt)}
                </div>
              </div>
              <div className="flex flex-col gap-[3px]">
                <div className="text-[11px] font-extrabold tracking-[0.07em] uppercase text-[#9aa19c]">Duración</div>
                <div className="font-mono text-[12.5px] text-[#3f4844]">{formatDuracion(detail.duracionMin)}</div>
              </div>
              <div className="flex flex-col gap-[3px]">
                <div className="text-[11px] font-extrabold tracking-[0.07em] uppercase text-[#9aa19c]">
                  Créditos usados
                </div>
                <div className="font-mono text-[12.5px] text-[#3f4844]">
                  {formatCreditos(detail.costoUsd)}
                </div>
              </div>
            </div>

            {errorEliminar && (
              <div className="rounded-lg bg-ys-red-bg border border-[#f1cdc8] text-[#a8443b] px-3.5 py-2.5 text-[13px] font-medium">
                {errorEliminar}
              </div>
            )}

            {confirmandoEliminar ? (
              <div className="border-t border-[#f2f4f3] pt-[18px] flex flex-col gap-3">
                <div className="text-[13.5px] font-semibold text-ys-text">
                  ¿Eliminar la campaña &ldquo;{detail.nombre}&rdquo;? Esta acción no se puede deshacer.
                </div>
                <div className="flex justify-end gap-2.5">
                  <button
                    onClick={() => setConfirmandoEliminar(false)}
                    disabled={eliminando}
                    className="text-[13.5px] font-bold text-[#3f4844] border border-[#e8ebe9] rounded-[10px] px-[18px] py-2.5 cursor-pointer transition-colors hover:bg-[#f7f9f8] disabled:opacity-50"
                  >
                    Volver
                  </button>
                  <button
                    onClick={handleEliminar}
                    disabled={eliminando}
                    className="text-[13.5px] font-bold text-white bg-[#a8443b] rounded-[10px] px-[18px] py-2.5 cursor-pointer transition-colors hover:bg-[#8f3931] disabled:opacity-60"
                  >
                    {eliminando ? "Eliminando..." : "Sí, eliminar"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2.5 border-t border-[#f2f4f3] pt-[18px]">
                {onDelete && puedeEliminar && (
                  <button
                    onClick={() => setConfirmandoEliminar(true)}
                    className="text-[13.5px] font-bold text-[#a8443b] border border-[#f1cdc8] rounded-[10px] px-[18px] py-2.5 cursor-pointer transition-colors hover:bg-[#fdeeec]"
                  >
                    Eliminar campaña
                  </button>
                )}
                <button
                  onClick={onClose}
                  className="text-[13.5px] font-bold text-[#3f4844] border border-[#e8ebe9] rounded-[10px] px-[18px] py-2.5 cursor-pointer transition-colors hover:bg-[#f7f9f8]"
                >
                  Cerrar
                </button>
                {detail.status === "borrador" && onContinueDraft && (
                  <button
                    onClick={() => onContinueDraft(detail.id)}
                    className="ml-auto text-[13.5px] font-bold text-white bg-ys-green rounded-[10px] px-[18px] py-2.5 cursor-pointer transition-all hover:bg-ys-green-hover hover:-translate-y-px"
                  >
                    Continuar configuración
                  </button>
                )}
                {detail.status !== "borrador" && onDuplicate && (
                  <button
                    onClick={() => onDuplicate(detail)}
                    className="ml-auto text-[13.5px] font-bold text-white bg-ys-green rounded-[10px] px-[18px] py-2.5 cursor-pointer transition-all hover:bg-ys-green-hover hover:-translate-y-px"
                  >
                    Duplicar campaña
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
