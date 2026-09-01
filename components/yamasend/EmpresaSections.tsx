"use client";

import type {
  EmpresaAudiencia,
  EmpresaCampana,
  EmpresaContacto,
  EmpresaTemplate,
  EmpresaTemplatePropio,
} from "@/lib/actions/empresa";
import type { EmpleadoResumen } from "@/lib/types";

/* ─────────────────────────── Piezas compartidas ─────────────────────────── */

function formatFecha(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getFullYear()).slice(2)}`;
}

/** Chip con el nombre del empleado que creó el recurso. */
export function AutorChip({ nombre }: { nombre: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11.5px] font-bold text-[#3f4844] bg-ys-el2 rounded-full pl-1 pr-2.5 py-1 flex-none">
      <span className="w-[17px] h-[17px] rounded-full bg-white text-[9px] font-extrabold text-ys-green-text flex items-center justify-center">
        {nombre.slice(0, 2).toUpperCase()}
      </span>
      {nombre}
    </span>
  );
}

export function SectionHeader({
  titulo,
  subtitulo,
  empleados,
  filtroTenant,
  onFiltroChange,
  busqueda,
  onBusquedaChange,
  placeholderBusqueda,
}: {
  titulo: string;
  subtitulo: string;
  empleados: EmpleadoResumen[];
  filtroTenant: string | null;
  onFiltroChange: (t: string | null) => void;
  busqueda?: string;
  onBusquedaChange?: (v: string) => void;
  placeholderBusqueda?: string;
}) {
  return (
    <div className="flex flex-col gap-4 md:gap-5">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-2xl md:text-[28px] font-extrabold tracking-[-0.025em] text-ys-text">
          {titulo}
        </h1>
        <p className="text-sm md:text-[15px] text-ys-dim font-medium">{subtitulo}</p>
      </div>

      <div className="flex items-center gap-2.5 flex-wrap">
        {onBusquedaChange && (
          <div className="flex items-center gap-2.5 bg-white border border-ys-border rounded-[10px] px-3.5 py-2.5 w-full md:w-[260px]">
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" className="flex-none">
              <circle cx="7" cy="7" r="4.5" stroke="#9aa19c" strokeWidth="1.5" />
              <path d="m10.5 10.5 3 3" stroke="#9aa19c" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <input
              value={busqueda ?? ""}
              onChange={(e) => onBusquedaChange(e.target.value)}
              placeholder={placeholderBusqueda ?? "Buscar..."}
              className="flex-1 min-w-0 border-none outline-none bg-transparent text-[13.5px] font-semibold text-ys-text"
            />
          </div>
        )}

        {/* Filtro por empleado: es la operación que más va a usar la empresa,
            así que va como chips visibles y no escondido en un dropdown. */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            onClick={() => onFiltroChange(null)}
            className={`text-[12.5px] font-bold rounded-full px-3 py-2 cursor-pointer transition-colors ${
              filtroTenant === null
                ? "bg-ys-dark text-white"
                : "bg-white border border-ys-border text-[#3f4844] hover:bg-[#f7f9f8]"
            }`}
          >
            Todo el equipo
          </button>
          {empleados.map((e) => (
            <button
              key={e.miembroId}
              onClick={() => onFiltroChange(e.tenantId)}
              className={`text-[12.5px] font-bold rounded-full px-3 py-2 cursor-pointer transition-colors ${
                filtroTenant === e.tenantId
                  ? "bg-ys-dark text-white"
                  : "bg-white border border-ys-border text-[#3f4844] hover:bg-[#f7f9f8]"
              }`}
            >
              {e.nombre}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function Vacio({ mensaje }: { mensaje: string }) {
  return (
    <div className="bg-white border border-ys-border rounded-2xl py-14 flex flex-col items-center px-6">
      <span className="text-[13.5px] text-ys-dim font-semibold text-center">
        {mensaje}
      </span>
    </div>
  );
}

/* ──────────────────────────────── Contactos ─────────────────────────────── */

export function EmpresaContactosSection({
  contactos,
  total,
  cargando,
}: {
  contactos: EmpresaContacto[];
  total: number;
  cargando: boolean;
}) {
  if (cargando) return <Vacio mensaje="Cargando contactos..." />;
  if (contactos.length === 0)
    return <Vacio mensaje="No hay contactos para mostrar." />;

  return (
    <div className="flex flex-col gap-3">
      <span className="text-[13px] font-semibold text-ys-muted px-1">
        <span className="font-mono text-ys-text">{total}</span> contactos
      </span>

      <div className="bg-white border border-ys-border rounded-2xl overflow-hidden">
        {/* Solo nombre y teléfono: el análisis de IA y las conversaciones son
            datos privados del empleado y no se exponen a la empresa. */}
        <div className="hidden md:grid grid-cols-[1fr_180px_200px] gap-3 px-5 py-3 border-b border-ys-border-softest bg-[#fbfcfb]">
          {["Nombre", "Teléfono", "Importado por"].map((h) => (
            <span key={h} className="text-[11.5px] font-bold text-ys-dim uppercase tracking-wide">
              {h}
            </span>
          ))}
        </div>

        {contactos.map((c) => (
          <div
            key={c.id}
            className="grid grid-cols-1 md:grid-cols-[1fr_180px_200px] gap-1.5 md:gap-3 px-4 md:px-5 py-3.5 border-b border-ys-border-softest last:border-b-0 md:items-center"
          >
            <span className="text-[13.5px] font-bold text-ys-text truncate">
              {c.nombre || "Sin nombre"}
            </span>
            <span className="text-[13px] font-mono text-ys-muted">{c.telefono}</span>
            <div className="mt-1 md:mt-0">
              <AutorChip nombre={c.empleadoNombre} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ──────────────────────────────── Audiencias ────────────────────────────── */

export function EmpresaAudienciasSection({
  audiencias,
}: {
  audiencias: EmpresaAudiencia[];
}) {
  if (audiencias.length === 0)
    return <Vacio mensaje="Todavía no hay audiencias creadas por el equipo." />;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 md:gap-4">
      {audiencias.map((a) => (
        <div
          key={a.id}
          className="bg-white border border-ys-border rounded-2xl p-4 md:p-[18px] flex flex-col gap-3"
        >
          <div className="flex items-start gap-2.5">
            <span className="text-[14.5px] font-extrabold text-ys-text leading-snug min-w-0">
              {a.nombre}
            </span>
            <span className="ml-auto text-[13px] font-mono font-bold text-ys-green-text bg-ys-green-bg rounded-full px-2.5 py-1 flex-none">
              {a.contactosCount}
            </span>
          </div>
          {a.descripcion && (
            <p className="text-[12.5px] text-ys-muted font-medium leading-relaxed line-clamp-2">
              {a.descripcion}
            </p>
          )}
          <div className="flex items-center gap-2.5 mt-auto pt-2 border-t border-ys-border-softest">
            <AutorChip nombre={a.empleadoNombre} />
            <span className="ml-auto text-[12px] font-semibold text-ys-dim flex-none">
              {formatFecha(a.createdAt)}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ──────────────────────────────── Templates ─────────────────────────────── */

const TPL_ESTADO: Record<string, { label: string; text: string; bg: string; dot: string }> = {
  borrador: { label: "Borrador", text: "text-[#5d6560]", bg: "bg-ys-el2", dot: "border-[1.5px] border-[#8a908c]" },
  enviado: { label: "En revisión", text: "text-ys-warn-text", bg: "bg-ys-warn-bg", dot: "bg-[#c07a12]" },
  verificado: { label: "Aprobado", text: "text-ys-green-text", bg: "bg-ys-green-bg", dot: "bg-ys-green" },
  rechazado: { label: "Rechazado", text: "text-ys-red-text", bg: "bg-ys-red-bg", dot: "bg-[#a8443b]" },
  error: { label: "Error", text: "text-ys-red-text", bg: "bg-ys-red-bg", dot: "bg-[#a8443b]" },
};

export function EmpresaTemplatesSection({
  templates,
  propios,
  onNuevo,
  onToggleVisibilidad,
  onSumarEmpleados,
  ocupado,
}: {
  templates: EmpresaTemplate[];
  /** Templates que creó la empresa, con el detalle de cada copia por empleado. */
  propios: EmpresaTemplatePropio[];
  onNuevo: () => void;
  onToggleVisibilidad: (templateId: string, visible: boolean) => void;
  onSumarEmpleados: (template: EmpresaTemplatePropio) => void;
  ocupado: string | null;
}) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex flex-col gap-0.5">
          <span className="text-[15px] font-extrabold text-ys-text">
            Templates de la empresa
          </span>
          <span className="text-[12.5px] text-ys-muted font-medium">
            Los creás vos y los usan tus empleados con su propio WhatsApp.
          </span>
        </div>
        <button
          onClick={onNuevo}
          className="ml-auto w-full md:w-auto justify-center flex items-center gap-2 bg-ys-green text-white text-[13.5px] font-bold px-[17px] py-[11px] rounded-[10px] cursor-pointer transition-all hover:bg-ys-green-hover"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
          </svg>
          Nuevo template
        </button>
      </div>

      {propios.length === 0 ? (
        <Vacio mensaje="Todavía no creaste templates para tu equipo." />
      ) : (
        <div className="flex flex-col gap-3 md:gap-3.5">
          {propios.map((t) => {
            const aprobadas = t.copias.filter((c) => c.status === "verificado").length;
            return (
              <div
                key={t.id}
                className="bg-white border border-[#ddd3f5] rounded-2xl p-4 md:p-[18px] flex flex-col gap-3.5"
              >
                <div className="flex items-start gap-2.5 flex-wrap">
                  <div className="flex flex-col gap-1 min-w-0">
                    <span className="font-mono text-[14px] font-bold text-ys-text break-words">
                      {t.nombre}
                    </span>
                    <span className="text-[12px] text-ys-dim font-semibold">
                      {formatFecha(t.createdAt)}
                    </span>
                  </div>
                  <span className="ml-auto text-[11.5px] font-bold text-[#5b3fa8] bg-[#f0eafd] border border-[#ddd3f5] rounded-full px-2.5 py-1 flex-none">
                    {aprobadas}/{t.copias.length} aprobados
                  </span>
                </div>

                <p className="text-[12.5px] text-ys-muted font-medium leading-relaxed bg-[#fbfcfb] border border-ys-border-softest rounded-xl px-3 py-2.5">
                  {t.contenido}
                </p>

                {/* Una fila por empleado: cada copia se aprueba por separado en
                    Meta, así que pueden estar en estados distintos. */}
                <div className="flex flex-col gap-1.5 border-t border-ys-border-softest pt-3">
                  {t.copias.map((c) => {
                    const cfg = TPL_ESTADO[c.status] ?? TPL_ESTADO.borrador;
                    const puedeAlternar = c.status === "verificado";
                    return (
                      <div
                        key={c.templateId}
                        className="flex items-center gap-2.5 flex-wrap py-1"
                      >
                        <span className="text-[13px] font-bold text-ys-text truncate min-w-0">
                          {c.empleadoNombre}
                        </span>
                        <span className={`inline-flex items-center gap-1.5 text-[11.5px] font-bold rounded-full px-2.5 py-1 flex-none ${cfg.text} ${cfg.bg}`}>
                          <span className={`w-[6px] h-[6px] rounded-full ${cfg.dot}`} />
                          {cfg.label}
                        </span>

                        {/* Ocultar no borra ni reenvía nada a Meta: la
                            aprobación tarda días en conseguirse, así que
                            quitárselo a alguien y devolvérselo es instantáneo. */}
                        {puedeAlternar && (
                          <button
                            onClick={() => onToggleVisibilidad(c.templateId, !c.visible)}
                            disabled={ocupado === c.templateId}
                            className={`ml-auto flex-none text-[12px] font-bold rounded-[9px] px-3 py-1.5 border cursor-pointer transition-colors disabled:opacity-40 ${
                              c.visible
                                ? "text-[#3f4844] bg-white border-ys-border hover:bg-[#f7f9f8]"
                                : "text-ys-green-text bg-ys-green-bg border-ys-green-border"
                            }`}
                          >
                            {c.visible ? "Ocultar" : "Mostrar"}
                          </button>
                        )}

                        {!c.visible && puedeAlternar && (
                          <span className="text-[11.5px] font-semibold text-ys-dim flex-none w-full md:w-auto">
                            No lo ve en su panel
                          </span>
                        )}

                        {c.rechazoMotivo && (
                          <span className="text-[11.5px] font-semibold text-ys-red-text bg-ys-red-bg rounded-lg px-2.5 py-1 w-full">
                            {c.rechazoMotivo}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Sumar a alguien que entró después: se pide la aprobación
                    solo para él, las copias del resto no se tocan. */}
                <button
                  onClick={() => onSumarEmpleados(t)}
                  className="self-start flex items-center gap-2 text-[12.5px] font-bold text-[#5b3fa8] bg-[#f0eafd] border border-[#ddd3f5] rounded-[10px] px-3.5 py-2 cursor-pointer transition-colors hover:bg-[#e7dcfb]"
                >
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                    <path d="M8 3.5v9M3.5 8h9" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
                  </svg>
                  Sumar empleados
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex flex-col gap-3 border-t border-ys-border-softest pt-5">
        <div className="flex flex-col gap-0.5">
          <span className="text-[15px] font-extrabold text-ys-text">
            Templates del equipo
          </span>
          <span className="text-[12.5px] text-ys-muted font-medium">
            Los que crearon tus empleados por su cuenta.
          </span>
        </div>

        {templates.length === 0 ? (
          <Vacio mensaje="Todavía no hay templates creados por el equipo." />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 md:gap-4">
            {templates.map((t) => {
              const cfg = TPL_ESTADO[t.status] ?? TPL_ESTADO.borrador;
              return (
                <div
                  key={t.id}
                  className="bg-white border border-ys-border rounded-2xl p-4 md:p-[18px] flex flex-col gap-3"
                >
                  <div className="flex items-start gap-2.5">
                    <span className="text-[14.5px] font-extrabold text-ys-text leading-snug min-w-0 break-words">
                      {t.nombre}
                    </span>
                    <span className={`ml-auto inline-flex items-center gap-1.5 text-[11.5px] font-bold rounded-full px-2.5 py-1 flex-none ${cfg.text} ${cfg.bg}`}>
                      <span className={`w-[6px] h-[6px] rounded-full ${cfg.dot}`} />
                      {cfg.label}
                    </span>
                  </div>

                  <p className="text-[12.5px] text-ys-muted font-medium leading-relaxed line-clamp-3 bg-[#fbfcfb] border border-ys-border-softest rounded-xl px-3 py-2.5">
                    {t.contenido}
                  </p>

                  {t.rechazoMotivo && (
                    <p className="text-[12px] font-semibold text-ys-red-text bg-ys-red-bg rounded-lg px-3 py-2">
                      {t.rechazoMotivo}
                    </p>
                  )}

                  <div className="flex items-center gap-2.5 mt-auto pt-2 border-t border-ys-border-softest">
                    <AutorChip nombre={t.empleadoNombre} />
                    <span className="ml-auto text-[12px] font-semibold text-ys-dim flex-none">
                      {formatFecha(t.createdAt)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/* ──────────────────────────────── Campañas ──────────────────────────────── */

const CAMP_ESTADO: Record<string, { label: string; text: string; bg: string; dot: string }> = {
  borrador: { label: "Borrador", text: "text-[#5d6560]", bg: "bg-ys-el2", dot: "border-[1.5px] border-[#8a908c]" },
  programada: { label: "Programada", text: "text-[#3f4844]", bg: "bg-ys-el2", dot: "border-[1.5px] border-[#5d6560]" },
  enviando: { label: "Enviando", text: "text-ys-warn-text", bg: "bg-ys-warn-bg", dot: "bg-[#c07a12]" },
  enviado: { label: "Enviado", text: "text-ys-green-text", bg: "bg-ys-green-bg", dot: "bg-ys-green" },
  error: { label: "Error", text: "text-ys-red-text", bg: "bg-ys-red-bg", dot: "bg-[#a8443b]" },
  cancelado: { label: "Cancelado", text: "text-[#5d6560]", bg: "bg-ys-el2", dot: "bg-[#8a908c]" },
};

export function EmpresaCampanasSection({
  campanas,
}: {
  campanas: EmpresaCampana[];
}) {
  if (campanas.length === 0)
    return <Vacio mensaje="Todavía no hay campañas creadas por el equipo." />;

  return (
    <div className="flex flex-col gap-3 md:gap-3.5">
      {campanas.map((c) => {
        const cfg = CAMP_ESTADO[c.status] ?? CAMP_ESTADO.borrador;
        const tasaLectura =
          c.mensajesOk > 0 ? Math.round((c.mensajesLeidos / c.mensajesOk) * 100) : 0;

        return (
          <div
            key={c.id}
            className="bg-white border border-ys-border rounded-2xl p-4 md:p-[18px] flex flex-col gap-3.5"
          >
            <div className="flex items-start gap-2.5 flex-wrap">
              <span className="text-[14.5px] font-extrabold text-ys-text leading-snug">
                {c.nombre}
              </span>
              <span className={`inline-flex items-center gap-1.5 text-[11.5px] font-bold rounded-full px-2.5 py-1 flex-none ${cfg.text} ${cfg.bg}`}>
                <span className={`w-[6px] h-[6px] rounded-full ${cfg.dot}`} />
                {cfg.label}
              </span>
              <div className="ml-auto flex-none">
                <AutorChip nombre={c.empleadoNombre} />
              </div>
            </div>

            <div className="flex items-center gap-3 flex-wrap text-[12.5px] font-semibold text-ys-muted">
              {c.listaNombre && <span>Audiencia: {c.listaNombre}</span>}
              {c.listaNombre && c.templateNombre && (
                <span className="w-px h-3.5 bg-[#e2e5e3]" />
              )}
              {c.templateNombre && <span>Template: {c.templateNombre}</span>}
            </div>

            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 md:gap-4 border-t border-ys-border-softest pt-3.5">
              <div className="flex flex-col gap-0.5">
                <span className="text-[17px] font-extrabold font-mono text-ys-text leading-none">
                  {c.contactosCount}
                </span>
                <span className="text-[11.5px] font-semibold text-ys-dim">Destinatarios</span>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-[17px] font-extrabold font-mono text-ys-green-text leading-none">
                  {c.mensajesOk}
                </span>
                <span className="text-[11.5px] font-semibold text-ys-dim">Enviados</span>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-[17px] font-extrabold font-mono text-ys-text leading-none">
                  {c.mensajesLeidos}
                </span>
                <span className="text-[11.5px] font-semibold text-ys-dim">
                  Leídos ({tasaLectura}%)
                </span>
              </div>
              <div className="flex flex-col gap-0.5">
                <span
                  className={`text-[17px] font-extrabold font-mono leading-none ${
                    c.mensajesError > 0 ? "text-ys-red-text" : "text-ys-text"
                  }`}
                >
                  {c.mensajesError}
                </span>
                <span className="text-[11.5px] font-semibold text-ys-dim">Errores</span>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-[13.5px] font-bold text-ys-text leading-none pt-1">
                  {formatFecha(c.enviadoAt ?? c.fechaProgramada ?? c.createdAt)}
                </span>
                <span className="text-[11.5px] font-semibold text-ys-dim">
                  {c.enviadoAt ? "Enviada" : c.fechaProgramada ? "Programada" : "Creada"}
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
