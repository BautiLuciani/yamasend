"use client";

import { useState } from "react";
import {
  PERMISO_KEYS,
  type EmpleadoResumen,
  type PermisoKey,
  type Permisos,
} from "@/lib/types";
import {
  actualizarPermisosEmpleadoAction,
  cambiarEstadoEmpleadoAction,
  quitarEmpleadoAction,
  revocarInvitacionAction,
  type EmpresaInvitacion,
} from "@/lib/actions/empresa";
import InvitarEmpleadoModal from "./InvitarEmpleadoModal";

interface Props {
  empleados: EmpleadoResumen[];
  invitaciones: EmpresaInvitacion[];
  onVerEmpleado: (tenantId: string) => void;
  onRefrescar: () => void;
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
      <span className="text-[17px] font-extrabold font-mono text-ys-text leading-none">{valor}</span>
      <span className="text-[11.5px] font-semibold text-ys-dim truncate">{label}</span>
    </div>
  );
}

/** Toggle de permiso. Optimista, con reversión si el server action falla. */
function PermisoToggle({
  label,
  activo,
  disabled,
  onToggle,
}: {
  label: string;
  activo: boolean;
  disabled: boolean;
  onToggle: (v: boolean) => void;
}) {
  return (
    <button
      onClick={() => onToggle(!activo)}
      disabled={disabled}
      className={`inline-flex items-center gap-2 text-[12px] font-bold rounded-full pl-1.5 pr-3 py-1.5 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
        activo ? "text-ys-green-text bg-ys-green-bg" : "text-[#8a908c] bg-ys-el2"
      }`}
    >
      <span
        className={`w-[26px] h-[15px] rounded-full flex items-center transition-colors flex-none px-[2px] ${
          activo ? "bg-ys-green justify-end" : "bg-[#c4ccc7] justify-start"
        }`}
      >
        <span className="w-[11px] h-[11px] rounded-full bg-white" />
      </span>
      {label}
    </button>
  );
}

export default function EmpresaEmpleadosSection({
  empleados,
  invitaciones,
  onVerEmpleado,
  onRefrescar,
}: Props) {
  const [invitarAbierto, setInvitarAbierto] = useState(false);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmarQuitar, setConfirmarQuitar] = useState<EmpleadoResumen | null>(null);

  // Copia local de los permisos para poder pintar el toggle al instante.
  // El servidor sigue siendo la fuente de verdad: si la RPC falla, se
  // descarta el override y vuelve a mandar lo que dice `empleados`.
  const [override, setOverride] = useState<Record<string, Permisos>>({});

  function permisosDe(emp: EmpleadoResumen): Permisos {
    return override[emp.miembroId] ?? emp.permisos;
  }

  async function togglePermiso(emp: EmpleadoResumen, key: PermisoKey, valor: boolean) {
    const nuevos = { ...permisosDe(emp), [key]: valor };
    setOverride((o) => ({ ...o, [emp.miembroId]: nuevos }));
    setOcupado(emp.miembroId);
    setError(null);

    const res = await actualizarPermisosEmpleadoAction(emp.miembroId, nuevos);
    setOcupado(null);

    if (!res.ok) {
      setOverride((o) => {
        const copia = { ...o };
        delete copia[emp.miembroId];
        return copia;
      });
      setError(res.error);
      return;
    }
    onRefrescar();
  }

  async function cambiarEstado(emp: EmpleadoResumen, estado: "activo" | "suspendido") {
    setOcupado(emp.miembroId);
    setError(null);
    const res = await cambiarEstadoEmpleadoAction(emp.miembroId, estado);
    setOcupado(null);
    if (!res.ok) setError(res.error);
    else onRefrescar();
  }

  async function quitar(emp: EmpleadoResumen) {
    setOcupado(emp.miembroId);
    setError(null);
    const res = await quitarEmpleadoAction(emp.miembroId);
    setOcupado(null);
    setConfirmarQuitar(null);
    if (!res.ok) setError(res.error);
    else onRefrescar();
  }

  async function revocar(id: string) {
    setOcupado(id);
    const res = await revocarInvitacionAction(id);
    setOcupado(null);
    if (!res.ok) setError(res.error);
    else onRefrescar();
  }

  const invitacionesVivas = invitaciones.filter(
    (i) => i.estado === "pendiente" || i.estado === "registrado",
  );

  return (
    <div className="flex flex-col gap-5 md:gap-6 px-4 md:px-[38px] pt-3 md:pt-[34px] pb-[34px]">
      <div className="flex items-start gap-3 flex-wrap">
        <div className="flex flex-col gap-1.5 min-w-0">
          <h1 className="text-2xl md:text-[28px] font-extrabold tracking-[-0.025em] text-ys-text">
            Empleados
          </h1>
          <p className="text-sm md:text-[15px] text-ys-dim font-medium">
            Actividad, permisos y créditos de cada integrante del equipo.
          </p>
        </div>
        <button
          onClick={() => setInvitarAbierto(true)}
          className="ml-auto flex-none flex items-center gap-2 bg-ys-green text-white text-[13.5px] font-bold px-[17px] py-[11px] rounded-[10px] cursor-pointer transition-all hover:bg-ys-green-hover"
        >
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
            <path d="M8 3.5v9M3.5 8h9" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
          </svg>
          Invitar empleado
        </button>
      </div>

      {error && (
        <div className="bg-ys-red-bg border border-ys-red-border rounded-xl px-4 py-3">
          <span className="text-[13px] font-semibold text-ys-red-text">{error}</span>
        </div>
      )}

      {invitacionesVivas.length > 0 && (
        <div className="bg-white border border-ys-border rounded-2xl p-4 md:p-[18px] flex flex-col gap-3">
          <span className="text-[11.5px] font-bold text-ys-dim uppercase tracking-wide">
            Invitaciones abiertas
          </span>
          {invitacionesVivas.map((inv) => (
            <div
              key={inv.id}
              className="flex items-center gap-3 flex-wrap border-t border-ys-border-softest pt-3 first:border-t-0 first:pt-0"
            >
              <div className="flex flex-col gap-0.5 min-w-0">
                <span className="text-[13.5px] font-bold text-ys-text truncate">
                  {inv.email}
                </span>
                <span className="text-[12px] font-medium text-ys-dim">
                  {inv.estado === "registrado"
                    ? "Ya se registró — falta aprobarlo abajo"
                    : "Esperando que se registre"}
                </span>
              </div>
              <div className="ml-auto flex items-center gap-2 flex-none">
                {inv.token && (
                  <button
                    onClick={() =>
                      navigator.clipboard.writeText(
                        `${window.location.origin}/register?invite=${inv.token}`,
                      )
                    }
                    className="text-[12.5px] font-bold text-[#3f4844] bg-white border border-ys-border rounded-[10px] px-3 py-2 cursor-pointer hover:bg-[#f7f9f8]"
                  >
                    Copiar link
                  </button>
                )}
                <button
                  onClick={() => revocar(inv.id)}
                  disabled={ocupado === inv.id}
                  className="text-[12.5px] font-bold text-ys-red-text bg-white border border-ys-border rounded-[10px] px-3 py-2 cursor-pointer hover:bg-ys-red-bg disabled:opacity-40"
                >
                  Revocar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {empleados.length === 0 ? (
        <div className="bg-white border border-ys-border rounded-2xl py-14 flex flex-col items-center gap-2 text-center px-6">
          <span className="text-sm font-bold text-ys-text">
            Todavía no hay empleados en tu empresa
          </span>
          <span className="text-[13px] text-ys-dim font-medium max-w-[380px]">
            Invitá a alguien con el botón de arriba. Le va a llegar un link para
            registrarse y después lo aprobás desde acá.
          </span>
        </div>
      ) : (
        <div className="flex flex-col gap-3 md:gap-3.5">
          {empleados.map((emp) => {
            const trabajando = ocupado === emp.miembroId;
            const permisos = permisosDe(emp);

            return (
              <div
                key={emp.miembroId}
                className="bg-white border border-ys-border rounded-2xl p-4 md:p-[18px] flex flex-col gap-4"
              >
                <div className="flex items-center gap-3 flex-wrap">
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
                  <div className="ml-auto flex items-center gap-2 flex-none">
                    <EstadoBadge estado={emp.estado} />
                  </div>
                </div>

                {/* Aviso operativo: sin WhatsApp cargado el empleado puede
                    organizarse pero no enviar. Explicarlo acá evita que la
                    empresa crea que el producto está roto. */}
                {!emp.whatsappConfigurado && (
                  <div className="bg-ys-warn-bg border border-[#f0dcb4] rounded-xl px-3.5 py-2.5 flex items-center gap-2.5">
                    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" className="flex-none">
                      <circle cx="8" cy="8" r="6" stroke="#c07a12" strokeWidth="1.6" />
                      <path d="M8 5v3.5M8 10.6v.4" stroke="#c07a12" strokeWidth="1.6" strokeLinecap="round" />
                    </svg>
                    <span className="text-[12.5px] font-semibold text-ys-warn-text">
                      WhatsApp sin configurar: puede armar audiencias y templates,
                      pero todavía no puede enviar.
                    </span>
                  </div>
                )}

                <div className="grid grid-cols-3 md:grid-cols-6 gap-3 md:gap-4 border-t border-ys-border-softest pt-3.5">
                  <Metrica label="Contactos" valor={emp.contactosCount} />
                  <Metrica label="Audiencias" valor={emp.audienciasCount} />
                  <Metrica label="Templates" valor={emp.templatesCount} />
                  <Metrica label="Campañas" valor={emp.campanasEnviadas} />
                  <Metrica label="Mensajes" valor={emp.mensajesOk} />
                  <Metrica label="Créditos" valor={emp.creditosSaldo} />
                </div>

                <div className="flex flex-col gap-2.5 border-t border-ys-border-softest pt-3.5">
                  <span className="text-[11.5px] font-bold text-ys-dim uppercase tracking-wide">
                    Permisos
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {PERMISO_KEYS.map((key) => (
                      <PermisoToggle
                        key={key}
                        label={PERMISO_LABEL[key]}
                        activo={permisos[key]}
                        disabled={trabajando}
                        onToggle={(v) => togglePermiso(emp, key, v)}
                      />
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap border-t border-ys-border-softest pt-3.5">
                  {emp.estado === "pendiente" && (
                    <button
                      onClick={() => cambiarEstado(emp, "activo")}
                      disabled={trabajando}
                      className="text-[13px] font-bold text-white bg-ys-green rounded-[10px] px-3.5 py-2.5 cursor-pointer transition-colors hover:bg-ys-green-hover disabled:opacity-40"
                    >
                      Aprobar
                    </button>
                  )}
                  {emp.estado === "activo" && (
                    <button
                      onClick={() => cambiarEstado(emp, "suspendido")}
                      disabled={trabajando}
                      className="text-[13px] font-bold text-ys-warn-text bg-white border border-ys-border rounded-[10px] px-3.5 py-2.5 cursor-pointer hover:bg-ys-warn-bg disabled:opacity-40"
                    >
                      Suspender
                    </button>
                  )}
                  {emp.estado === "suspendido" && (
                    <button
                      onClick={() => cambiarEstado(emp, "activo")}
                      disabled={trabajando}
                      className="text-[13px] font-bold text-ys-green-text bg-white border border-ys-border rounded-[10px] px-3.5 py-2.5 cursor-pointer hover:bg-ys-green-bg disabled:opacity-40"
                    >
                      Reactivar
                    </button>
                  )}
                  <button
                    onClick={() => onVerEmpleado(emp.tenantId)}
                    className="text-[13px] font-bold text-[#3f4844] bg-white border border-ys-border rounded-[10px] px-3.5 py-2.5 cursor-pointer transition-colors hover:bg-[#f7f9f8]"
                  >
                    Ver su actividad
                  </button>
                  <button
                    onClick={() => setConfirmarQuitar(emp)}
                    disabled={trabajando}
                    className="ml-auto text-[13px] font-bold text-ys-red-text bg-white border border-ys-border rounded-[10px] px-3.5 py-2.5 cursor-pointer hover:bg-ys-red-bg disabled:opacity-40"
                  >
                    Quitar del equipo
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {confirmarQuitar && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center px-4">
          <div
            className="absolute inset-0 bg-[rgba(16,24,20,0.45)]"
            onClick={() => setConfirmarQuitar(null)}
          />
          <div className="relative w-full max-w-[440px] bg-white border border-ys-border rounded-2xl p-5 md:p-6 flex flex-col gap-4 shadow-[0_20px_48px_rgba(16,24,20,0.18)]">
            <h2 className="text-[17px] font-extrabold text-ys-text">
              ¿Quitar a {confirmarQuitar.nombre} del equipo?
            </h2>
            <p className="text-[13.5px] text-ys-muted font-medium leading-relaxed">
              Deja de aparecer en tu empresa y no vas a ver más su actividad.
              <span className="font-bold text-ys-text">
                {" "}
                No se borra su cuenta ni sus contactos
              </span>
              : sigue usando YamaSend por su cuenta.
              {confirmarQuitar.creditosSaldo > 0 && (
                <>
                  {" "}
                  Sus {confirmarQuitar.creditosSaldo} créditos vuelven al pool.
                </>
              )}
            </p>
            <div className="flex items-center gap-2.5 pt-1">
              <button
                onClick={() => setConfirmarQuitar(null)}
                className="text-[13.5px] font-bold text-[#3f4844] bg-white border border-ys-border rounded-[10px] px-4 py-[11px] cursor-pointer hover:bg-[#f7f9f8]"
              >
                Cancelar
              </button>
              <button
                onClick={() => quitar(confirmarQuitar)}
                className="ml-auto text-[13.5px] font-bold text-white bg-[#c0392b] rounded-[10px] px-4 py-[11px] cursor-pointer hover:bg-[#a8331f]"
              >
                Quitar del equipo
              </button>
            </div>
          </div>
        </div>
      )}

      {invitarAbierto && (
        <InvitarEmpleadoModal
          onClose={() => setInvitarAbierto(false)}
          onCreada={onRefrescar}
        />
      )}
    </div>
  );
}
