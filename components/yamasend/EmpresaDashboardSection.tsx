"use client";

import type { EmpleadoResumen } from "@/lib/types";
import type { EmpresaDashboard } from "@/lib/actions/empresa";

interface Props {
  stats: EmpresaDashboard | null;
  empleados: EmpleadoResumen[];
  onVerEmpleado: (tenantId: string) => void;
}

function Kpi({
  label,
  valor,
  sub,
  acento,
}: {
  label: string;
  valor: string | number;
  sub?: string;
  acento?: "verde" | "warn";
}) {
  return (
    <div className="bg-white border border-ys-border rounded-2xl px-4 md:px-[18px] py-4 flex flex-col gap-1.5">
      <span className="text-[12.5px] font-semibold text-ys-dim">{label}</span>
      <span
        className={`text-[26px] font-extrabold tracking-[-0.02em] font-mono leading-none ${
          acento === "verde"
            ? "text-ys-green-text"
            : acento === "warn"
              ? "text-ys-warn-text"
              : "text-ys-text"
        }`}
      >
        {valor}
      </span>
      {sub && <span className="text-[12px] font-medium text-ys-dim">{sub}</span>}
    </div>
  );
}

/** Barra de participación de un empleado sobre el total de mensajes del equipo. */
function BarraEmpleado({
  emp,
  maximo,
  onClick,
}: {
  emp: EmpleadoResumen;
  maximo: number;
  onClick: () => void;
}) {
  // Se normaliza contra el máximo del equipo y no contra la suma: con un
  // empleado dominante, todas las demás barras quedarían invisibles.
  const pct = maximo > 0 ? Math.round((emp.mensajesOk / maximo) * 100) : 0;

  return (
    <button
      onClick={onClick}
      className="w-full flex flex-col gap-2 px-3.5 py-3 rounded-xl cursor-pointer transition-colors hover:bg-[#f7f9f8] text-left"
    >
      <div className="flex items-center gap-2.5">
        <div className="w-7 h-7 flex-none rounded-full bg-ys-green-bg text-ys-green-text text-[11px] font-extrabold flex items-center justify-center">
          {emp.nombre.slice(0, 2).toUpperCase()}
        </div>
        <span className="text-[13.5px] font-bold text-ys-text truncate">
          {emp.nombre}
        </span>
        {emp.estado === "pendiente" && (
          <span className="text-[10.5px] font-bold text-ys-warn-text bg-ys-warn-bg rounded-full px-2 py-0.5 flex-none">
            Pendiente
          </span>
        )}
        <span className="ml-auto text-[13px] font-mono font-bold text-ys-text flex-none">
          {emp.mensajesOk}
        </span>
      </div>
      <div className="h-[7px] w-full rounded-full bg-ys-el2 overflow-hidden">
        <div
          className="h-full rounded-full bg-ys-green transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex items-center gap-3 text-[11.5px] font-semibold text-ys-dim">
        <span>{emp.contactosCount} contactos</span>
        <span className="w-px h-3 bg-[#e2e5e3]" />
        <span>{emp.campanasEnviadas} campañas</span>
        <span className="w-px h-3 bg-[#e2e5e3]" />
        <span>{emp.creditosSaldo} créditos</span>
      </div>
    </button>
  );
}

export default function EmpresaDashboardSection({
  stats,
  empleados,
  onVerEmpleado,
}: Props) {
  const maximo = Math.max(1, ...empleados.map((e) => e.mensajesOk));
  const ordenados = [...empleados].sort((a, b) => b.mensajesOk - a.mensajesOk);

  const tasaLectura =
    stats && stats.mensajesEnviados > 0
      ? Math.round((stats.mensajesLeidos / stats.mensajesEnviados) * 100)
      : 0;

  return (
    <div className="flex flex-col gap-5 md:gap-6 px-4 md:px-[38px] pt-3 md:pt-[34px] pb-[34px]">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-2xl md:text-[28px] font-extrabold tracking-[-0.025em] text-ys-text">
          Dashboard
        </h1>
        <p className="text-sm md:text-[15px] text-ys-dim font-medium">
          Actividad consolidada de todo tu equipo.
        </p>
      </div>

      {stats && stats.empleadosPendientes > 0 && (
        <div className="bg-ys-warn-bg border border-[#f0dcb4] rounded-2xl px-4 py-3.5 flex items-center gap-3">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="flex-none">
            <circle cx="12" cy="12" r="9" stroke="#c07a12" strokeWidth="1.8" />
            <path d="M12 7.5V12l3 2" stroke="#c07a12" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          <span className="text-[13.5px] font-semibold text-ys-warn-text">
            Tenés {stats.empleadosPendientes}{" "}
            {stats.empleadosPendientes === 1
              ? "empleado esperando aprobación"
              : "empleados esperando aprobación"}
            .
          </span>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <Kpi
          label="Empleados"
          valor={stats?.empleadosActivos ?? 0}
          sub={`${stats?.empleadosTotal ?? 0} en total`}
        />
        <Kpi
          label="Contactos del equipo"
          valor={stats?.contactosTotal ?? 0}
        />
        <Kpi
          label="Mensajes enviados"
          valor={stats?.mensajesEnviados ?? 0}
          sub={`${tasaLectura}% leídos`}
          acento="verde"
        />
        <Kpi
          label="Créditos en el pool"
          valor={stats?.creditosPool ?? 0}
          sub={`${stats?.creditosAsignados ?? 0} repartidos`}
          acento={stats && stats.creditosPool === 0 ? "warn" : undefined}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 md:gap-4">
        <Kpi
          label="Campañas"
          valor={stats?.campanasTotal ?? 0}
          sub={`${stats?.campanasEnviadas ?? 0} enviadas`}
        />
        <Kpi
          label="Templates"
          valor={stats?.templatesTotal ?? 0}
          sub={`${stats?.templatesAprobados ?? 0} aprobados por Meta`}
        />
        <Kpi label="Audiencias" valor={stats?.audienciasTotal ?? 0} />
      </div>

      <div className="bg-white border border-ys-border rounded-2xl p-4 md:p-[18px] flex flex-col gap-1">
        <div className="flex items-center gap-3 px-1.5 pb-2">
          <h2 className="text-[15px] font-extrabold text-ys-text">
            Mensajes por empleado
          </h2>
          <span className="ml-auto text-[12px] font-semibold text-ys-dim">
            Tocá uno para ver su detalle
          </span>
        </div>

        {ordenados.length === 0 ? (
          <div className="py-10 flex flex-col items-center gap-2 text-center">
            <span className="text-sm font-bold text-ys-text">
              Todavía no hay empleados
            </span>
            <span className="text-[13px] text-ys-dim font-medium max-w-[340px]">
              Invitá a tu equipo desde la sección Empleados para empezar a ver
              sus métricas acá.
            </span>
          </div>
        ) : (
          ordenados.map((emp) => (
            <BarraEmpleado
              key={emp.miembroId}
              emp={emp}
              maximo={maximo}
              onClick={() => onVerEmpleado(emp.tenantId)}
            />
          ))
        )}
      </div>
    </div>
  );
}
