"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import {
  cargarPoolAction,
  crearOrganizacionAction,
  getAdminOrganizacionesAction,
  invitarEmpresaAction,
  type AdminOrganizacion,
} from "@/lib/actions/admin";

export default function AdminShell({
  nombre,
  onLogout,
}: {
  nombre: string;
  onLogout: () => void;
}) {
  const [orgs, setOrgs] = useState<AdminOrganizacion[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);

  const [crearAbierto, setCrearAbierto] = useState(false);
  const [nuevoNombre, setNuevoNombre] = useState("");
  const [nuevoEmail, setNuevoEmail] = useState("");
  const [nuevosCreditos, setNuevosCreditos] = useState("");

  const [cargarEn, setCargarEn] = useState<AdminOrganizacion | null>(null);
  const [montoCarga, setMontoCarga] = useState("");

  const [invitarEn, setInvitarEn] = useState<AdminOrganizacion | null>(null);
  const [emailInvitar, setEmailInvitar] = useState("");
  const [linkGenerado, setLinkGenerado] = useState<string | null>(null);

  const recargar = useCallback(async () => {
    const datos = await getAdminOrganizacionesAction();
    setOrgs(datos);
    setCargando(false);
  }, []);

  useEffect(() => {
    // Sin setState sincrónico dentro del efecto: se dispara la promesa y el
    // estado se actualiza cuando resuelve, evitando renders en cascada.
    let vigente = true;
    getAdminOrganizacionesAction().then((datos) => {
      if (!vigente) return;
      setOrgs(datos);
      setCargando(false);
    });
    return () => {
      vigente = false;
    };
  }, []);

  async function crear() {
    setOcupado("crear");
    setError(null);
    const res = await crearOrganizacionAction(
      nuevoNombre.trim(),
      nuevoEmail.trim(),
      parseInt(nuevosCreditos, 10) || 0,
    );
    setOcupado(null);
    if (!res.ok) return setError(res.error);
    setCrearAbierto(false);
    setNuevoNombre("");
    setNuevoEmail("");
    setNuevosCreditos("");
    recargar();
  }

  async function cargar() {
    if (!cargarEn) return;
    const monto = parseInt(montoCarga, 10);
    if (!Number.isFinite(monto) || monto === 0) {
      return setError("Ingresá una cantidad distinta de cero.");
    }
    setOcupado(cargarEn.id);
    setError(null);
    const res = await cargarPoolAction(cargarEn.id, monto);
    setOcupado(null);
    if (!res.ok) return setError(res.error);
    setCargarEn(null);
    setMontoCarga("");
    recargar();
  }

  async function invitar() {
    if (!invitarEn) return;
    setOcupado(invitarEn.id);
    setError(null);
    const res = await invitarEmpresaAction(invitarEn.id, emailInvitar.trim());
    setOcupado(null);
    if (!res.ok || !res.token) return setError(res.error);
    setLinkGenerado(`${window.location.origin}/register?invite=${res.token}`);
    recargar();
  }

  const totalPool = orgs.reduce((t, o) => t + o.creditosPool, 0);
  const totalEmpleados = orgs.reduce((t, o) => t + o.empleadosTotal, 0);
  const totalMensajes = orgs.reduce((t, o) => t + o.mensajesEnviados, 0);

  return (
    <div className="min-h-screen bg-ys-bg">
      <div className="bg-ys-dark px-4 md:px-[38px] py-3.5 flex items-center gap-3">
        <Image
          src="/brand/logo-sidebar.png"
          alt="YamaSend"
          width={120}
          height={48}
          className="h-[28px] w-auto object-contain brightness-0 invert"
        />
        <span className="text-[11px] font-extrabold text-ys-dark bg-white rounded-full px-2.5 py-1 uppercase tracking-wide">
          Admin
        </span>
        <span className="ml-auto text-[13px] font-semibold text-white/70">
          {nombre}
        </span>
        <button
          onClick={onLogout}
          className="text-[13px] font-bold text-white/90 hover:text-white cursor-pointer"
        >
          Salir
        </button>
      </div>

      <div className="px-4 md:px-[38px] py-6 md:py-8 flex flex-col gap-5 md:gap-6 max-w-[1200px]">
        <div className="flex items-start gap-3 flex-wrap">
          <div className="flex flex-col gap-1.5">
            <h1 className="text-2xl md:text-[28px] font-extrabold tracking-[-0.025em] text-ys-text">
              Organizaciones
            </h1>
            <p className="text-sm md:text-[15px] text-ys-dim font-medium">
              Alta de empresas, carga de créditos y estado de cada cuenta.
            </p>
          </div>
          <button
            onClick={() => setCrearAbierto(true)}
            className="ml-auto flex-none flex items-center gap-2 bg-ys-green text-white text-[13.5px] font-bold px-[17px] py-[11px] rounded-[10px] cursor-pointer transition-all hover:bg-ys-green-hover"
          >
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
              <path d="M8 3.5v9M3.5 8h9" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
            </svg>
            Nueva empresa
          </button>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          {[
            { l: "Empresas", v: orgs.length },
            { l: "Empleados", v: totalEmpleados },
            { l: "Créditos en pools", v: totalPool },
            { l: "Mensajes enviados", v: totalMensajes },
          ].map((k) => (
            <div key={k.l} className="bg-white border border-ys-border rounded-2xl px-4 py-4 flex flex-col gap-1.5">
              <span className="text-[12.5px] font-semibold text-ys-dim">{k.l}</span>
              <span className="text-[26px] font-extrabold font-mono tracking-[-0.02em] text-ys-text leading-none">
                {k.v}
              </span>
            </div>
          ))}
        </div>

        {error && (
          <div className="bg-ys-red-bg border border-ys-red-border rounded-xl px-4 py-3">
            <span className="text-[13px] font-semibold text-ys-red-text">{error}</span>
          </div>
        )}

        {cargando ? (
          <div className="bg-white border border-ys-border rounded-2xl py-14 text-center">
            <span className="text-[13.5px] font-semibold text-ys-dim">Cargando...</span>
          </div>
        ) : orgs.length === 0 ? (
          <div className="bg-white border border-ys-border rounded-2xl py-14 text-center px-6">
            <span className="text-[13.5px] font-semibold text-ys-dim">
              Todavía no hay organizaciones. Creá la primera con el botón de arriba.
            </span>
          </div>
        ) : (
          <div className="flex flex-col gap-3 md:gap-3.5">
            {orgs.map((o) => (
              <div
                key={o.id}
                className="bg-white border border-ys-border rounded-2xl p-4 md:p-[18px] flex flex-col gap-4"
              >
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <span className="text-[15px] font-extrabold text-ys-text truncate">
                      {o.nombre}
                    </span>
                    <span className="text-[12.5px] font-medium text-ys-dim truncate">
                      {o.contactoEmail ?? "Sin email de contacto"}
                    </span>
                  </div>
                  <div className="ml-auto flex items-center gap-2 flex-none">
                    {!o.tieneCuentaEmpresa && (
                      <span className="text-[11.5px] font-bold text-ys-warn-text bg-ys-warn-bg rounded-full px-2.5 py-1">
                        Sin cuenta creada
                      </span>
                    )}
                    {o.empleadosPendientes > 0 && (
                      <span className="text-[11.5px] font-bold text-ys-warn-text bg-ys-warn-bg rounded-full px-2.5 py-1">
                        {o.empleadosPendientes} sin aprobar
                      </span>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 border-t border-ys-border-softest pt-3.5">
                  {[
                    { l: "Pool", v: o.creditosPool },
                    { l: "Repartidos", v: o.creditosRepartidos },
                    { l: "Empleados", v: o.empleadosTotal },
                    { l: "Mensajes", v: o.mensajesEnviados },
                  ].map((m) => (
                    <div key={m.l} className="flex flex-col gap-0.5">
                      <span className="text-[17px] font-extrabold font-mono text-ys-text leading-none">
                        {m.v}
                      </span>
                      <span className="text-[11.5px] font-semibold text-ys-dim">{m.l}</span>
                    </div>
                  ))}
                </div>

                <div className="flex items-center gap-2 flex-wrap border-t border-ys-border-softest pt-3.5">
                  <button
                    onClick={() => {
                      setCargarEn(o);
                      setMontoCarga("");
                      setError(null);
                    }}
                    disabled={ocupado === o.id}
                    className="text-[13px] font-bold text-white bg-ys-green rounded-[10px] px-3.5 py-2.5 cursor-pointer hover:bg-ys-green-hover disabled:opacity-40"
                  >
                    Cargar créditos
                  </button>
                  <button
                    onClick={() => {
                      setInvitarEn(o);
                      setEmailInvitar(o.contactoEmail ?? "");
                      setLinkGenerado(null);
                      setError(null);
                    }}
                    disabled={ocupado === o.id}
                    className="text-[13px] font-bold text-[#3f4844] bg-white border border-ys-border rounded-[10px] px-3.5 py-2.5 cursor-pointer hover:bg-[#f7f9f8] disabled:opacity-40"
                  >
                    {o.tieneCuentaEmpresa ? "Reinvitar dueño" : "Crear cuenta de empresa"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {crearAbierto && (
        <Modal onClose={() => setCrearAbierto(false)} titulo="Nueva empresa">
          <Campo label="Nombre" value={nuevoNombre} onChange={setNuevoNombre} placeholder="Inmobiliaria Pérez" />
          <Campo label="Email de contacto" value={nuevoEmail} onChange={setNuevoEmail} placeholder="dueño@empresa.com" />
          <Campo label="Créditos iniciales" value={nuevosCreditos} onChange={setNuevosCreditos} placeholder="0" numero />
          {error && <ErrorTxt>{error}</ErrorTxt>}
          <Acciones
            onCancel={() => setCrearAbierto(false)}
            onOk={crear}
            okLabel="Crear"
            disabled={ocupado === "crear" || nuevoNombre.trim().length < 2}
          />
        </Modal>
      )}

      {cargarEn && (
        <Modal onClose={() => setCargarEn(null)} titulo={`Créditos de ${cargarEn.nombre}`}>
          <p className="text-[13px] text-ys-dim font-medium">
            Pool actual: {cargarEn.creditosPool}. Poné un número negativo para descontar.
          </p>
          <Campo label="Cantidad" value={montoCarga} onChange={setMontoCarga} placeholder="1000" numero />
          {error && <ErrorTxt>{error}</ErrorTxt>}
          <Acciones onCancel={() => setCargarEn(null)} onOk={cargar} okLabel="Cargar" disabled={ocupado === cargarEn.id} />
        </Modal>
      )}

      {invitarEn && (
        <Modal onClose={() => setInvitarEn(null)} titulo={`Cuenta de ${invitarEn.nombre}`}>
          {linkGenerado ? (
            <>
              <p className="text-[13px] text-ys-dim font-medium">
                Mandale este link. Al registrarse queda como cuenta de empresa,
                sin necesidad de aprobación.
              </p>
              <div className="bg-[#fbfcfb] border border-ys-border rounded-xl px-3.5 py-3">
                <span className="text-[12.5px] font-mono text-ys-muted break-all">{linkGenerado}</span>
              </div>
              <button
                onClick={() => navigator.clipboard.writeText(linkGenerado)}
                className="w-full bg-ys-green text-white text-[13.5px] font-bold px-[17px] py-[11px] rounded-[10px] cursor-pointer hover:bg-ys-green-hover"
              >
                Copiar link
              </button>
            </>
          ) : (
            <>
              {invitarEn.tieneCuentaEmpresa && (
                <p className="text-[13px] font-semibold text-ys-warn-text bg-ys-warn-bg rounded-xl px-3.5 py-2.5">
                  Esta empresa ya tiene una cuenta. Un link nuevo crea una segunda.
                </p>
              )}
              <Campo label="Email del dueño" value={emailInvitar} onChange={setEmailInvitar} placeholder="dueño@empresa.com" />
              {error && <ErrorTxt>{error}</ErrorTxt>}
              <Acciones
                onCancel={() => setInvitarEn(null)}
                onOk={invitar}
                okLabel="Generar link"
                disabled={ocupado === invitarEn.id || emailInvitar.trim().length === 0}
              />
            </>
          )}
        </Modal>
      )}
    </div>
  );
}

/* ── Piezas del formulario, locales al panel ── */

function Modal({
  titulo,
  onClose,
  children,
}: {
  titulo: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center px-4 py-6">
      <div className="absolute inset-0 bg-[rgba(16,24,20,0.45)]" onClick={onClose} />
      <div className="relative w-full max-w-[460px] max-h-full overflow-y-auto bg-white border border-ys-border rounded-2xl p-5 md:p-6 flex flex-col gap-4 shadow-[0_20px_48px_rgba(16,24,20,0.18)]">
        <h2 className="text-[17px] font-extrabold text-ys-text">{titulo}</h2>
        {children}
      </div>
    </div>
  );
}

function Campo({
  label,
  value,
  onChange,
  placeholder,
  numero,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  numero?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[12.5px] font-bold text-ys-text">{label}</span>
      <input
        type={numero ? "number" : "text"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`bg-white border border-ys-border rounded-[10px] px-3.5 py-2.5 text-[13.5px] font-semibold text-ys-text outline-none focus:border-ys-green-border ${numero ? "font-mono" : ""}`}
      />
    </label>
  );
}

function ErrorTxt({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[12.5px] font-semibold text-ys-red-text">{children}</span>
  );
}

function Acciones({
  onCancel,
  onOk,
  okLabel,
  disabled,
}: {
  onCancel: () => void;
  onOk: () => void;
  okLabel: string;
  disabled: boolean;
}) {
  return (
    <div className="flex items-center gap-2.5 pt-1">
      <button
        onClick={onCancel}
        className="text-[13.5px] font-bold text-[#3f4844] bg-white border border-ys-border rounded-[10px] px-4 py-[11px] cursor-pointer hover:bg-[#f7f9f8]"
      >
        Cancelar
      </button>
      <button
        onClick={onOk}
        disabled={disabled}
        className="ml-auto text-[13.5px] font-bold text-white bg-ys-green rounded-[10px] px-4 py-[11px] cursor-pointer hover:bg-ys-green-hover disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {okLabel}
      </button>
    </div>
  );
}
