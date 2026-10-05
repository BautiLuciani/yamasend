"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchNovedades } from "@/lib/novedades/cliente";
import type { AppSection, Novedades } from "@/lib/types";

/**
 * Avisos (puntitos) del sidebar: "pasó algo en esta sección desde la última
 * vez que entraste". Pedido de Bauti y Pato (2026-10).
 *
 * Qué secciones tienen aviso y por qué (solo eventos que NO dispara el propio
 * usuario con un click — esos ya los ve en el momento):
 *  - Templates:  Meta aprobó un template (novedad) o lo rechazó (atención).
 *                Meta puede tardar horas; es justo lo que el usuario espera.
 *  - Campañas:   una campaña terminó de enviarse, típicamente una programada
 *                (novedad), o falló (atención).
 *  - Contactos:  te escribió alguien nuevo (novedad), o el WhatsApp quedó
 *                desvinculado (atención: sin eso no se importa ni se analiza).
 *  - Dashboard:  respondieron un mensaje de campaña o hubo un evento del
 *                sistema (WhatsApp conectado/desconectado, análisis).
 *  - Audiencias: sin aviso. Solo cambian por acciones del propio usuario.
 *  - IA:         sin aviso. Ya está destacada, y los avisos que le tocan
 *                (ej. template aprobado) ya llegan dentro del chat.
 *
 * Mecánica: se consulta yamas_send_novedades() cada 30 s (solo con la
 * pestaña visible) y se compara contra la última visita a cada sección,
 * guardada en localStorage por tenant. La sección abierta nunca muestra
 * aviso y se marca como vista. En la primera carga se toma "ahora" como
 * última visita, para no encender todo con eventos viejos.
 */

export type TipoAviso = "novedad" | "atencion";
export type AvisosSidebar = Partial<Record<AppSection, TipoAviso>>;

type SeccionConAviso = "dashboard" | "contactos" | "templates" | "campanas";
type Vistas = Record<SeccionConAviso, string>;

const SECCIONES: SeccionConAviso[] = ["dashboard", "contactos", "templates", "campanas"];
const POLL_MS = 30_000;

function claveStorage(tenantId: string) {
  return `yamasend-avisos-vistos-${tenantId}`;
}

function leerVistas(tenantId: string): Vistas | null {
  try {
    const raw = window.localStorage.getItem(claveStorage(tenantId));
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<Vistas>;
    return SECCIONES.every((s) => typeof v[s] === "string") ? (v as Vistas) : null;
  } catch {
    return null;
  }
}

/**
 * Guarda combinando con lo que ya hay (máximo por sección): con varias
 * pestañas abiertas, una pestaña vieja no pisa lo que otra ya marcó como
 * visto. Devuelve lo que quedó guardado.
 */
function guardarVistas(tenantId: string, vistas: Vistas): Vistas {
  const actuales = leerVistas(tenantId);
  const combinadas = actuales
    ? (Object.fromEntries(
        SECCIONES.map((s) => [s, maxIso(vistas[s], actuales[s])]),
      ) as Vistas)
    : vistas;
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

function maxIso(a: string, b: string): string {
  const ma = Date.parse(a);
  const mb = Date.parse(b);
  // Un valor corrupto en storage no debe ganarle a uno válido.
  if (!Number.isFinite(ma)) return b;
  if (!Number.isFinite(mb)) return a;
  return ma >= mb ? a : b;
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
  /** Llamar al cambiar de sección (evento de navegación) con la que se deja y la que se abre. */
  marcarSecciones: (secciones: AppSection[]) => void;
} {
  const [novedades, setNovedades] = useState<Novedades | null>(null);
  const [vistas, setVistas] = useState<Vistas | null>(null);
  const activeRef = useRef(activeSection);
  useEffect(() => {
    activeRef.current = activeSection;
  }, [activeSection]);
  // Reloj del server: hora de la última respuesta + tiempo transcurrido en el
  // navegador desde entonces. Así un reloj local desfasado no altera nada.
  const relojRef = useRef<{ serverMs: number; clienteMs: number } | null>(null);
  const ahoraServer = useCallback((): string | null => {
    const r = relojRef.current;
    if (!r) return null;
    return new Date(r.serverMs + (Date.now() - r.clienteMs)).toISOString();
  }, []);

  // Marca la sección abierta como vista al momento `ahora` (hora del server).
  const marcarVista = useCallback(
    (seccion: AppSection, ahora: string) => {
      if (!SECCIONES.includes(seccion as SeccionConAviso)) return;
      setVistas((prev) => {
        if (!prev) return prev;
        const s = seccion as SeccionConAviso;
        const nuevo = maxIso(prev[s], ahora);
        if (nuevo === prev[s]) return prev;
        return guardarVistas(tenantId, { ...prev, [s]: nuevo });
      });
    },
    [tenantId],
  );

  const consultar = useCallback(async () => {
    const n = await fetchNovedades();
    if (!n) return;
    const serverMs = Date.parse(n.ahora);
    if (Number.isFinite(serverMs)) relojRef.current = { serverMs, clienteMs: Date.now() };
    setNovedades(n);
    setVistas((prev) => {
      if (prev) return prev;
      // Primera vez: arrancar desde lo guardado o, si no hay, desde "ahora".
      const guardadas = leerVistas(tenantId);
      const iniciales: Vistas = guardadas ?? {
        dashboard: n.ahora,
        contactos: n.ahora,
        templates: n.ahora,
        campanas: n.ahora,
      };
      return guardadas ?? guardarVistas(tenantId, iniciales);
    });
    marcarVista(activeRef.current, n.ahora);
  }, [tenantId, marcarVista]);

  // Polling solo con la pestaña visible; al volver, consulta en el acto.
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    const arrancar = () => {
      if (!timer && document.visibilityState === "visible") timer = setInterval(consultar, POLL_MS);
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

  // Otras pestañas del mismo usuario: si marcan algo como visto, se refleja acá.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== claveStorage(tenantId)) return;
      const otras = leerVistas(tenantId);
      if (!otras) return;
      setVistas((prev) =>
        prev
          ? (Object.fromEntries(SECCIONES.map((s) => [s, maxIso(prev[s], otras[s])])) as Vistas)
          : otras,
      );
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [tenantId]);

  // Al navegar se marcan como vistas la sección que se deja (lo que pasó
  // mientras estaba abierta ya se vio) y la que se abre.
  const marcarSecciones = useCallback(
    (secciones: AppSection[]) => {
      const ahora = ahoraServer();
      if (!ahora) return;
      for (const s of secciones) marcarVista(s, ahora);
    },
    [ahoraServer, marcarVista],
  );

  if (!novedades || !vistas) return { avisos: {}, marcarSecciones };

  const avisos: AvisosSidebar = {};

  if (despues(novedades.templatesRechazadoAt, vistas.templates)) avisos.templates = "atencion";
  else if (despues(novedades.templatesAprobadoAt, vistas.templates)) avisos.templates = "novedad";

  if (despues(novedades.campanasErrorAt, vistas.campanas)) avisos.campanas = "atencion";
  else if (despues(novedades.campanasEnviadaAt, vistas.campanas)) avisos.campanas = "novedad";

  // WhatsApp desvinculado: es un estado, no un evento. Se muestra mientras
  // dure (estuvo conectado y ya no) y se apaga solo al reconectar: el estado
  // en tiempo real de AppShell gana apenas vuelve a "conectada".
  const whatsappCaido = novedades.whatsappDesvinculado && whatsappConectado !== true;
  if (whatsappCaido) avisos.contactos = "atencion";
  else if (despues(novedades.contactosNuevoAt, vistas.contactos)) avisos.contactos = "novedad";

  if (
    despues(novedades.dashboardRespuestaAt, vistas.dashboard) ||
    despues(novedades.dashboardSistemaAt, vistas.dashboard)
  ) {
    avisos.dashboard = "novedad";
  }

  // La sección abierta nunca muestra aviso.
  delete avisos[activeSection];
  return { avisos, marcarSecciones };
}
