"use client";

import {
  createContext,
  useContext,
  useState,
  type ReactNode,
} from "react";

const i18n = {
  es: {
    // ── Sidebar / navegación ──
    nav_dashboard: "Dashboard",
    nav_contacts: "Contactos",
    nav_groups: "Audiencias",
    nav_templates: "Templates",
    nav_campaigns: "Campañas",
    nav_ai: "IA",
    nav_logout: "Cerrar sesión",

    // ── Modal de logout ──
    logout_title: "¿Querés cerrar sesión?",
    logout_desc: "Vas a volver a la pantalla de inicio de sesión.",
    logout_cancel: "Cancelar",
    logout_confirm: "Cerrar sesión",
    myprofile_discard_title: "Tenés cambios sin guardar",
    myprofile_discard_desc:
      "Si salís ahora se pierden los cambios que hiciste. ¿Querés guardarlos antes de cerrar?",
    myprofile_discard_cancel: "Salir sin guardar",
    myprofile_discard_confirm: "Guardar y cerrar",

    // ── ProfileDrawer ──
    profile_subscription: "Suscripción",
    profile_active: "Activo",
    profile_days_left: "días restantes",
    profile_trial_cta: "Elegí tu plan para continuar con acceso completo.",
    profile_my_profile: "Mi perfil",
    profile_settings: "Configuración",

    // ── Configuración ──
    settings_title: "Configuración",
    settings_back: "Volver",
    settings_theme: "Tema",
    settings_theme_desc: "Elegí cómo se ve YamaSend en tu dispositivo.",
    settings_theme_light: "Claro",
    settings_theme_dark: "Oscuro",
    settings_language: "Idioma",
    settings_language_desc: "Elegí el idioma de la interfaz.",
    settings_language_es: "Español",
    settings_language_en: "Inglés",

    // ── Mi perfil (modal) ──
    myprofile_title: "Mi perfil",
    myprofile_nav_personal: "Perfil personal",
    myprofile_nav_security: "Seguridad",
    myprofile_nav_agency: "Datos de la empresa",
    myprofile_nav_creditos: "Créditos",

    myprofile_personal_title: "Perfil personal",
    myprofile_personal_desc: "Tus datos de contacto dentro de YamaSend.",
    myprofile_field_name: "Nombre completo",
    myprofile_field_email: "Email",
    myprofile_field_email_readonly: "El email no se puede modificar por ahora.",
    myprofile_field_phone: "Teléfono",
    myprofile_save: "Guardar cambios",
    myprofile_saving: "Guardando...",
    myprofile_saved: "Cambios guardados.",
    myprofile_save_error: "No se pudieron guardar los cambios.",

    myprofile_security_title: "Seguridad",
    myprofile_security_desc: "Gestioná el acceso a tu cuenta.",
    myprofile_password_title: "Cambiar contraseña",
    myprofile_password_desc: "Vas a necesitar tu contraseña actual para confirmar el cambio.",
    myprofile_field_current_password: "Contraseña actual",
    myprofile_field_new_password: "Nueva contraseña",
    myprofile_field_confirm_password: "Confirmar nueva contraseña",
    myprofile_password_change: "Cambiar contraseña",
    myprofile_password_changed: "Contraseña actualizada correctamente.",
    myprofile_password_mismatch: "Las contraseñas nuevas no coinciden.",
    myprofile_password_too_short: "La nueva contraseña debe tener al menos 8 caracteres.",

    myprofile_agency_title: "Datos de la empresa",
    myprofile_agency_desc:
      "Esta información alimenta a la IA de YamaSend (templates, análisis de contactos y chat) para que responda y redacte como tu negocio, no de forma genérica.",
    myprofile_field_agency_name: "Nombre de la empresa",
    myprofile_field_agency_field: "Rubro",
    myprofile_field_descripcion_negocio: "Descripción del negocio",
    myprofile_field_descripcion_negocio_placeholder:
      "Ej: Inmobiliaria especializada en alquileres y ventas de departamentos en zona norte del GBA, con más de 10 años en el rubro.",
    myprofile_field_productos: "Productos y servicios",
    myprofile_field_publico_objetivo: "Público objetivo",
    myprofile_field_publico_objetivo_placeholder:
      "Ej: Parejas jóvenes y familias buscando su primera vivienda, principalmente entre 28 y 45 años.",
    myprofile_field_tono_comunicacion: "Tono de comunicación",
    myprofile_field_tono_comunicacion_placeholder:
      "Ej: Cercano y cálido, pero profesional. Evitar sonar corporativo o distante.",
    myprofile_field_zona_cobertura: "Zona de cobertura",
    myprofile_field_zona_cobertura_placeholder:
      "Ej: San Isidro, Vicente López y Olivos.",
    myprofile_field_diferenciales: "Diferenciales / propuesta de valor",
    myprofile_field_diferenciales_placeholder:
      "Ej: Acompañamiento personalizado durante todo el proceso, asesoría legal incluida sin costo extra.",
    myprofile_field_reglas_evitar: "Cosas a evitar",
    myprofile_field_reglas_evitar_placeholder:
      "Ej: No prometer plazos de financiación. No mencionar precios exactos sin confirmar con el equipo.",
    myprofile_agency_readonly_notice:
      "Estos datos los carga tu empresa y los usa la IA para responder. Vos podés verlos pero no editarlos.",

    myprofile_creditos_title: "Créditos",
    myprofile_creditos_desc: "Comprá y seguí el consumo de créditos de tu cuenta.",
    myprofile_creditos_construction_title: "Sección en construcción",
    myprofile_creditos_construction_desc:
      "Estamos preparando la compra de créditos. Muy pronto vas a poder cargarlos desde acá.",

    // ── Dashboard ──
    dash_greeting: "Hola",
    dash_subtitle: "Esto pasó con tus envíos en los últimos",
    dash_period_7d: "7 días",
    dash_period_30d: "30 días",
    dash_period_year: "Año",
    dash_new_campaign: "Nueva campaña",
    dash_kpi_sent: "Mensajes enviados",
    dash_kpi_delivery: "Tasa de entrega",
    dash_kpi_leads: "Leads calificados por IA",
    dash_kpi_credits: "Créditos disponibles",
    dash_buy_credits: "Comprar créditos",
    dash_vs_prev: "vs. período anterior",
    dash_this_period: "este período",
    dash_volume_title: "Volumen de envíos",
    dash_insight_badge: "Insight de IA",
    dash_recent_campaigns: "Campañas recientes",
    dash_view_all: "Ver todas",
    dash_recent_activity: "Actividad reciente",

    // ── Contactos ──
    contacts_title: "Contactos",
    contacts_search: "Buscar contacto…",
    contacts_add_to_group: "Agregar a audiencia",
    contacts_create_group: "Crear audiencia",
    contacts_selected: "seleccionado",
    contacts_selected_plural: "seleccionados",

    // ── Audiencias ──
    groups_title: "Audiencias",
    groups_new: "Nueva audiencia",
    groups_contacts_count: "contactos",
    groups_campaigns_count: "campañas",
    groups_empty_title: "Todavía no creaste ninguna audiencia",
    groups_empty_desc: "Agrupá contactos para armar campañas más fácil.",

    // ── Templates ──
    templates_title: "Templates",
    templates_create_ai: "Crear con IA",
    templates_status_borrador: "Borrador",
    templates_status_enviado: "Enviado",
    templates_status_verificado: "Verificado",
    templates_status_rechazado: "Rechazado",
    templates_status_error: "Error",

    // ── Campañas ──
    campaigns_title: "Campañas",
    campaigns_new: "Nueva campaña",
    campaigns_status_borrador: "Borrador",
    campaigns_status_programada: "Programada",
    campaigns_status_enviando: "Enviando",
    campaigns_status_enviado: "Enviado",
    campaigns_status_error: "Error",
    campaigns_status_cancelado: "Cancelado",

    // ── IA ──
    ia_title: "Asistente IA",
    ia_placeholder: "Escribí tu mensaje…",
    ia_send: "Enviar",
  },
  en: {
    nav_dashboard: "Dashboard",
    nav_contacts: "Contacts",
    nav_groups: "Audiences",
    nav_templates: "Templates",
    nav_campaigns: "Campaigns",
    nav_ai: "AI",
    nav_logout: "Log out",

    logout_title: "Log out?",
    logout_desc: "You'll be taken back to the sign-in screen.",
    logout_cancel: "Cancel",
    logout_confirm: "Log out",
    myprofile_discard_title: "You have unsaved changes",
    myprofile_discard_desc:
      "If you leave now your changes will be lost. Do you want to save them before closing?",
    myprofile_discard_cancel: "Leave without saving",
    myprofile_discard_confirm: "Save and close",

    profile_subscription: "Subscription",
    profile_active: "Active",
    profile_days_left: "days left",
    profile_trial_cta: "Choose your plan to keep full access.",
    profile_my_profile: "My profile",
    profile_settings: "Settings",

    settings_title: "Settings",
    settings_back: "Back",
    settings_theme: "Theme",
    settings_theme_desc: "Choose how YamaSend looks on your device.",
    settings_theme_light: "Light",
    settings_theme_dark: "Dark",
    settings_language: "Language",
    settings_language_desc: "Choose the interface language.",
    settings_language_es: "Spanish",
    settings_language_en: "English",

    // ── My profile (modal) ──
    myprofile_title: "My profile",
    myprofile_nav_personal: "Personal profile",
    myprofile_nav_security: "Security",
    myprofile_nav_agency: "Company details",
    myprofile_nav_creditos: "Credits",

    myprofile_personal_title: "Personal profile",
    myprofile_personal_desc: "Your contact details within YamaSend.",
    myprofile_field_name: "Full name",
    myprofile_field_email: "Email",
    myprofile_field_email_readonly: "Email can't be changed yet.",
    myprofile_field_phone: "Phone",
    myprofile_save: "Save changes",
    myprofile_saving: "Saving...",
    myprofile_saved: "Changes saved.",
    myprofile_save_error: "Couldn't save the changes.",

    myprofile_security_title: "Security",
    myprofile_security_desc: "Manage access to your account.",
    myprofile_password_title: "Change password",
    myprofile_password_desc: "You'll need your current password to confirm the change.",
    myprofile_field_current_password: "Current password",
    myprofile_field_new_password: "New password",
    myprofile_field_confirm_password: "Confirm new password",
    myprofile_password_change: "Change password",
    myprofile_password_changed: "Password updated successfully.",
    myprofile_password_mismatch: "New passwords don't match.",
    myprofile_password_too_short: "New password must be at least 8 characters.",

    myprofile_agency_title: "Company details",
    myprofile_agency_desc:
      "This information feeds YamaSend's AI (templates, contact analysis, and chat) so it writes and responds like your business, not generically.",
    myprofile_field_agency_name: "Company name",
    myprofile_field_agency_field: "Industry",
    myprofile_field_descripcion_negocio: "Business description",
    myprofile_field_descripcion_negocio_placeholder:
      "E.g.: Real estate agency specialized in rentals and sales in the north of Buenos Aires, with over 10 years in the industry.",
    myprofile_field_productos: "Products and services",
    myprofile_field_publico_objetivo: "Target audience",
    myprofile_field_publico_objetivo_placeholder:
      "E.g.: Young couples and families looking for their first home, mostly between 28 and 45 years old.",
    myprofile_field_tono_comunicacion: "Communication tone",
    myprofile_field_tono_comunicacion_placeholder:
      "E.g.: Warm and approachable, but professional. Avoid sounding corporate or distant.",
    myprofile_field_zona_cobertura: "Coverage area",
    myprofile_field_zona_cobertura_placeholder:
      "E.g.: San Isidro, Vicente López and Olivos.",
    myprofile_field_diferenciales: "Differentiators / value proposition",
    myprofile_field_diferenciales_placeholder:
      "E.g.: Personalized guidance through the whole process, legal advice included at no extra cost.",
    myprofile_field_reglas_evitar: "Things to avoid",
    myprofile_field_reglas_evitar_placeholder:
      "E.g.: Don't promise financing terms. Don't mention exact prices without confirming with the team.",
    myprofile_agency_readonly_notice:
      "Your company set these up and the AI uses them to respond. You can view them but not edit them.",

    myprofile_creditos_title: "Credits",
    myprofile_creditos_desc: "Buy credits and track your account usage.",
    myprofile_creditos_construction_title: "Section under construction",
    myprofile_creditos_construction_desc:
      "We're working on credit purchases. You'll be able to top up from here soon.",

    dash_greeting: "Hi",
    dash_subtitle: "Here's what happened with your sends in the last",
    dash_period_7d: "7 days",
    dash_period_30d: "30 days",
    dash_period_year: "Year",
    dash_new_campaign: "New campaign",
    dash_kpi_sent: "Messages sent",
    dash_kpi_delivery: "Delivery rate",
    dash_kpi_leads: "AI-scored leads",
    dash_kpi_credits: "Available credits",
    dash_buy_credits: "Buy credits",
    dash_vs_prev: "vs. previous period",
    dash_this_period: "this period",
    dash_volume_title: "Send volume",
    dash_insight_badge: "AI insight",
    dash_recent_campaigns: "Recent campaigns",
    dash_view_all: "View all",
    dash_recent_activity: "Recent activity",

    contacts_title: "Contacts",
    contacts_search: "Search contact…",
    contacts_add_to_group: "Add to audience",
    contacts_create_group: "Create audience",
    contacts_selected: "selected",
    contacts_selected_plural: "selected",

    groups_title: "Audiences",
    groups_new: "New audience",
    groups_contacts_count: "contacts",
    groups_campaigns_count: "campaigns",
    groups_empty_title: "You haven't created any audiences yet",
    groups_empty_desc: "Group contacts together to build campaigns faster.",

    templates_title: "Templates",
    templates_create_ai: "Create with AI",
    templates_status_borrador: "Draft",
    templates_status_enviado: "Submitted",
    templates_status_verificado: "Approved",
    templates_status_rechazado: "Rejected",
    templates_status_error: "Error",

    campaigns_title: "Campaigns",
    campaigns_new: "New campaign",
    campaigns_status_borrador: "Draft",
    campaigns_status_programada: "Scheduled",
    campaigns_status_enviando: "Sending",
    campaigns_status_enviado: "Sent",
    campaigns_status_error: "Error",
    campaigns_status_cancelado: "Cancelled",

    ia_title: "AI Assistant",
    ia_placeholder: "Type your message…",
    ia_send: "Send",
  },
} as const;

type Lang = keyof typeof i18n;
type TranslationKey = keyof typeof i18n.es;

interface LangContextType {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: TranslationKey) => string;
}

const LangContext = createContext<LangContextType | null>(null);

const STORAGE_KEY = "yamasend-lang";

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    if (typeof window === "undefined") return "es";
    const stored = window.localStorage.getItem(STORAGE_KEY) as Lang | null;
    return stored === "es" || stored === "en" ? stored : "es";
  });

  const setLang = (next: Lang) => {
    setLangState(next);
    window.localStorage.setItem(STORAGE_KEY, next);
  };

  const t = (key: TranslationKey): string => i18n[lang][key] as string;

  return (
    <LangContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LangContext.Provider>
  );
}

export function useLang() {
  const ctx = useContext(LangContext);
  if (!ctx) throw new Error("useLang debe usarse dentro de LangProvider");
  return ctx;
}
