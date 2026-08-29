"use client";

import { PERMISO_KEYS, type EmpleadoResumen, type PermisoKey } from "@/lib/types";

interface Props {
  empleados: EmpleadoResumen[];
  onVerEmpleado: (tenantId: string) => void;
}

const PERMISO_LABEL: Record<PermisoKey, string> = {
  crear_audiencias: "Audiencias",
  importar_contactos: "Importar contactos",
  crear_templates: "Templates",
  enviar_templates_meta: "Enviar a Meta",
  crear_campanas: "Campañas",
  enviar_campanas: "Enviar campañas",
  comprar_creditos: "Comprar créditos",
  usar_ia: "Asistente IA",
};

function EstadoBadge({ estado }: { estado: EmpleadoResumen["estado"] }) {
  const cfg = {
    activo: { label: "Activo", text: "text-ys-green-text", bg: "bg-ys-green-bg", dot: "bg-ys-green" },
    pendiente: { label: "Pendiente", text: "text-ys-warn-text", bg: "bg-ys-warn-bg", dot: "bg-[#c07a12]" },
    suspendido: { label: "Suspendido", text: "text-ys-red-text", bg: "bg-ys-red-bg", dot: "bg-[#a8443b]" },
  }[estado];

  return (
    <span className={`inline-flex items-center gap-1.5 text-[11.5px] font-bold rounded-full px-2.5 py-1 flex-none ${cfg.text} ${cfg.bg}`}>
      <span className={`w-[6px] h-[6px] rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

function Metrica({ label, valor }: { label: string; valor: number }) {
  return (
    <div className="flex flex-col gap-0.5 min-w-0">
      <span className="text-[17px] font-extrabold font-mono text-ys-text leading-none">
        {valor}
      </span>
      <span className="text-[11.5px] font-semibold text-ys-dim truncate">{label}</span>
    </div>
  );
}

export default function EmpresaEmpleadosSection({
  empleados,
  onVerEmpleado,
}: Props) {
  return (
    <div className="flex flex-col gap-5 md:gap-6 px-4 md:px-[38px] pt-3 md:pt-[34px] pb-[34px]">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-2xl md:text-[28px] font-extrabold tracking-[-0.025em] text-ys-text">
          Empleados
        </h1>
        <p className="text-sm md:text-[15px] text-ys-dim font-medium">
          Actividad, permisos y créditos de cada integrante del equipo.
        </p>
      </div>

      {empleados.length === 0 ? (
        <div className="bg-white border border-ys-border rounded-2xl py-14 flex flex-col items-center gap-2 text-center px-6">
          <span className="text-sm font-bold text-ys-text">
            Todavía no hay empleados en tu empresa
          </span>
          <span className="text-[13px] text-ys-dim font-medium max-w-[380px]">
            Cuando sumes a tu equipo vas a poder ver acá lo que hace cada uno y
            controlar qué puede hacer.
          </span>
        </div>
      ) : (
        <div className="flex flex-col gap-3 md:gap-3.5">
          {empleados.map((emp) => (
            <div
              key={emp.miembroId}
              className="bg-white border border-ys-border rounded-2xl p-4 md:p-[18px] flex flex-col gap-4"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 flex-none rounded-full bg-ys-green-bg text-ys-green-text text-[12.5px] font-extrabold flex items-center justify-center">
                  {emp.nombre.slice(0, 2).toUpperCase()}
                </div>
                <div className="flex flex-col gap-0.5 min-w-0">
                  <span className="text-[14.5px] font-extrabold text-ys-text truncate">
                    {emp.nombre}
                  </span>
                  <span className="text-[12px] font-medium text-ys-dim font-mono truncate">
                    {emp.tenantId}
                  </span>
                </div>
                <div className="ml-auto flex items-center gap-2.5 flex-none">
                  <EstadoBadge estado={emp.estado} />
                </div>
              </div>

              <div className="grid grid-cols-3 md:grid-cols-6 gap-3 md:gap-4 border-t border-ys-border-softest pt-3.5">
                <Metrica label="Contactos" valor={emp.contactosCount} />
                <Metrica label="Audiencias" valor={emp.audienciasCount} />
                <Metrica label="Templates" valor={emp.templatesCount} />
                <Metrica label="Campañas" valor={emp.campanasEnviadas} />
                <Metrica label="Mensajes" valor={emp.mensajesOk} />
                <Metrica label="Créditos" valor={emp.creditosSaldo} />
              </div>

              <div className="flex flex-col gap-2 border-t border-ys-border-softest pt-3.5">
                <span className="text-[11.5px] font-bold text-ys-dim uppercase tracking-wide">
                  Permisos
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {PERMISO_KEYS.map((key) => {
                    const activo = emp.permisos[key];
                    return (
                      <span
                        key={key}
                        className={`inline-flex items-center gap-1.5 text-[11.5px] font-bold rounded-full px-2.5 py-1 ${
                          activo
                            ? "text-ys-green-text bg-ys-green-bg"
                            : "text-[#8a908c] bg-ys-el2"
                        }`}
                      >
                        <span
                          className={`w-[6px] h-[6px] rounded-full ${
                            activo ? "bg-ys-green" : "border-[1.5px] border-[#b7c0ba]"
                          }`}
                        />
                        {PERMISO_LABEL[key]}
                      </span>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center gap-2.5 border-t border-ys-border-softest pt-3.5">
                <button
                  onClick={() => onVerEmpleado(emp.tenantId)}
                  className="text-[13px] font-bold text-[#3f4844] bg-white border border-ys-border rounded-[10px] px-3.5 py-2.5 cursor-pointer transition-colors hover:bg-[#f7f9f8] hover:border-[#d8ded9]"
                >
                  Ver su actividad
                </button>
                {/* Editar permisos y repartir créditos llegan en la próxima
                    tanda: necesitan RPCs de escritura con validación de que
                    el empleado pertenece a esta organización. */}
                <span className="text-[12px] font-medium text-ys-dim">
                  Editar permisos y créditos: próximamente
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
