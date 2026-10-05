"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";

interface LandingClientProps {
  isAuthenticated: boolean;
}

const NAV_LINKS = [
  { href: "#funcionalidades", label: "Funcionalidades" },
  { href: "#como-funciona", label: "Cómo funciona" },
  { href: "#ia", label: "IA" },
  { href: "#nosotros", label: "Nosotros" },
  { href: "#faq", label: "Preguntas frecuentes" },
];

const FAQS = [
  {
    q: "¿Qué es YamaSend?",
    a: "Es una plataforma para comunicarte con tus clientes por WhatsApp de forma organizada: gestionás contactos, armás grupos, guardás mensajes como templates, preparás campañas y revisás los resultados desde un mismo lugar.",
  },
  {
    q: "¿Necesito conocimientos técnicos para usarlo?",
    a: "No. La plataforma está pensada para que cualquier persona del equipo pueda usarla: las pantallas guían el proceso paso a paso.",
  },
  {
    q: "¿Cómo se vincula mi cuenta de WhatsApp?",
    a: "Desde la sección Contactos hay una opción para vincular tu WhatsApp y así importar tus contactos y conversaciones. Te vamos a mostrar los pasos dentro de la plataforma cuando crees tu cuenta.",
  },
  {
    q: "¿Puedo organizar mis contactos en grupos?",
    a: "Sí. Podés crear grupos con los contactos que elijas, verlos con su cantidad de integrantes y reutilizarlos en cualquier campaña.",
  },
  {
    q: "¿Puedo programar campañas?",
    a: "Sí. Al crear una campaña elegís si querés enviarla en el momento o programarla para una fecha y hora determinadas.",
  },
  {
    q: "¿Cómo utiliza YamaSend la inteligencia artificial?",
    a: "La IA te ayuda a redactar y ajustar mensajes, analizar conversaciones, detectar oportunidades entre tus contactos y responder consultas sobre tus campañas. Siempre sugiere: la decisión final y la confirmación del envío son tuyas.",
  },
  {
    q: "¿Puedo usarlo desde el celular?",
    a: "Sí. La plataforma está diseñada para desktop y para celular, con la misma información y las mismas acciones principales.",
  },
  {
    q: "¿Cómo empiezo?",
    a: "Creás tu cuenta gratis, vinculás tu WhatsApp, organizás tus contactos y desde ahí ya podés preparar tu primera campaña.",
  },
];

const BENEFITS = [
  {
    title: "Ahorrá tiempo",
    text: "Preparás la campaña una vez, elegís cuándo sale y dejás de copiar mensajes a mano.",
    icon: (
      <svg width="19" height="19" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <circle cx="8" cy="8" r="5.5" stroke="#067647" strokeWidth="1.5" />
        <path d="M8 5.2V8l2 1.4" stroke="#067647" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    title: "Contactos ordenados",
    text: "Importá tus contactos, armá grupos y sabé siempre a quién le estás escribiendo.",
    icon: (
      <svg width="19" height="19" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <circle cx="5.2" cy="6" r="2.2" stroke="#067647" strokeWidth="1.5" />
        <circle cx="10.8" cy="6" r="2.2" stroke="#067647" strokeWidth="1.5" />
        <path
          d="M2 13c0-1.8 1.4-3 3.2-3s3.2 1.2 3.2 3M7.6 13c0-1.8 1.4-3 3.2-3s3.2 1.2 3.2 3"
          stroke="#067647"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  {
    title: "IA que te acompaña",
    text: "Pedile ayuda para redactar mensajes o para encontrar oportunidades entre tus conversaciones.",
    icon: (
      <svg width="19" height="19" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path
          d="m8 2 1.6 3.6L13 7l-3.4 1.4L8 12 6.4 8.4 3 7l3.4-1.4L8 2Z"
          stroke="#067647"
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    title: "Resultados a la vista",
    text: "Mirá qué pasó con cada envío y usá esa información en la próxima comunicación.",
    icon: (
      <svg width="19" height="19" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="M3 13V7M8 13V3.5M13 13V9.5" stroke="#067647" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    ),
  },
];

const STEPS = [
  {
    n: "01",
    title: "Conectá y organizá tus contactos",
    text: "Vinculá tu WhatsApp, importá tu base y agrupá a tus contactos según cómo les querés hablar.",
  },
  {
    n: "02",
    title: "Creá el mensaje y elegí a quién",
    text: "Armá tu template (o pedíselo a la IA), revisá cómo se ve y seleccioná el grupo que lo va a recibir.",
  },
  {
    n: "03",
    title: "Programá y analizá",
    text: "Enviá en el momento o programá la campaña, y después revisá cómo respondió cada grupo.",
  },
];

const TOUR = [
  {
    tag: "01 · DASHBOARD",
    title: "Entrá y sabé cómo viene la semana",
    text: "Mensajes enviados, entregas, créditos disponibles y las campañas que están en curso, en una sola pantalla.",
    bullets: [
      "Métricas por período: 7 días, 30 días o el año",
      "Actividad reciente y estado de cada campaña",
    ],
    img: "/landing/shot-dashboard.png",
    alt: "Dashboard de YamaSend: volumen de envíos por día, insight de IA y campañas recientes",
    w: 909,
    h: 540,
    reverse: false,
  },
  {
    tag: "02 · CONTACTOS",
    title: "Tu base de contactos, con contexto",
    text: "Vinculá tu WhatsApp para importar contactos y ver el estado de cada conversación, sin salir de la plataforma.",
    bullets: [
      "Búsqueda, filtros y orden por actividad",
      "Análisis con IA para priorizar a quién escribirle",
    ],
    img: "/landing/shot-contactos.png",
    alt: "Pantalla de Contactos de YamaSend con listado de contactos y su score",
    w: 909,
    h: 540,
    reverse: true,
  },
  {
    tag: "03 · GRUPOS",
    title: "Agrupá para hablarle mejor a cada uno",
    text: "Armá segmentos como clientes frecuentes, consultas nuevas o reactivación, y reutilizalos en cada campaña.",
    bullets: [],
    img: "/landing/shot-grupos.png",
    alt: "Pantalla de Grupos de YamaSend con tarjetas por segmento de contactos",
    w: 924,
    h: 464,
    reverse: false,
  },
  {
    tag: "04 · TEMPLATES",
    title: "Mensajes listos para reutilizar",
    text: "Guardá tus mensajes, mandalos a aprobar a Meta y seguí el estado de cada uno.",
    bullets: [],
    img: "/landing/shot-templates.png",
    alt: "Pantalla de Templates de YamaSend con mensajes y su estado",
    w: 909,
    h: 540,
    reverse: true,
  },
  {
    tag: "05 · CAMPAÑAS",
    title: "Preparalas, programalas y seguilas",
    text: "Un paso a paso para elegir grupo, mensaje y momento del envío. Después, el detalle de cada campaña en un mismo listado.",
    bullets: [],
    img: "/landing/shot-campanas.png",
    alt: "Listado de campañas de YamaSend con grupo, template, fecha y estado",
    w: 924,
    h: 540,
    reverse: false,
  },
];

const WHY = [
  { title: "Todo en un solo lugar", text: "Contactos, grupos, mensajes y campañas conviven en la misma plataforma." },
  { title: "Experiencia intuitiva", text: "Pantallas claras, sin configuraciones interminables para empezar." },
  { title: "Automatización sin vueltas", text: "Programá envíos y reutilizá mensajes sin armar flujos complejos." },
  { title: "IA integrada al trabajo", text: "La IA vive dentro del flujo, no en una herramienta aparte." },
  { title: "Desktop y celular", text: "La misma experiencia desde la computadora o desde el teléfono." },
  { title: "Información clara", text: "Datos de tus campañas presentados de forma comprensible." },
];

const FOR_WHOM = [
  { title: "Emprendedores", text: "Mantené el contacto con tus clientes sin que te ocupe toda la mañana." },
  { title: "Comercios y tiendas", text: "Avisá novedades, promociones o llegada de stock a los grupos que te interesan." },
  { title: "Equipos comerciales", text: "Ordená el seguimiento y detectá qué contactos vale la pena retomar primero." },
  { title: "Profesionales y servicios", text: "Recordá turnos y hacé seguimientos con mensajes que ya tenés preparados." },
  { title: "Pymes", text: "Compartí contactos, grupos y mensajes entre las personas del equipo." },
];

function CheckIcon({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true" style={{ flex: "none" }}>
      <path d="m3 8.4 3.4 3L13 4.6" stroke="#12B76A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Reveal({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  });

  useEffect(() => {
    if (visible) return;
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.08 },
    );
    observer.observe(el);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={ref}
      className={`transition-[opacity,transform] duration-[550ms] ease-[cubic-bezier(.4,0,.2,1)] ${
        visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3.5"
      } ${className}`}
    >
      {children}
    </div>
  );
}

export default function LandingClient({ isAuthenticated }: LandingClientProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [menuOpen]);

  const loginHref = isAuthenticated ? "/panel" : "/login";
  const loginLabel = isAuthenticated ? "Ir al Dashboard" : "Iniciar sesión";
  const registerHref = isAuthenticated ? "/panel" : "/register";
  const registerLabel = isAuthenticated ? "Ir al Dashboard" : "Crear cuenta gratis";

  return (
    <div
      id="inicio"
      className="fixed inset-0 overflow-y-auto overflow-x-clip scroll-smooth text-ys-text bg-white"
      style={{ fontFamily: "var(--font-body)" }}
    >
      {/* Header */}
      <header className="sticky top-0 z-[60] bg-white/92 backdrop-blur-[10px] border-b border-ys-border-softest">
        <nav
          aria-label="Navegación principal"
          className="max-w-[1560px] mx-auto h-[70px] flex items-center gap-[30px] px-5 lg:px-10"
        >
          <a href="#inicio" aria-label="YamaSend, ir al inicio" className="flex items-center flex-none">
            <Image
              src="/brand/logo-sidebar.png"
              alt="YamaSend"
              width={160}
              height={40}
              className="h-10 w-auto object-contain block"
              priority
            />
          </a>

          <div className="hidden lg:flex flex-1 items-center justify-center gap-[26px]">
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="text-sm font-semibold transition-colors"
                style={{ color: "#535b56" }}
                onMouseEnter={(e) => (e.currentTarget.style.color = "#16211b")}
                onMouseLeave={(e) => (e.currentTarget.style.color = "#535b56")}
              >
                {link.label}
              </a>
            ))}
          </div>

          <div className="hidden lg:flex flex-none items-center gap-3.5">
            {isAuthenticated ? (
              <Link
                href="/panel"
                className="flex items-center gap-2 text-sm font-bold rounded-[11px] py-[11px] px-[18px] shadow-[var(--shadow-cta)] transition-all hover:-translate-y-px"
                style={{ color: "#fff", background: "#12B76A" }}
              >
                Ir al Dashboard
              </Link>
            ) : (
              <>
                <Link
                  href={loginHref}
                  className="text-sm font-bold py-[9px] px-1.5 transition-colors"
                  style={{ color: "#16211b" }}
                >
                  {loginLabel}
                </Link>
                <Link
                  href={registerHref}
                  className="flex items-center gap-2 text-sm font-bold rounded-[11px] py-[11px] px-[18px] shadow-[var(--shadow-cta)] transition-all hover:-translate-y-px"
                  style={{ color: "#fff", background: "#12B76A" }}
                >
                  {registerLabel}
                </Link>
              </>
            )}
          </div>

          <button
            onClick={() => setMenuOpen(true)}
            aria-label="Abrir menú"
            className="lg:hidden ml-auto w-11 h-11 rounded-[11px] flex items-center justify-center border border-ys-border-softest flex-none"
          >
            <svg width="21" height="21" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M2.5 4h11M2.5 8h11M2.5 12h11" stroke="#16211b" strokeWidth="1.7" strokeLinecap="round" />
            </svg>
          </button>
        </nav>
      </header>

      {/* Menú mobile */}
      {menuOpen && (
        <div
          onClick={() => setMenuOpen(false)}
          className="fixed inset-0 z-[80] bg-[rgba(16,24,20,0.4)] flex justify-end"
          style={{ animation: "ys-fade .18s ease both" }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-[86%] max-w-[330px] h-[100dvh] bg-white border-l border-ys-border-softest flex flex-col gap-1.5"
            style={{
              padding: "calc(16px + env(safe-area-inset-top)) 18px calc(20px + env(safe-area-inset-bottom))",
              animation: "ys-drawer-right .24s cubic-bezier(.4,0,.2,1) both",
            }}
          >
            <div className="flex items-center gap-2.5 mb-3">
              <Image
                src="/brand/logo-sidebar.png"
                alt="YamaSend"
                width={120}
                height={30}
                className="h-[30px] w-auto object-contain block"
              />
              <button
                onClick={() => setMenuOpen(false)}
                aria-label="Cerrar menú"
                className="ml-auto w-11 h-11 rounded-[11px] flex items-center justify-center border border-ys-border-softest"
              >
                <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M4 4l8 8M12 4l-8 8" stroke="#535b56" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setMenuOpen(false)}
                className="py-3.5 px-3 rounded-[10px] text-[15.5px] font-semibold transition-colors hover:bg-ys-border-softer"
                style={{ color: "#16211b" }}
              >
                {link.label}
              </a>
            ))}
            <div className="h-px bg-ys-border-softest my-3 mx-1" />
            {isAuthenticated ? (
              <Link
                href="/panel"
                onClick={() => setMenuOpen(false)}
                className="flex items-center justify-center text-[15px] font-bold rounded-xl py-[15px] px-[18px] transition-colors"
                style={{ color: "#fff", background: "#12B76A" }}
              >
                Ir al Dashboard
              </Link>
            ) : (
              <>
                <Link
                  href={registerHref}
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center justify-center text-[15px] font-bold rounded-xl py-[15px] px-[18px] transition-colors"
                  style={{ color: "#fff", background: "#12B76A" }}
                >
                  {registerLabel}
                </Link>
                <Link
                  href={loginHref}
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center justify-center text-[15px] font-bold border border-ys-border-softest rounded-xl py-3.5 px-[18px] mt-2.5 hover:bg-ys-border-softer transition-colors"
                  style={{ color: "#16211b" }}
                >
                  {loginLabel}
                </Link>
              </>
            )}
          </div>
        </div>
      )}

      <main>
        {/* Hero */}
        <section
          className="pt-[56px] pb-[56px] md:pt-[76px] md:pb-16"
          style={{ background: "linear-gradient(180deg,#f7f9f8 0%,#ffffff 100%)" }}
        >
          <div className="max-w-[1180px] mx-auto px-5 md:px-8 flex flex-col items-center text-center gap-[22px]">
            <div
              className="inline-flex items-center gap-[9px] bg-ys-green-bg border border-ys-green-border/60 rounded-full py-[7px] px-[15px]"
              style={{ animation: "ys-fade-up .4s cubic-bezier(.4,0,.2,1) both", borderColor: "#d9ece3" }}
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="m8 2 1.6 3.6L13 7l-3.4 1.4L8 12 6.4 8.4 3 7l3.4-1.4L8 2Z" stroke="#067647" strokeWidth="1.4" strokeLinejoin="round" />
              </svg>
              <span className="text-[12.5px] font-bold text-ys-green-text tracking-[.01em]">
                Mensajería masiva por WhatsApp con IA
              </span>
            </div>

            <h1
              className="m-0 max-w-[830px] font-extrabold tracking-[-0.025em] text-[34px] leading-[1.14] md:text-[52px] md:leading-[1.08]"
              style={{ animation: "ys-fade-up .45s cubic-bezier(.4,0,.2,1) .05s both", textWrap: "pretty" }}
            >
              Llegá a más clientes por WhatsApp, sin perder el toque humano.
            </h1>

            <p
              className="m-0 max-w-[640px] text-base md:text-lg leading-[1.6] font-medium text-ys-muted"
              style={{ animation: "ys-fade-up .45s cubic-bezier(.4,0,.2,1) .1s both", textWrap: "pretty" }}
            >
              Creá campañas, organizá tus contactos y aprovechá la inteligencia artificial para comunicarte mejor, todo desde un solo lugar.
            </p>

            <div
              className="flex flex-col md:flex-row items-stretch md:items-center gap-3 mt-1 w-full md:w-auto"
              style={{ animation: "ys-fade-up .45s cubic-bezier(.4,0,.2,1) .15s both" }}
            >
              <Link
                href={registerHref}
                className="flex items-center justify-center gap-[9px] text-[15px] font-bold rounded-xl py-[15px] px-6 shadow-[var(--shadow-cta)] transition-all hover:-translate-y-px"
                style={{ color: "#fff", background: "#12B76A" }}
              >
                {registerLabel}
                <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M3 8h9.5M9 4.5 12.5 8 9 11.5" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </Link>
              <a
                href="#como-funciona"
                className="flex items-center justify-center gap-[9px] text-[15px] font-bold bg-white border border-ys-border-softest rounded-xl py-[15px] px-[22px] hover:bg-ys-border-softer transition-colors"
                style={{ color: "#16211b" }}
              >
                Ver cómo funciona
              </a>
            </div>

            <div
              className="flex items-center gap-2 text-[13px] font-semibold text-ys-dim"
            >
              <CheckIcon size={14} />
              Creá tu cuenta y explorá la plataforma antes de enviar tu primera campaña.
            </div>

            <div
              className="relative w-full max-w-[1010px] mt-[26px]"
              style={{ animation: "ys-fade-up .5s cubic-bezier(.4,0,.2,1) .2s both" }}
            >
              <div className="border border-ys-border-softest rounded-[18px] bg-white shadow-[0_24px_60px_rgba(16,24,20,0.12)] overflow-hidden">
                <div className="flex items-center gap-[7px] py-[11px] px-3.5 border-b border-ys-border-soft bg-[#fbfcfb]">
                  <span className="w-[9px] h-[9px] rounded-full bg-ys-border-softest block" />
                  <span className="w-[9px] h-[9px] rounded-full bg-ys-border-softest block" />
                  <span className="w-[9px] h-[9px] rounded-full bg-ys-border-softest block" />
                  <span className="ml-3 font-mono text-[11px] text-ys-dimmer">app.yamasend · Dashboard</span>
                </div>
                <div className="overflow-x-auto">
                  <Image
                    src="/landing/shot-dashboard.png"
                    alt="Dashboard de YamaSend con métricas de envíos, tasa de entrega, leads calificados por IA y campañas recientes"
                    width={909}
                    height={540}
                    className="w-full min-w-[820px] md:min-w-0 h-auto block"
                  />
                </div>
              </div>

              <div className="hidden md:flex absolute -left-[26px] top-[96px] bg-white border border-ys-border-softest rounded-[14px] shadow-[0_12px_28px_rgba(16,24,20,0.12)] py-3 px-[15px] items-center gap-[11px] text-left">
                <div className="w-8 h-8 rounded-[9px] bg-ys-green-bg flex items-center justify-center">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <path d="M2.5 6.5v3l7 3.5v-10l-7 3.5Z" stroke="#067647" strokeWidth="1.5" strokeLinejoin="round" />
                    <path d="M12 6v4" stroke="#067647" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </div>
                <div>
                  <div className="text-[12.5px] font-extrabold">Campaña programada</div>
                  <div className="font-mono text-[11px] text-ys-dim">mar 10:00 · 3.180 contactos</div>
                </div>
              </div>

              <div className="hidden md:flex absolute right-[-24px] bottom-[70px] bg-ys-dark rounded-[14px] shadow-[0_14px_30px_rgba(16,24,20,0.24)] py-[13px] px-4 items-center gap-[11px] text-left">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="m8 2 1.6 3.6L13 7l-3.4 1.4L8 12 6.4 8.4 3 7l3.4-1.4L8 2Z" stroke="#12B76A" strokeWidth="1.4" strokeLinejoin="round" />
                </svg>
                <div>
                  <div className="text-[11px] font-extrabold text-ys-green tracking-[.08em]">INSIGHT DE IA</div>
                  <div className="text-[12.5px] font-bold text-ys-border-softest">Sugerencias sobre tus contactos</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Funcionalidades / beneficios */}
        <section id="funcionalidades" className="py-14 md:py-20 scroll-mt-[71px]">
          <div className="max-w-[1180px] mx-auto px-5 md:px-8 flex flex-col gap-[38px]">
            <Reveal className="max-w-[640px] flex flex-col gap-3">
              <div className="text-[12.5px] font-extrabold text-ys-green-text tracking-[.1em]">BENEFICIOS</div>
              <h2
                className="m-0 font-extrabold tracking-[-0.02em] text-[26px] leading-[1.15] md:text-[34px]"
                style={{ textWrap: "pretty" }}
              >
                Menos trabajo manual, más conversaciones que avanzan.
              </h2>
              <p className="m-0 text-base leading-[1.6] font-medium text-ys-muted">
                Todo lo que hoy hacés en planillas, notas y chats sueltos, ordenado en una sola plataforma.
              </p>
            </Reveal>
            <Reveal className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {BENEFITS.map((b) => (
                <div
                  key={b.title}
                  className="bg-white border border-ys-border-softest rounded-2xl p-[22px] flex flex-col gap-3 transition-all hover:-translate-y-[3px] hover:shadow-[0_10px_26px_rgba(16,24,20,0.07)]"
                >
                  <div className="w-[38px] h-[38px] rounded-[11px] bg-ys-green-bg flex items-center justify-center">
                    {b.icon}
                  </div>
                  <h3 className="m-0 text-base font-extrabold">{b.title}</h3>
                  <p className="m-0 text-sm leading-[1.55] font-medium text-ys-muted">{b.text}</p>
                </div>
              ))}
            </Reveal>
          </div>
        </section>

        {/* Cómo funciona */}
        <section
          id="como-funciona"
          className="py-14 md:py-20 bg-[#f7f9f8] border-t border-b border-ys-border-softest scroll-mt-[71px]"
        >
          <div className="max-w-[1180px] mx-auto px-5 md:px-8 flex flex-col gap-[38px]">
            <Reveal className="max-w-[640px] flex flex-col gap-3">
              <div className="text-[12.5px] font-extrabold text-ys-green-text tracking-[.1em]">CÓMO FUNCIONA</div>
              <h2
                className="m-0 font-extrabold tracking-[-0.02em] text-[26px] leading-[1.15] md:text-[34px]"
                style={{ textWrap: "pretty" }}
              >
                Tres pasos, de la lista de contactos al envío.
              </h2>
            </Reveal>
            <Reveal className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {STEPS.map((s) => (
                <div key={s.n} className="bg-white border border-ys-border-softest rounded-2xl p-6 flex flex-col gap-[14px]">
                  <div className="flex items-center gap-2.5">
                    <div className="w-[30px] h-[30px] rounded-[9px] bg-ys-dark text-ys-green font-mono text-[13px] font-medium flex items-center justify-center">
                      {s.n}
                    </div>
                    <div className="h-px flex-1 bg-ys-border-softest" />
                  </div>
                  <h3 className="m-0 text-[17px] font-extrabold">{s.title}</h3>
                  <p className="m-0 text-sm leading-[1.55] font-medium text-ys-muted">{s.text}</p>
                </div>
              ))}
            </Reveal>
          </div>
        </section>

        {/* La plataforma - tour */}
        <section className="py-16 md:py-[84px]">
          <div className="max-w-[1180px] mx-auto px-5 md:px-8 flex flex-col gap-[60px]">
            <Reveal className="max-w-[660px] flex flex-col gap-3">
              <div className="text-[12.5px] font-extrabold text-ys-green-text tracking-[.1em]">LA PLATAFORMA</div>
              <h2
                className="m-0 font-extrabold tracking-[-0.02em] text-[26px] leading-[1.15] md:text-[34px]"
                style={{ textWrap: "pretty" }}
              >
                Un recorrido por YamaSend.
              </h2>
              <p className="m-0 text-base leading-[1.6] font-medium text-ys-muted">
                Estas son pantallas reales de la plataforma.
              </p>
            </Reveal>

            {TOUR.map((item) => (
              <Reveal
                key={item.tag}
                className={`grid grid-cols-1 md:grid-cols-2 gap-[22px] md:gap-12 items-center`}
              >
                <div className={`flex flex-col gap-[14px] ${item.reverse ? "md:order-2" : ""}`}>
                  <div className="font-mono text-[11.5px] text-ys-dim">{item.tag}</div>
                  <h3 className="m-0 text-xl md:text-2xl leading-[1.2] tracking-[-0.015em] font-extrabold">
                    {item.title}
                  </h3>
                  <p className="m-0 text-[15.5px] leading-[1.6] font-medium text-ys-muted">{item.text}</p>
                  {item.bullets.length > 0 && (
                    <ul className="m-0 mt-1.5 p-0 list-none flex flex-col gap-2.5">
                      {item.bullets.map((b) => (
                        <li key={b} className="flex gap-2.5 text-sm font-semibold text-[#3f4844]">
                          <span className="mt-0.5">
                            <CheckIcon />
                          </span>
                          {b}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div
                  className={`border border-ys-border-softest rounded-2xl overflow-hidden bg-white shadow-[0_14px_36px_rgba(16,24,20,0.08)] ${item.reverse ? "md:order-1" : ""}`}
                >
                  <Image src={item.img} alt={item.alt} width={item.w} height={item.h} className="w-full h-auto block" />
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        {/* IA */}
        <section id="ia" className="py-16 md:py-[84px] bg-ys-dark scroll-mt-[71px]">
          <div className="max-w-[1180px] mx-auto px-5 md:px-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-[26px] md:gap-[52px] items-center">
              <Reveal className="flex flex-col gap-[18px]">
                <div className="inline-flex self-start items-center gap-2 border border-[#33403a] rounded-full py-[7px] px-3.5">
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <path d="m8 2 1.6 3.6L13 7l-3.4 1.4L8 12 6.4 8.4 3 7l3.4-1.4L8 2Z" stroke="#12B76A" strokeWidth="1.4" strokeLinejoin="round" />
                  </svg>
                  <span className="text-xs font-extrabold text-ys-green tracking-[.08em]">INTELIGENCIA ARTIFICIAL</span>
                </div>
                <h2
                  className="m-0 font-extrabold tracking-[-0.02em] text-[26px] leading-[1.15] md:text-[34px] text-white"
                  style={{ textWrap: "pretty" }}
                >
                  Inteligencia que mejora tus conversaciones.
                </h2>
                <p className="m-0 text-base leading-[1.65] font-medium text-[#c3ccc7] max-w-[520px]">
                  YamaSend te ayuda a transformar información en acciones concretas, manteniendo siempre el control: la IA sugiere, vos decidís.
                </p>
                <div className="flex flex-col gap-[11px] mt-1">
                  {[
                    "Redactar y ajustar mensajes antes de enviarlos",
                    "Analizar conversaciones y detectar oportunidades",
                    "Consultar en lenguaje simple qué pasó con tus campañas",
                    "Decidir a quién priorizar y cuándo escribirle",
                  ].map((line) => (
                    <div key={line} className="flex gap-[11px] items-start text-[14.5px] font-semibold text-ys-border-softest">
                      <span className="mt-0.5">
                        <CheckIcon size={16} />
                      </span>
                      {line}
                    </div>
                  ))}
                </div>
                <div className="mt-2.5 text-[13px] font-semibold text-[#9aa9a3]">
                  YamaSend nunca envía una campaña sin tu confirmación.
                </div>
              </Reveal>
              <Reveal className="border border-[#33403a] rounded-[18px] overflow-hidden bg-white shadow-[0_24px_60px_rgba(0,0,0,0.35)]">
                <Image
                  src="/landing/shot-ia.png"
                  alt="Chat de IA de YamaSend respondiendo una consulta sobre leads calientes"
                  width={924}
                  height={427}
                  className="w-full h-auto block"
                />
              </Reveal>
            </div>
          </div>
        </section>

        {/* Para quién es */}
        <section className="py-14 md:py-20">
          <div className="max-w-[1180px] mx-auto px-5 md:px-8 flex flex-col gap-[34px]">
            <Reveal className="max-w-[640px] flex flex-col gap-3">
              <div className="text-[12.5px] font-extrabold text-ys-green-text tracking-[.1em]">PARA QUIÉN ES</div>
              <h2
                className="m-0 font-extrabold tracking-[-0.02em] text-[26px] leading-[1.15] md:text-[34px]"
                style={{ textWrap: "pretty" }}
              >
                Pensado para equipos que ya trabajan por WhatsApp.
              </h2>
            </Reveal>
            <Reveal className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {FOR_WHOM.map((f) => (
                <div key={f.title} className="bg-[#f7f9f8] border border-ys-border-softest rounded-2xl p-[22px] flex flex-col gap-[9px]">
                  <h3 className="m-0 text-base font-extrabold">{f.title}</h3>
                  <p className="m-0 text-sm leading-[1.55] font-medium text-ys-muted">{f.text}</p>
                </div>
              ))}
            </Reveal>
          </div>
        </section>

        {/* Por qué YamaSend */}
        <section className="py-16 md:py-[84px] bg-[#f7f9f8] border-t border-b border-ys-border-softest">
          <div className="max-w-[1180px] mx-auto px-5 md:px-8 flex flex-col gap-[34px]">
            <Reveal className="max-w-[620px] flex flex-col gap-3">
              <div className="text-[12.5px] font-extrabold text-ys-green-text tracking-[.1em]">POR QUÉ YAMASEND</div>
              <h2
                className="m-0 font-extrabold tracking-[-0.02em] text-[26px] leading-[1.15] md:text-[34px]"
                style={{ textWrap: "pretty" }}
              >
                Simple de usar, completo donde importa.
              </h2>
            </Reveal>
            <Reveal className="grid grid-cols-1 md:grid-cols-3 gap-[14px]">
              {WHY.map((w) => (
                <div key={w.title} className="bg-white border border-ys-border-softest rounded-[14px] p-5 flex gap-3 items-start">
                  <span className="mt-[3px]">
                    <CheckIcon size={17} />
                  </span>
                  <div>
                    <h3 className="m-0 mb-1 text-[15px] font-extrabold">{w.title}</h3>
                    <p className="m-0 text-[13.5px] leading-[1.5] font-medium text-ys-muted">{w.text}</p>
                  </div>
                </div>
              ))}
            </Reveal>
          </div>
        </section>

        {/* Nosotros */}
        <section id="nosotros" className="py-14 md:py-20 scroll-mt-[71px]">
          <div className="max-w-[1180px] mx-auto px-5 md:px-8 flex flex-col gap-[34px]">
            <Reveal className="max-w-[660px] flex flex-col gap-3">
              <div className="text-[12.5px] font-extrabold text-ys-green-text tracking-[.1em]">NOSOTROS</div>
              <h2
                className="m-0 font-extrabold tracking-[-0.02em] text-[26px] leading-[1.15] md:text-[34px]"
                style={{ textWrap: "pretty" }}
              >
                Las personas detrás de YamaSend
              </h2>
              <p className="m-0 text-base leading-[1.65] font-medium text-ys-muted" style={{ textWrap: "pretty" }}>
                YamaSend nació de una idea simple: ayudar a que los negocios puedan comunicarse con más personas sin perder organización, tiempo ni cercanía.
              </p>
            </Reveal>
            <Reveal className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-[820px]">
              <div className="bg-white border border-ys-border-softest rounded-2xl p-6 flex flex-col gap-[14px]">
                <Image
                  src="/brand/founder-bautista.png"
                  alt="Bautista Luciani, cofundador de YamaSend"
                  width={184}
                  height={184}
                  className="w-[92px] h-[92px] rounded-full object-cover object-top block bg-[#f7f9f8] border border-ys-border-softest"
                />
                <div>
                  <h3 className="m-0 mb-[3px] text-lg font-extrabold">Bautista Luciani</h3>
                  <div className="text-[13.5px] font-bold text-ys-green-text">Cofundador</div>
                </div>
                <p className="m-0 text-sm leading-[1.55] font-medium text-ys-muted">
                  Se ocupa del producto y del diseño de YamaSend: piensa cada pantalla junto a los negocios que la van a usar, con la obsesión de que todo se entienda sin manual.
                </p>
                <a
                  href="https://www.linkedin.com/in/bautistalucianibroquen/"
                  target="_blank"
                  rel="noopener"
                  className="inline-flex self-start items-center gap-[7px] text-[13px] font-bold text-ys-green-text hover:text-ys-green transition-colors"
                >
                  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <rect x="2" y="2" width="12" height="12" rx="2.4" stroke="currentColor" strokeWidth="1.4" />
                    <path d="M5 6.8v4M5 4.9v.1M8 11V8.6a1.4 1.4 0 0 1 2.8 0V11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                  </svg>
                  LinkedIn
                </a>
              </div>
              <div className="bg-white border border-ys-border-softest rounded-2xl p-6 flex flex-col gap-[14px]">
                <div
                  className="w-[92px] h-[92px] rounded-full bg-ys-border-softer border border-ys-border-softest flex items-center justify-center text-ys-faint text-[11px] font-semibold text-center"
                  aria-label="Foto de Patricio pendiente"
                >
                  Foto de<br />Patricio
                </div>
                <div>
                  <h3 className="m-0 mb-[3px] text-lg font-extrabold">Patricio Yamus</h3>
                  <div className="text-[13.5px] font-bold text-ys-green-text">Cofundador</div>
                </div>
                <p className="m-0 text-sm leading-[1.55] font-medium text-ys-dim">
                  [Descripción breve de Patricio: editar cuando tengamos el texto definitivo.]
                </p>
                <div className="font-mono text-[11.5px] text-ys-faint">[LinkedIn: pendiente]</div>
              </div>
            </Reveal>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="py-14 md:py-20 bg-[#f7f9f8] border-t border-ys-border-softest scroll-mt-[71px]">
          <div className="max-w-[860px] mx-auto px-5 md:px-8 flex flex-col gap-[30px]">
            <Reveal className="flex flex-col gap-3">
              <div className="text-[12.5px] font-extrabold text-ys-green-text tracking-[.1em]">PREGUNTAS FRECUENTES</div>
              <h2 className="m-0 font-extrabold tracking-[-0.02em] text-[26px] leading-[1.15] md:text-[34px]">
                Antes de empezar
              </h2>
            </Reveal>
            <div className="flex flex-col gap-2.5">
              {FAQS.map((f, i) => {
                const open = openFaq === i;
                return (
                  <div key={f.q} className="bg-white border border-ys-border-softest rounded-[14px] overflow-hidden">
                    <button
                      onClick={() => setOpenFaq(open ? null : i)}
                      aria-expanded={open}
                      className="w-full flex items-center gap-3.5 py-[18px] px-5 cursor-pointer text-left min-h-[56px]"
                    >
                      <h3 className="m-0 flex-1 text-[15.5px] font-bold" style={{ textWrap: "pretty" }}>
                        {f.q}
                      </h3>
                      {open ? (
                        <svg width="17" height="17" viewBox="0 0 16 16" fill="none" className="flex-none" aria-hidden="true">
                          <path d="M3.5 8h9" stroke="#067647" strokeWidth="1.8" strokeLinecap="round" />
                        </svg>
                      ) : (
                        <svg width="17" height="17" viewBox="0 0 16 16" fill="none" className="flex-none" aria-hidden="true">
                          <path d="M8 3.5v9M3.5 8h9" stroke="#067647" strokeWidth="1.8" strokeLinecap="round" />
                        </svg>
                      )}
                    </button>
                    {open && (
                      <div
                        className="px-5 pb-5 text-[14.5px] leading-[1.65] font-medium text-ys-muted"
                        style={{ animation: "ys-fade-up .2s cubic-bezier(.4,0,.2,1) both", textWrap: "pretty" }}
                      >
                        {f.a}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* CTA final */}
        <section className="py-16 md:py-[84px] bg-[#f7f9f8]">
          <div className="max-w-[1180px] mx-auto px-5 md:px-8">
            <Reveal className="bg-ys-dark rounded-[22px] py-12 px-6 md:py-14 md:px-11 flex flex-col items-center text-center gap-[18px]">
              <h2
                className="m-0 max-w-[620px] font-extrabold tracking-[-0.02em] text-[28px] leading-[1.14] md:text-[36px] text-white"
                style={{ textWrap: "pretty" }}
              >
                Empezá a comunicarte de una manera más simple.
              </h2>
              <p className="m-0 max-w-[520px] text-base leading-[1.6] font-medium text-[#c3ccc7]">
                Creá tu cuenta, vinculá tu WhatsApp y armá tu primera campaña con la plataforma completa a la vista.
              </p>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mt-2 w-full sm:w-auto">
                {isAuthenticated ? (
                  <Link
                    href="/panel"
                    className="flex items-center justify-center gap-[9px] text-[15px] font-bold rounded-xl py-[15px] px-6 transition-all hover:-translate-y-px"
                    style={{ color: "#0b1310", background: "#12B76A" }}
                  >
                    Ir al Dashboard
                  </Link>
                ) : (
                  <>
                    <Link
                      href={registerHref}
                      className="flex items-center justify-center gap-[9px] text-[15px] font-bold rounded-xl py-[15px] px-6 transition-all hover:-translate-y-px"
                      style={{ color: "#0b1310", background: "#12B76A" }}
                    >
                      {registerLabel}
                    </Link>
                    <Link
                      href={loginHref}
                      className="flex items-center justify-center gap-[9px] text-[15px] font-bold rounded-xl py-[15px] px-[22px] transition-colors"
                      style={{ color: "#eef1ef", border: "1px solid #33403a" }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "#22302a")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                    >
                      {loginLabel}
                    </Link>
                  </>
                )}
              </div>
            </Reveal>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-ys-border-softest pt-[52px] pb-[30px]">
        <div className="max-w-[1180px] mx-auto px-5 md:px-8 flex flex-col gap-9">
          <div className="grid grid-cols-2 md:grid-cols-[1.6fr_1fr_1fr_1fr] gap-8">
            <div className="col-span-2 md:col-span-1 flex flex-col gap-3.5 max-w-[320px]">
              <Image
                src="/brand/logo-sidebar.png"
                alt="YamaSend"
                width={128}
                height={32}
                className="h-8 w-auto object-contain block self-start"
              />
              <p className="m-0 text-[13.5px] leading-[1.6] font-medium text-ys-muted">
                Plataforma de mensajería masiva por WhatsApp con inteligencia artificial para organizar contactos, campañas y resultados.
              </p>
            </div>
            <div className="flex flex-col gap-2.5">
              <div className="text-[12.5px] font-extrabold tracking-[.04em]">Producto</div>
              {[
                { href: "#funcionalidades", label: "Funcionalidades" },
                { href: "#como-funciona", label: "Cómo funciona" },
                { href: "#ia", label: "IA" },
                { href: "#faq", label: "Preguntas frecuentes" },
              ].map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  className="text-[13.5px] font-semibold transition-colors"
                  style={{ color: "#6b736e" }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = "#067647")}
                  onMouseLeave={(e) => (e.currentTarget.style.color = "#6b736e")}
                >
                  {item.label}
                </a>
              ))}
            </div>
            <div className="flex flex-col gap-2.5">
              <div className="text-[12.5px] font-extrabold tracking-[.04em]">Cuenta</div>
              <Link
                href={loginHref}
                className="text-[13.5px] font-semibold transition-colors"
                style={{ color: "#6b736e" }}
                onMouseEnter={(e) => (e.currentTarget.style.color = "#067647")}
                onMouseLeave={(e) => (e.currentTarget.style.color = "#6b736e")}
              >
                {loginLabel}
              </Link>
              <Link
                href={registerHref}
                className="text-[13.5px] font-semibold transition-colors"
                style={{ color: "#6b736e" }}
                onMouseEnter={(e) => (e.currentTarget.style.color = "#067647")}
                onMouseLeave={(e) => (e.currentTarget.style.color = "#6b736e")}
              >
                {isAuthenticated ? "Ir al Dashboard" : "Crear cuenta"}
              </Link>
              <a
                href="#nosotros"
                className="text-[13.5px] font-semibold transition-colors"
                style={{ color: "#6b736e" }}
                onMouseEnter={(e) => (e.currentTarget.style.color = "#067647")}
                onMouseLeave={(e) => (e.currentTarget.style.color = "#6b736e")}
              >
                Nosotros
              </a>
            </div>
            <div className="flex flex-col gap-2.5">
              <div className="text-[12.5px] font-extrabold tracking-[.04em]">Legales y contacto</div>
              <span className="text-[13.5px] font-semibold text-ys-faint">[Términos y condiciones]</span>
              <span className="text-[13.5px] font-semibold text-ys-faint">[Política de privacidad]</span>
              <span className="text-[13.5px] font-semibold text-ys-faint">[Email de contacto]</span>
            </div>
          </div>
          <div className="flex items-center gap-3.5 flex-wrap pt-[22px] border-t border-ys-border-softest">
            <div className="text-[12.5px] font-semibold text-ys-dim">© 2026 YamaSend. Todos los derechos reservados.</div>
            <div className="ml-auto font-mono text-[11.5px] text-ys-faint">Hecho para negocios que hablan por WhatsApp</div>
          </div>
        </div>
      </footer>

      <style jsx global>{`
        @keyframes ys-drawer-right {
          from {
            transform: translateX(100%);
          }
          to {
            transform: translateX(0);
          }
        }
      `}</style>
    </div>
  );
}
