"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchNovedades } from "@/lib/novedades/cliente";
import type {
  AppSection,
  EstadoCampanaAviso,
  EstadoTemplateAviso,
  Novedades,
} from "@/lib/types";

/**
 * Avisos (puntitos) del sidebar: "pasó algo en esta sección desde la última
 * vez que entraste". Pedido de Bauti y Pato (2026-10).
 *
 * Qué secciones tienen aviso y por qué (solo cosas que NO dispara el propio
 * usuario con un click — esas ya las ve en el momento):
 *  - Templates:  Meta aprobó un template (novedad) o lo rechazó (atención).
 *                Meta puede tardar horas; es justo lo que el usuario espera.
 *  - Campañas:   terminó una campaña programada o del motor (novedad), o
 *                terminó con error (atención).
 *  - Contactos:  te escribió alguien por primera vez (novedad), o el WhatsApp
 *                se desvinculó (atención: sin eso no entra nada nuevo).
 *  - Dashboard:  respondieron un mensaje de campaña (cambian sus métricas).
 *  - Audiencias: sin aviso. Solo cambian por acciones del propio usuario.
 *  - IA:         sin aviso. Ya está destacada, y los avisos que le tocan
 *                (ej. template aprobado) ya llegan dentro del chat.
 *
 * Mecánica: se consulta yamas_send_novedades() cada 30 s (solo con la
 * pestaña visible) desde el navegador. Para templates y campañas se guarda
 * una "foto" del estado de cada uno en la última visita y se avisa si algo
 * pasó a un estado final desde entonces (no depende de qué workflow cambie
 * el estado ni de updated_at). Para contactos y dashboard se compara la hora
 * del último evento contra la última visita. Todo queda en localStorage por
 * tenant; la primera vez se toma la situación actual como "ya vista", para
 * no encender todo con cosas viejas. La sección abierta nunca muestra aviso.
 */

export type TipoAviso = "novedad" | "atencion";
export type AvisosSidebar = Partial<Record<AppSection, TipoAviso>>;

interface Vistas {
  /** Última visita (hora del server, ISO). */
  dashboard: string;
  contactos: string;
  /** Foto del estado de cada template / campaña en la última visita. */
  templates: Record<string, EstadoTemplateAviso>;
  campanas: Record<string, EstadoCampanaAviso>;
  /** Alguna vez se vio el WhatsApp conectado (para el aviso de desvinculado). */
  whatsappVisto: boolean;
}

const POLL_MS = 30_000;

function claveStorage(tenantId: string) {
  return `yamasend-avisos-v2-${tenantId}`;
}

function esIsoValido(v: unknown): v is string {
  return typeof v === "string" && Number.isFinite(Date.parse(v));
}

function leerVistas(tenantId: string): Vistas | null {
  try {
    const raw = window.localStorage.getItem(claveStorage(tenantId));
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<Vistas>;
    if (!esIsoValido(v.dashboard) || !esIsoValido(v.contactos)) return null;
    if (!v.templates || typeof v.templates !== "object") return null;
    if (!v.campanas || typeof v.campanas !== "object") return null;
    return {
      dashboard: v.dashboard,
      contactos: v.contactos,
      templates: v.templates,
      campanas: v.campanas,
      whatsappVisto: v.whatsappVisto === true,
    };
  } catch {
    return null;
  }
}

function maxIso(a: string, b: string): string {
  const ma = Date.parse(a);
  const mb = Date.parse(b);
  if (!Number.isFinite(ma)) return b;
  if (!Number.isFinite(mb)) return a;
  return ma >= mb ? a : b;
}

/**
 * Combina dos versiones (ej. de dos pestañas): la hora más nueva por
 * sección, las fotos unidas (gana la que se está escribiendo) y el flag de
 * WhatsApp si cualquiera lo vio.
 */
function combinar(nueva: Vistas, otra: Vistas | null): Vistas {
  if (!otra) return nueva;
  return {
    dashboard: maxIso(nueva.dashboard, otra.dashboard),
    contactos: maxIso(nueva.contactos, otra.contactos),
    templates: { ...otra.templates, ...nueva.templates },
    campanas: { ...otra.campanas, ...nueva.campanas },
    whatsappVisto: nueva.whatsappVisto || otra.whatsappVisto,
  };
}

/** Guarda combinando con lo que ya hay. Devuelve lo que quedó. */
function guardarVistas(tenantId: string, vistas: Vistas): Vistas {
  const combinadas = combinar(vistas, leerVistas(tenantId));
  try {
    window.localStorage.setItem(claveStorage(tenantId), JSON.stringify(combinadas));
  } catch {
    // Sin storage (modo privado, etc.): los avisos funcionan igual durante la sesión.
  }
  return combinadas;
}

/** true si `evento` es posterior a `visto`. */
function despues(evento: string | null, visto: string): boolean {
  if (!evento) return false;
  const e = Date.parse(evento);
  const v = Date.parse(visto);
  return Number.isFinite(e) && Number.isFinite(v) && e > v;
}

/** Aplica "visto" a una sección con los datos actuales. */
function marcar(prev: Vistas, seccion: AppSection, n: Novedades): Vistas {
  switch (seccion) {
    case "dashboard":
      return { ...prev, dashboard: maxIso(prev.dashboard, n.ahora) };
    case "contactos":
      return { ...prev, contactos: maxIso(prev.contactos, n.ahora) };
    case "templates":
      return { ...prev, templates: { ...prev.templates, ...n.templatesEstados } };
    case "campanas":
      return { ...prev, campanas: { ...prev.campanas, ...n.campanasEstados } };
    default:
      return prev;
  }
}

export function useAvisosSidebar({
  tenantId,
  activeSection,
  whatsappConectado,
}: {
  tenantId: string;
  activeSection: AppSection;
  /** Estado en tiempo real que ya mantiene AppShell (null = todavía no se sabe). */
  whatsappConectado: boolean | null;
}): {
  avisos: AvisosSidebar;
  /** Llamar al navegar, con la sección que se deja y la que se abre. */
  marcarSecciones: (secciones: AppSection[]) => void;
} {
  const [novedades, setNovedades] = useState<Novedades | null>(null);
  const [vistas, setVistas] = useState<Vistas | null>(null);

  // Refs para leer el valor vigente desde callbacks async (poll, navegación).
  const activeRef = useRef(activeSection);
  const whatsappRef = useRef(whatsappConectado);
  const novedadesRef = useRef<Novedades | null>(null);
  useEffect(() => {
    activeRef.current = activeSection;
  }, [activeSection]);
  useEffect(() => {
    whatsappRef.current = whatsappConectado;
  }, [whatsappConectado]);

  const consultar = useCallback(async () => {
    const n = await fetchNovedades();
    if (!n) return;
    novedadesRef.current = n;
    setNovedades(n);
    setVistas((prev) => {
      // Primera vez: lo guardado o, si no hay, la situación actual como vista.
      let base =
        prev ??
        leerVistas(tenantId) ?? {
          dashboard: n.ahora,
          contactos: n.ahora,
          templates: n.templatesEstados,
          campanas: n.campanasEstados,
          whatsappVisto: false,
        };
      // La sección abierta se va marcando como vista en cada consulta.
      base = marcar(base, activeRef.current, n);
      if (whatsappRef.current === true && !base.whatsappVisto) {
        base = { ...base, whatsappVisto: true };
      }
      return guardarVistas(tenantId, base);
    });
  }, [tenantId]);

  // Polling solo con la pestaña visible; al volver, consulta en el acto.
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    const arrancar = () => {
      if (!timer && document.visibilityState === "visible") {
        timer = setInterval(consultar, POLL_MS);
      }
    };
    const frenar = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };
    const onVisibilidad = () => {
      if (document.visibilityState === "visible") {
        void consultar();
        arrancar();
      } else {
        frenar();
      }
    };
    // Primera consulta agendada (no en el cuerpo del efecto).
    const inicial = setTimeout(consultar, 0);
    arrancar();
    document.addEventListener("visibilitychange", onVisibilidad);
    return () => {
      clearTimeout(inicial);
      frenar();
      document.removeEventListener("visibilitychange", onVisibilidad);
    };
  }, [consultar]);

  // Otras pestañas del mismo usuario: lo que marquen como visto se refleja acá.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== claveStorage(tenantId)) return;
      const otras = leerVistas(tenantId);
      if (!otras) return;
      setVistas((prev) => (prev ? combinar(prev, otras) : otras));
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [tenantId]);

  // Al navegar, la sección que se deja (lo que pasó mientras estaba abierta
  // ya se vio) y la que se abre quedan como vistas, con los últimos datos.
  const marcarSecciones = useCallback(
    (secciones: AppSection[]) => {
      const n = novedadesRef.current;
      if (!n) return;
      setVistas((prev) => {
        if (!prev) return prev;
        let next = prev;
        for (const s of secciones) next = marcar(next, s, n);
        return next === prev ? prev : guardarVistas(tenantId, next);
      });
    },
    [tenantId],
  );

  if (!novedades || !vistas) return { avisos: {}, marcarSecciones };

  const avisos: AvisosSidebar = {};

  // Templates: alguno pasó a aprobado/rechazado desde la última visita.
  let tplNovedad = false;
  let tplRechazo = false;
  for (const [id, estado] of Object.entries(novedades.templatesEstados)) {
    if (estado === "pendiente" || vistas.templates[id] === estado) continue;
    if (estado === "rechazado") tplRechazo = true;
    else tplNovedad = true;
  }
  if (tplRechazo) avisos.templates = "atencion";
  else if (tplNovedad) avisos.templates = "novedad";

  // Campañas programadas / del motor: alguna terminó desde la última visita.
  let campNovedad = false;
  let campError = false;
  for (const [id, estado] of Object.entries(novedades.campanasEstados)) {
    if (estado === "pendiente" || vistas.campanas[id] === estado) continue;
    if (estado === "error") campError = true;
    else campNovedad = true;
  }
  if (campError) avisos.campanas = "atencion";
  else if (campNovedad) avisos.campanas = "novedad";

  // WhatsApp desvinculado: es un estado, no un evento. Se muestra mientras
  // dure (estuvo conectado y ya no) y se apaga solo al reconectar; el estado
  // en tiempo real de AppShell es el que manda.
  const whatsappCaido =
    whatsappConectado === false && (novedades.whatsappDesvinculado || vistas.whatsappVisto);
  if (whatsappCaido) avisos.contactos = "atencion";
  else if (despues(novedades.contactosNuevoAt, vistas.contactos)) avisos.contactos = "novedad";

  if (despues(novedades.dashboardRespuestaAt, vistas.dashboard)) avisos.dashboard = "novedad";

  // La sección abierta nunca muestra aviso.
  delete avisos[activeSection];
  return { avisos, marcarSecciones };
}
