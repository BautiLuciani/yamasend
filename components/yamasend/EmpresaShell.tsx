"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import type { EmpleadoResumen, EmpresaSection, EmpresaUser } from "@/lib/types";
import EmpresaSidebar from "./EmpresaSidebar";
import EmpresaDashboardSection from "./EmpresaDashboardSection";
import EmpresaIA from "./EmpresaIA";
import EmpresaEmpleadosSection from "./EmpresaEmpleadosSection";
import {
  EmpresaAudienciasSection,
  EmpresaCampanasSection,
  EmpresaContactosSection,
  EmpresaTemplatesSection,
  SectionHeader,
} from "./EmpresaSections";
import { useRouter } from "next/navigation";
import {
  getEmpresaAudienciasAction,
  getEmpresaInvitacionesAction,
  getEmpresaCampanasAction,
  getEmpresaContactosAction,
  getEmpresaTemplatesAction,
  type EmpresaAudiencia,
  type EmpresaCampana,
  type EmpresaContacto,
  type EmpresaDashboard,
  type EmpresaInvitacion,
  type EmpresaTemplate,
} from "@/lib/actions/empresa";

const CONTACTOS_POR_PAGINA = 50;

const VALID_SECTIONS: EmpresaSection[] = [
  "dashboard",
  "empleados",
  "contactos",
  "audiencias",
  "templates",
  "campanas",
  "ia",
];

interface Props {
  empresa: EmpresaUser;
  stats: EmpresaDashboard | null;
  empleados: EmpleadoResumen[];
  onLogout: () => void;
}

export default function EmpresaShell({
  empresa,
  stats,
  empleados,
  onLogout,
}: Props) {
  // La sección vive en la URL para que sobreviva a un refresh, con
  // window.history.replaceState en vez de router.push: mismo criterio que
  // AppShell, evita el spinner de Next en un cambio de tab que es estado local.
  function getInitialSection(): EmpresaSection {
    if (typeof window === "undefined") return "dashboard";
    const param = new URLSearchParams(window.location.search).get("section");
    return VALID_SECTIONS.includes(param as EmpresaSection)
      ? (param as EmpresaSection)
      : "dashboard";
  }

  const router = useRouter();
  const [section, setSectionState] = useState<EmpresaSection>(getInitialSection);
  const [drawerOpen, setDrawerOpen] = useState(false);

  function setSection(next: EmpresaSection) {
    setSectionState(next);
    setDrawerOpen(false);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      if (next === "dashboard") url.searchParams.delete("section");
      else url.searchParams.set("section", next);
      window.history.replaceState(null, "", url.toString());
    }
  }

  // Filtro por empleado, compartido entre las secciones de listado: si la
  // empresa entra desde el Dashboard a "ver un empleado", el filtro se mantiene
  // al saltar entre Contactos, Audiencias, Templates y Campañas.
  const [filtroTenant, setFiltroTenant] = useState<string | null>(null);

  const [contactos, setContactos] = useState<EmpresaContacto[]>([]);
  const [contactosTotal, setContactosTotal] = useState(0);
  const [contactosPagina, setContactosPagina] = useState(0);
  const [contactosBusqueda, setContactosBusqueda] = useState("");
  const [contactosCargando, setContactosCargando] = useState(false);

  const [invitaciones, setInvitaciones] = useState<EmpresaInvitacion[]>([]);
  const [audiencias, setAudiencias] = useState<EmpresaAudiencia[]>([]);
  const [templates, setTemplates] = useState<EmpresaTemplate[]>([]);
  const [campanas, setCampanas] = useState<EmpresaCampana[]>([]);

  // Los listados se cargan bajo demanda al entrar a cada sección, no todos en
  // la carga inicial: los contactos de un equipo entero pueden ser miles.
  const cargarContactos = useCallback(async () => {
    setContactosCargando(true);
    const res = await getEmpresaContactosAction(
      filtroTenant,
      contactosBusqueda,
      CONTACTOS_POR_PAGINA,
      contactosPagina * CONTACTOS_POR_PAGINA,
    );
    setContactos(res.contactos);
    setContactosTotal(res.total);
    setContactosCargando(false);
  }, [filtroTenant, contactosBusqueda, contactosPagina]);

  useEffect(() => {
    if (section !== "contactos") return;
    // Debounce: la búsqueda dispara en cada tecla y cada llamada es un RPC.
    const t = setTimeout(cargarContactos, 250);
    return () => clearTimeout(t);
  }, [section, cargarContactos]);

  useEffect(() => {
    if (section === "empleados") {
      getEmpresaInvitacionesAction().then(setInvitaciones);
    }
  }, [section]);

  // Tras una escritura (permisos, aprobación, invitación) hay que releer las
  // métricas y los empleados, que vienen del servidor. router.refresh() vuelve
  // a ejecutar el Server Component sin perder el estado local del shell —
  // sección activa, filtro por empleado, paginación.
  const refrescar = useCallback(() => {
    router.refresh();
    getEmpresaInvitacionesAction().then(setInvitaciones);
  }, [router]);

  useEffect(() => {
    if (section === "audiencias") {
      getEmpresaAudienciasAction(filtroTenant).then(setAudiencias);
    } else if (section === "templates") {
      getEmpresaTemplatesAction(filtroTenant).then(setTemplates);
    } else if (section === "campanas") {
      getEmpresaCampanasAction(filtroTenant).then(setCampanas);
    }
  }, [section, filtroTenant]);

  // Al cambiar el filtro o la búsqueda se vuelve a la primera página: quedarse
  // en la 3 con un empleado que tiene 20 contactos mostraría una lista vacía.
  // Se resetea en el handler y no en un efecto para no encadenar renders.
  function cambiarFiltroTenant(t: string | null) {
    setFiltroTenant(t);
    setContactosPagina(0);
  }

  function cambiarBusqueda(v: string) {
    setContactosBusqueda(v);
    setContactosPagina(0);
  }

  function verEmpleado(tenantId: string) {
    cambiarFiltroTenant(tenantId);
    setSection("campanas");
  }

  const totalPaginas = Math.max(1, Math.ceil(contactosTotal / CONTACTOS_POR_PAGINA));

  return (
    <div className="flex h-full bg-ys-bg overflow-x-hidden">
      <EmpresaSidebar
        active={section}
        onNavigate={setSection}
        orgNombre={empresa.orgNombre}
        onLogout={onLogout}
      />

      {/* Header mobile */}
      <div className="md:hidden fixed top-0 left-0 right-0 h-[58px] bg-ys-card border-b border-ys-border flex items-center px-4 gap-3 z-40">
        <button
          onClick={() => setDrawerOpen(true)}
          className="w-9 h-9 flex items-center justify-center rounded-[10px] hover:bg-ys-el2 cursor-pointer flex-none"
          aria-label="Abrir menú"
        >
          <svg width="19" height="19" viewBox="0 0 16 16" fill="none">
            <path d="M2.5 4h11M2.5 8h11M2.5 12h11" stroke="#16211b" strokeWidth="1.7" strokeLinecap="round" />
          </svg>
        </button>
        <Image
          src="/brand/logo-sidebar.png"
          alt="YamaSend"
          width={120}
          height={48}
          className="h-[30px] w-auto object-contain"
        />
      </div>

      {/* Drawer mobile */}
      {drawerOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div
            className="absolute inset-0 bg-[rgba(16,24,20,0.45)]"
            onClick={() => setDrawerOpen(false)}
          />
          <div className="relative w-[262px] max-w-[85vw] h-full bg-ys-card border-r border-ys-border px-3.5 pt-5 pb-4 flex flex-col gap-4 overflow-y-auto">
            <div className="flex flex-col gap-[3px]">
              {VALID_SECTIONS.map((key) => (
                <button
                  key={key}
                  onClick={() => setSection(key)}
                  className={`px-3 py-2.5 rounded-[10px] text-sm font-semibold text-left cursor-pointer transition-colors ${
                    section === key
                      ? "bg-ys-green-bg text-ys-green-text"
                      : "text-ys-muted hover:bg-ys-el2"
                  }`}
                >
                  {key === "campanas"
                    ? "Campañas"
                    : key === "ia"
                      ? "Asistente"
                      : key.charAt(0).toUpperCase() + key.slice(1)}
                </button>
              ))}
            </div>
            <div className="mt-auto border-t border-ys-border-softest pt-3.5 flex flex-col gap-[3px]">
              <div className="flex items-center gap-[11px] px-3 pt-2 pb-3">
                <div className="w-[38px] h-[38px] rounded-full bg-ys-dark text-white text-[13px] font-extrabold flex items-center justify-center flex-shrink-0">
                  {empresa.orgNombre
                    .split(" ")
                    .map((p) => p[0])
                    .slice(0, 2)
                    .join("")
                    .toUpperCase() || "?"}
                </div>
                <div className="flex flex-col gap-px min-w-0">
                  <div className="text-sm font-bold text-ys-text truncate">
                    {empresa.orgNombre}
                  </div>
                  <div className="text-[12.5px] text-ys-dim font-medium truncate">
                    Empresa
                  </div>
                </div>
              </div>
              <button
                onClick={onLogout}
                className="px-3 py-2.5 rounded-[10px] text-[13.5px] font-semibold text-ys-orange hover:bg-ys-warn-bg text-left cursor-pointer"
              >
                Cerrar sesión
              </button>
            </div>
          </div>
        </div>
      )}

      {/* El chat maneja su propio scroll interno y necesita altura fija; el
          resto de las secciones scrollean el contenedor. */}
      <div
        className={`flex-1 min-w-0 flex flex-col pt-[58px] md:pt-0 ${
          section === "ia" ? "overflow-hidden h-screen" : "overflow-y-auto"
        }`}
      >
        {section === "dashboard" && (
          <EmpresaDashboardSection
            stats={stats}
            empleados={empleados}
            onVerEmpleado={verEmpleado}
          />
        )}

        {section === "empleados" && (
          <EmpresaEmpleadosSection
            empleados={empleados}
            invitaciones={invitaciones}
            creditosPool={stats?.creditosPool ?? empresa.creditosPool}
            onVerEmpleado={verEmpleado}
            onRefrescar={refrescar}
          />
        )}

        {section === "contactos" && (
          <div className="flex flex-col gap-5 px-4 md:px-[38px] pt-3 md:pt-[34px] pb-[34px]">
            <SectionHeader
              titulo="Contactos"
              subtitulo="Contactos importados por tu equipo. Por privacidad solo se muestran nombre y teléfono."
              empleados={empleados}
              filtroTenant={filtroTenant}
              onFiltroChange={cambiarFiltroTenant}
              busqueda={contactosBusqueda}
              onBusquedaChange={cambiarBusqueda}
              placeholderBusqueda="Buscar por nombre o teléfono..."
            />
            <EmpresaContactosSection
              contactos={contactos}
              total={contactosTotal}
              cargando={contactosCargando}
            />
            {totalPaginas > 1 && (
              <div className="flex items-center justify-center gap-3">
                <button
                  disabled={contactosPagina === 0}
                  onClick={() => setContactosPagina((p) => Math.max(0, p - 1))}
                  className="text-[13px] font-bold text-[#3f4844] bg-white border border-ys-border rounded-[10px] px-3.5 py-2.5 cursor-pointer transition-colors hover:bg-[#f7f9f8] disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Anterior
                </button>
                <span className="text-[13px] font-semibold text-ys-muted">
                  {contactosPagina + 1} de {totalPaginas}
                </span>
                <button
                  disabled={contactosPagina + 1 >= totalPaginas}
                  onClick={() => setContactosPagina((p) => p + 1)}
                  className="text-[13px] font-bold text-[#3f4844] bg-white border border-ys-border rounded-[10px] px-3.5 py-2.5 cursor-pointer transition-colors hover:bg-[#f7f9f8] disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Siguiente
                </button>
              </div>
            )}
          </div>
        )}

        {section === "audiencias" && (
          <div className="flex flex-col gap-5 px-4 md:px-[38px] pt-3 md:pt-[34px] pb-[34px]">
            <SectionHeader
              titulo="Audiencias"
              subtitulo="Segmentos de contactos creados por tu equipo."
              empleados={empleados}
              filtroTenant={filtroTenant}
              onFiltroChange={cambiarFiltroTenant}
            />
            <EmpresaAudienciasSection audiencias={audiencias} />
          </div>
        )}

        {section === "templates" && (
          <div className="flex flex-col gap-5 px-4 md:px-[38px] pt-3 md:pt-[34px] pb-[34px]">
            <SectionHeader
              titulo="Templates"
              subtitulo="Plantillas de mensaje creadas por tu equipo y su estado en Meta."
              empleados={empleados}
              filtroTenant={filtroTenant}
              onFiltroChange={cambiarFiltroTenant}
            />
            <EmpresaTemplatesSection templates={templates} />
          </div>
        )}

        {section === "ia" && <EmpresaIA orgNombre={empresa.orgNombre} />}

        {section === "campanas" && (
          <div className="flex flex-col gap-5 px-4 md:px-[38px] pt-3 md:pt-[34px] pb-[34px]">
            <SectionHeader
              titulo="Campañas"
              subtitulo="Envíos de tu equipo con sus métricas de entrega y lectura."
              empleados={empleados}
              filtroTenant={filtroTenant}
              onFiltroChange={cambiarFiltroTenant}
            />
            <EmpresaCampanasSection campanas={campanas} />
          </div>
        )}
      </div>
    </div>
  );
}
