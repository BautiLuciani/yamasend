"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  AppSection,
  AppUser,
  Campaign,
  CampaignStatus,
  ChatMessage,
  ChatPayload,
  Contact,
  ContactList,
  IAFlowState,
  IAHistoryTurn,
  KpiFilterKey,
  StatusState,
  Template,
} from "@/lib/types";
import { IA_FLOW_IDLE } from "@/lib/types";
import Sidebar from "./Sidebar";
import MobileHeader from "./MobileHeader";
import MobileDrawer from "./MobileDrawer";
import Dashboard from "./Dashboard";
import Audiencias from "./Audiencias";
import AudienciaDetailModal from "./AudienciaDetailModal";
import Templates from "./Templates";
import TemplateCreateModal from "./TemplateCreateModal";
import TemplateDetailModal from "./TemplateDetailModal";
import Campanas from "./Campanas";
import CampaignWizardModal from "./CampaignWizardModal";
import Toast, { type ToastData } from "./Toast";
import { getSugerenciaHorarioAction } from "@/lib/actions/horarios";

/** Clave de localStorage con el id de la conversación de IA abierta. */
const IA_CONVERSACION_ABIERTA_KEY = "ys-ia-conversacion-abierta";
import CampaignDetailModal from "./CampaignDetailModal";
import IA from "./IA";
import ProfileDrawer from "./ProfileDrawer";
import MyProfileModal from "./MyProfileModal";
import LogoutModal from "./LogoutModal";
import KpiRow from "./KpiRow";
import ContactsTable from "./ContactsTable";
import ContactsPagination from "./ContactsPagination";
import QrImportModal from "./QrImportModal";
import SyncConfigModal from "./SyncConfigModal";
import WahaRequiredModal from "./WahaRequiredModal";
import ContactDetailModal from "./ContactDetailModal";
import { CreateAudienceModal, AddToAudienceModal } from "./AudienciaModals";
import {
  saveListAction,
  saveCampaignAction,
  addContactsToListAction,
  renameListAction,
  removeContactsFromListAction,
  deleteListAction,
  saveTemplateDraftAction,
  sendTemplateToMetaAction,
  deleteTemplateDraftAction,
  refreshTemplatesAction,
  sendCampaignAction,
  getCampaignInsightAction,
  deleteCampaignAction,
} from "@/lib/actions/write";
import {
  syncAndAnalyzeAction,
  setTemperaturaManualAction,
  generarTemplateConIAAction,
  isWahaConectadaAction,
} from "@/lib/actions/sync";
import { getCampaignDetailAction } from "@/lib/actions/campaigns";
import {
  sendIAMessageAction,
  seleccionarRecursoEditarAction,
  aplicarTemperaturaAction,
  seleccionarCampoCampanaAction,
  confirmarSeleccionContactosAction,
  confirmarCreacionAudienciaAction,
  seleccionarCategoriaTemplateAction,
  usarSugerenciaTemplateAction,
  pedirOtraSugerenciaTemplateAction,
  guardarBorradorTemplateAction,
  confirmarEnvioTemplateAction,
  seleccionarAudienciaCampanaAction,
  seleccionarTemplateCampanaAction,
  seleccionarMomentoCampanaAction,
  seleccionarFechaCampanaAction,
  confirmarCreacionCampanaAction,
  confirmarImportarContactosAction,
  iniciarAudienciaDesdeResultadosBusquedaAction,
  iniciarAudienciaDesdeImportacionAction,
} from "@/lib/actions/ia";
import {
  cargarConversacionIAAction,
  guardarConversacionIAAction,
  generarTituloConversacionAction,
  borrarConversacionIAAction,
} from "@/lib/actions/ia_conversaciones";
import { createClient } from "@/lib/supabase/client";

const PLAN_LABELS: Record<string, string> = {
  starter: "Starter",
  pro: "Pro",
  uso: "Por mensaje",
};

// URL del workflow de n8n que genera/consulta la sesión de WhatsApp (WAHA).
// Devuelve una imagen PNG (QR para escanear) o un JSON { status: "WORKING", ... }
// si la sesión ya está conectada.
const WAHA_QR_WEBHOOK_URL =
  "https://yamasai.app.n8n.cloud/webhook/95d3bbe5-0888-46aa-a28e-b7372ec4f605";

interface AppShellProps {
  user: AppUser;
  contacts: Contact[];
  templates: Template[];
  lists: ContactList[];
  campaigns: Campaign[];
  onLogout: () => void | Promise<void>;
}

const COST_PER_MSG = 0.0618;

export default function AppShell({
  user: userProp,
  contacts,
  templates: templatesProp,
  lists,
  campaigns: campaignsProp,
  onLogout,
}: AppShellProps) {
  const router = useRouter();
  // Estado local del usuario, sincronizado con la prop del server component.
  // Permite reflejar al instante los cambios hechos desde MyProfileModal
  // (nombre, teléfono, datos de agencia) sin depender de router.refresh().
  // Se ajusta durante el render (no en un efecto) siguiendo el patrón
  // recomendado por React para "adjust state when a prop changes".
  const [user, setUser] = useState<AppUser>(userProp);
  const [prevUserProp, setPrevUserProp] = useState(userProp);
  if (userProp !== prevUserProp) {
    setPrevUserProp(userProp);
    setUser(userProp);
  }

  // Estado local de templates, sincronizado inicialmente con la prop del
  // server component. Necesario para poder actualizarlo desde el polling de
  // abajo sin depender de router.refresh() (que recarga todo /panel).
  const [templates, setTemplates] = useState<Template[]>(templatesProp);
  const templatesAprobados = templates.filter((t) => t.status === "verificado");
  useEffect(() => {
    setTemplates(templatesProp);
  }, [templatesProp]);

  // Mismo patrón que templates: estado local sincronizado con la prop del
  // server component, para poder actualizarlo en tiempo real (Realtime de
  // Supabase sobre yamas_send_campanas) sin depender de router.refresh(),
  // que recarga todo /panel. Usado tanto por la sección Campañas como por
  // el Dashboard ("Campañas recientes").
  const [campaigns, setCampaigns] = useState<Campaign[]>(campaignsProp);
  useEffect(() => {
    setCampaigns(campaignsProp);
  }, [campaignsProp]);

  // Cliente de Supabase compartido para Realtime, autenticado explícitamente
  // con el access_token de la sesión. Realtime autentica el WebSocket por
  // separado de las cookies que usa el cliente REST (@supabase/ssr) — sin
  // este setAuth, el socket queda autenticado como "anon" y las policies de
  // RLS (que exigen auth.uid()) nunca dejan pasar el evento, aunque la
  // suscripción se vea "SUBSCRIBED" sin ningún error. Se resuelve una sola
  // vez y lo comparten todos los canales (campaigns, waha session, etc.).
  const [realtimeClient, setRealtimeClient] = useState<ReturnType<
    typeof createClient
  > | null>(null);

  useEffect(() => {
    let cancelado = false;
    const supabase = createClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelado || !session?.access_token) return;
      supabase.realtime.setAuth(session.access_token);
      setRealtimeClient(supabase);
    });
    return () => {
      cancelado = true;
    };
  }, []);

  useEffect(() => {
    if (!realtimeClient) return;

    const channel = realtimeClient
      .channel(`campaigns-${user.tenantId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "yamas_send_campanas",
          filter: `tenant_id=eq.${user.tenantId}`,
        },
        (payload) => {
          if (payload.eventType === "DELETE") {
            const deletedId = (payload.old as { id?: string })?.id;
            if (!deletedId) return;
            setCampaigns((prev) => prev.filter((c) => c.id !== deletedId));
            return;
          }

          const row = payload.new as {
            id: string;
            nombre: string;
            lista_id: string | null;
            template_id: string | null;
            lista_nombre: string | null;
            template_nombre: string | null;
            status: CampaignStatus;
            contactos_count: number | null;
            fecha_programada: string | null;
            enviado_at: string | null;
            created_at: string | null;
          };

          const actualizada: Campaign = {
            id: row.id,
            nombre: row.nombre,
            listaId: row.lista_id,
            templateId: row.template_id,
            listaNombre: row.lista_nombre,
            templateNombre: row.template_nombre,
            status: row.status,
            contactosCount: row.contactos_count ?? 0,
            fechaProgramada: row.fecha_programada,
            enviadoAt: row.enviado_at,
            createdAt: row.created_at,
          };

          setCampaigns((prev) => {
            const existe = prev.some((c) => c.id === actualizada.id);
            if (existe) {
              return prev.map((c) => (c.id === actualizada.id ? actualizada : c));
            }
            return [actualizada, ...prev];
          });
        },
      )
      .subscribe();

    return () => {
      realtimeClient.removeChannel(channel);
    };
  }, [realtimeClient, user.tenantId]);

  // Estado de vinculación de WhatsApp (yamas_send_waha_sessions.estado), en
  // memoria y sincronizado en tiempo real por Realtime — evita tener que
  // pollear o volver a pedirle al servidor cada vez que se toca "Analizar".
  // Sin esto, si el usuario desvincula el WhatsApp desde el celular estando
  // ya en el dashboard, el chequeo seguía viendo el último estado conocido
  // (el que trajo la carga inicial de la página) hasta el próximo refresh.
  // Arranca en null ("todavía no sabemos") mientras se resuelve el chequeo
  // inicial, para no dejar pasar un "Analizar" antes de tener certeza.
  const [wahaConectada, setWahaConectada] = useState<boolean | null>(null);

  useEffect(() => {
    isWahaConectadaAction().then(setWahaConectada);
  }, []);

  useEffect(() => {
    if (!realtimeClient) return;

    const channel = realtimeClient
      .channel(`waha-session-${user.tenantId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "yamas_send_waha_sessions",
          filter: `tenant_id=eq.${user.tenantId}`,
        },
        (payload) => {
          if (payload.eventType === "DELETE") {
            setWahaConectada(false);
            return;
          }
          const row = payload.new as { estado?: string };
          setWahaConectada(row.estado === "conectada");
        },
      )
      .subscribe();

    return () => {
      realtimeClient.removeChannel(channel);
    };
  }, [realtimeClient, user.tenantId]);

  const VALID_SECTIONS: AppSection[] = [
    "dashboard",
    "contactos",
    "grupos",
    "templates",
    "campanas",
    "ia",
  ];

  // La sección activa se guarda en la URL (?section=...) para que sobreviva
  // a un refresh de página. Usamos window.history.replaceState en vez de
  // useSearchParams/router.push a propósito: useSearchParams exigiría envolver
  // todo AppShell en <Suspense> (990 líneas) y router.push/replace dispara el
  // loading spinner de Next en cada cambio de tab, que no queremos acá — mismo
  // criterio que ya usamos para otros toggles que no deben mostrar loading state.
  function getInitialSection(): AppSection {
    if (typeof window === "undefined") return "dashboard";
    const param = new URLSearchParams(window.location.search).get("section");
    return VALID_SECTIONS.includes(param as AppSection)
      ? (param as AppSection)
      : "dashboard";
  }

  const [activeSection, setActiveSectionState] = useState<AppSection>(getInitialSection);

  function setActiveSection(section: AppSection) {
    setActiveSectionState(section);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      if (section === "dashboard") {
        url.searchParams.delete("section");
      } else {
        url.searchParams.set("section", section);
      }
      window.history.replaceState(null, "", url.toString());
    }
  }

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileView, setProfileView] = useState<"profile" | "settings">("profile");
  const [myProfileOpen, setMyProfileOpen] = useState(false);
  const [logoutModalOpen, setLogoutModalOpen] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [filt, setFilt] = useState<Set<KpiFilterKey>>(new Set());
  const [modo24h, setModo24h] = useState(false);
  const [contactSearch, setContactSearch] = useState("");
  const [contactPage, setContactPage] = useState(1);
  const CONTACTS_PER_PAGE = 15;

  const [tplId, setTplId] = useState<string | null>(null);
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [newTplContent, setNewTplContent] = useState("");
  const [newTplName, setNewTplName] = useState("");
  const [newTplCategoria, setNewTplCategoria] = useState("marketing");
  const [savingDraft, setSavingDraft] = useState(false);

  const [status, setStatus] = useState<StatusState>("idle");

  const [qrOpen, setQrOpen] = useState(false);
  const [qrStatus, setQrStatus] = useState<
    "loading" | "waiting" | "connected" | "error"
  >("loading");
  const [qrImageUrl, setQrImageUrl] = useState<string | null>(null);
  const qrPollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const qrObjectUrlRef = useRef<string | null>(null);
  const [syncModalOpen, setSyncModalOpen] = useState(false);
  const [wahaRequiredOpen, setWahaRequiredOpen] = useState(false);
  const [detailContact, setDetailContact] = useState<Contact | null>(null);
  const [createGroupOpen, setCreateGroupOpen] = useState(false);
  const [addToGroupOpen, setAddToGroupOpen] = useState(false);
  const [openGroupId, setOpenGroupId] = useState<string | null>(null);
  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [detailTemplate, setDetailTemplate] = useState<Template | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [detailCampaignId, setDetailCampaignId] = useState<string | null>(null);
  const [wizardInitial, setWizardInitial] = useState<{
    nombre: string;
    listaId: string | null;
    templateId: string | null;
    paso: 1 | 2 | 3 | 4;
    esDuplicada?: boolean;
  } | null>(null);

  const fetchQrStatus = useCallback(async () => {
    try {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        setQrStatus("error");
        return;
      }

      const res = await fetch(WAHA_QR_WEBHOOK_URL, {
        method: "POST",
        headers: {
          // text/plain evita que el navegador dispare un preflight OPTIONS
          // (n8n Cloud no responde bien ese preflight con headers custom)
          "Content-Type": "text/plain",
        },
        body: session.access_token,
      });

      if (!res.ok) {
        setQrStatus("error");
        // reintentar igual, puede ser un error transitorio de WAHA
        qrPollTimeoutRef.current = setTimeout(fetchQrStatus, 4000);
        return;
      }

      const contentType = res.headers.get("content-type") || "";

      if (contentType.includes("application/json")) {
        const data = await res.json();
        if (data.status === "WORKING") {
          setQrStatus("connected");
          return; // conectado: dejamos de pollear, el usuario cierra el modal cuando quiera
        }
        // otro estado no contemplado, seguimos consultando
        qrPollTimeoutRef.current = setTimeout(fetchQrStatus, 4000);
        return;
      }

      // Si no es JSON, asumimos que es la imagen del QR (image/png)
      const blob = await res.blob();
      if (qrObjectUrlRef.current) {
        URL.revokeObjectURL(qrObjectUrlRef.current);
      }
      const objectUrl = URL.createObjectURL(blob);
      qrObjectUrlRef.current = objectUrl;
      setQrImageUrl(objectUrl);
      setQrStatus("waiting");

      // seguimos consultando para detectar cuándo se escanea y pasa a WORKING
      qrPollTimeoutRef.current = setTimeout(fetchQrStatus, 4000);
    } catch {
      setQrStatus("error");
      qrPollTimeoutRef.current = setTimeout(fetchQrStatus, 4000);
    }
  }, []);

  useEffect(() => {
    if (!qrOpen) {
      if (qrPollTimeoutRef.current) clearTimeout(qrPollTimeoutRef.current);
      return;
    }

    setQrStatus("loading");
    setQrImageUrl(null);
    fetchQrStatus();

    return () => {
      if (qrPollTimeoutRef.current) clearTimeout(qrPollTimeoutRef.current);
      if (qrObjectUrlRef.current) {
        URL.revokeObjectURL(qrObjectUrlRef.current);
        qrObjectUrlRef.current = null;
      }
    };
  }, [qrOpen, fetchQrStatus]);

  // Polling de templates: mientras haya alguno en estado "enviado" (esperando
  // revisión de Meta), consultamos cada 20s para reflejar el cambio a
  // "verificado"/"rechazado" apenas llegue, sin que el usuario tenga que
  // refrescar la página. Se frena solo cuando ya no queda ningún "enviado".
  // Además, si detecta que alguno pasó de "enviado" a un estado final
  // (verificado/rechazado), avisa por el chat de IA — así el flujo
  // conversacional de creación de templates cierra el círculo completo,
  // igual que ya pasaba con los creados desde el modal manual.
  const templatesPollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hayTemplatesEnviados = templates.some((t) => t.status === "enviado");

  useEffect(() => {
    if (!hayTemplatesEnviados) {
      if (templatesPollTimeoutRef.current) clearTimeout(templatesPollTimeoutRef.current);
      return;
    }

    let cancelled = false;

    async function pollTemplates() {
      const result = await refreshTemplatesAction();
      if (!cancelled && result.templates) {
        const nuevos = result.templates;
        setTemplates((prev) => {
          for (const t of nuevos) {
            const anterior = prev.find((p) => p.id === t.id);
            if (anterior?.status === "enviado" && t.status !== "enviado") {
              if (t.status === "verificado") {
                // Tipo "aviso" y no "bot": es un evento externo, no un turno
                // de la conversación. Si contara como turno, llegar justo
                // mientras el usuario tiene abierta una tarjeta de acción le
                // deshabilitaría el botón y lo cortaría a mitad de flujo.
                addMsg(
                  `Tu template "${t.nombre}" fue aprobado por Meta. Ya podés usarlo en una campaña.`,
                  "aviso",
                );
              } else if (t.status === "rechazado") {
                addMsg(
                  `Meta rechazó el template "${t.nombre}"${t.rechazoMotivo ? `: ${t.rechazoMotivo}` : "."}`,
                  "aviso",
                );
              }
            }
          }
          return nuevos;
        });
      }
      if (!cancelled) {
        templatesPollTimeoutRef.current = setTimeout(pollTemplates, 20000);
      }
    }

    templatesPollTimeoutRef.current = setTimeout(pollTemplates, 20000);

    return () => {
      cancelled = true;
      if (templatesPollTimeoutRef.current) clearTimeout(templatesPollTimeoutRef.current);
    };
  }, [hayTemplatesEnviados]);

  const IA_MENSAJE_BIENVENIDA: ChatMessage = {
    id: "welcome",
    type: "bot",
    text: "Hola 👋 Soy tu asistente AI. Podés pedirme que arme una audiencia de contactos hablando conmigo.",
  };

  const [messages, setMessages] = useState<ChatMessage[]>([IA_MENSAJE_BIENVENIDA]);
  const [iaFlowState, setIaFlowState] = useState<IAFlowState>(IA_FLOW_IDLE);
  const [iaSending, setIaSending] = useState(false);
  const [iaConversacionId, setIaConversacionId] = useState<string | null>(null);
  const iaConversacionIdRef = useRef<string | null>(null);
  const iaTituloGeneradoRef = useRef(false);
  const iaGuardadoTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Encadena guardados: cada llamada a guardarConversacionIAAction espera a
  // que la anterior termine antes de ejecutarse, incluso si dos timeouts de
  // debounce llegan a dispararse casi en simultáneo (ej: el usuario escribe
  // y la IA responde con menos de 1.2s de diferencia). Sin esto, dos
  // guardados en paralelo podían ver iaConversacionIdRef.current === null al
  // mismo tiempo y crear dos filas para la misma conversación.
  const iaGuardadoEnCursoRef = useRef<Promise<void>>(Promise.resolve());

  const [toast, setToast] = useState<ToastData | null>(null);

  /**
   * Feedback de acciones hechas FUERA del chat de IA. Antes esto se escribía
   * como un mensaje en la conversación, lo que la ensuciaba con eventos que
   * el usuario no había pedido ahí y encima quedaban en el historial
   * guardado. Ahora va a un aviso flotante.
   */
  function notificar(texto: string, tipo: ToastData["tipo"] = "exito") {
    setToast({ id: `${Date.now()}-${Math.random()}`, texto, tipo });
  }

  function addMsg(
    text: string,
    type: ChatMessage["type"] = "bot",
    payload?: ChatPayload,
  ) {
    const id = `${Date.now()}-${Math.random()}`;
    setMessages((prev) => [...prev, { id, text, type, payload }]);
    return id;
  }

  // Restaura la conversación que estaba abierta antes de recargar. El id se
  // guarda en localStorage y no en la base a propósito: "la conversación
  // abierta" es estado de ESTA pestaña, no de la cuenta. Si se tomara la más
  // reciente de la base, abrir una pestaña nueva o recargar después de haber
  // arrancado un chat nuevo reabriría la anterior, que no es lo que el
  // usuario dejó en pantalla.
  useEffect(() => {
    let cancelado = false;

    async function restaurar() {
      let guardado: string | null = null;
      try {
        guardado = window.localStorage.getItem(IA_CONVERSACION_ABIERTA_KEY);
      } catch {
        // Modo incógnito o storage bloqueado: se arranca con chat nuevo.
        return;
      }
      if (!guardado) return;

      const conversacion = await cargarConversacionIAAction(guardado);
      // Si la conversación fue borrada (desde otra pestaña, por ejemplo) se
      // limpia la referencia en vez de dejarla colgada.
      if (!conversacion) {
        try {
          window.localStorage.removeItem(IA_CONVERSACION_ABIERTA_KEY);
        } catch {}
        return;
      }
      if (cancelado) return;

      iaConversacionIdRef.current = conversacion.id;
      iaTituloGeneradoRef.current = true;
      setIaConversacionId(conversacion.id);
      setMessages(
        conversacion.messages.length > 0 ? conversacion.messages : [IA_MENSAJE_BIENVENIDA],
      );
      setIaFlowState(conversacion.flowState);
    }

    restaurar();
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Mantiene sincronizado el id de la conversación abierta con localStorage.
  useEffect(() => {
    try {
      if (iaConversacionId) {
        window.localStorage.setItem(IA_CONVERSACION_ABIERTA_KEY, iaConversacionId);
      } else {
        window.localStorage.removeItem(IA_CONVERSACION_ABIERTA_KEY);
      }
    } catch {}
  }, [iaConversacionId]);

  // Persistencia del chat de IA: cada vez que cambian los mensajes o el
  // estado de flujo, guardamos (con debounce de 1.2s) en
  // yamas_send_ia_conversaciones. No se guarda la conversación mientras
  // solo tiene el mensaje de bienvenida fijo — recién se crea la fila
  // cuando el usuario escribe algo de verdad, para no llenar el historial
  // de conversaciones vacías nunca usadas.
  useEffect(() => {
    const hayConversacionReal = messages.some((m) => m.type === "user");
    if (!hayConversacionReal) return;

    if (iaGuardadoTimeoutRef.current) clearTimeout(iaGuardadoTimeoutRef.current);

    iaGuardadoTimeoutRef.current = setTimeout(() => {
      // Encadenamos sobre la promesa anterior: si un guardado previo todavía
      // está en curso (ej: generando el título), este espera a que termine
      // antes de leer iaConversacionIdRef.current — así nunca hay dos
      // guardados creando una fila nueva al mismo tiempo.
      iaGuardadoEnCursoRef.current = iaGuardadoEnCursoRef.current.then(async () => {
        // Genera el título una sola vez, apenas hay el primer mensaje de
        // usuario — no en cada guardado posterior.
        let tituloParaGuardar: string | null = null;
        if (!iaTituloGeneradoRef.current) {
          const primerMensajeUsuario = messages.find((m) => m.type === "user");
          if (primerMensajeUsuario) {
            iaTituloGeneradoRef.current = true;
            tituloParaGuardar = await generarTituloConversacionAction(
              primerMensajeUsuario.text,
            );
          }
        }

        const result = await guardarConversacionIAAction(
          iaConversacionIdRef.current,
          messages,
          iaFlowState,
          tituloParaGuardar,
        );

        if (result.id && !iaConversacionIdRef.current) {
          iaConversacionIdRef.current = result.id;
          setIaConversacionId(result.id);
        }
      });
    }, 1200);

    return () => {
      if (iaGuardadoTimeoutRef.current) clearTimeout(iaGuardadoTimeoutRef.current);
    };
  }, [messages, iaFlowState]);

  function handleIANuevaConversacion() {
    if (iaGuardadoTimeoutRef.current) clearTimeout(iaGuardadoTimeoutRef.current);
    iaConversacionIdRef.current = null;
    iaTituloGeneradoRef.current = false;
    setIaConversacionId(null);
    setMessages([IA_MENSAJE_BIENVENIDA]);
    setIaFlowState(IA_FLOW_IDLE);
  }

  async function handleIASeleccionarConversacion(conversacionId: string) {
    if (conversacionId === iaConversacionIdRef.current) return;
    if (iaGuardadoTimeoutRef.current) clearTimeout(iaGuardadoTimeoutRef.current);

    const conversacion = await cargarConversacionIAAction(conversacionId);
    if (!conversacion) return;

    iaConversacionIdRef.current = conversacion.id;
    iaTituloGeneradoRef.current = true;
    setIaConversacionId(conversacion.id);
    setMessages(
      conversacion.messages.length > 0 ? conversacion.messages : [IA_MENSAJE_BIENVENIDA],
    );
    setIaFlowState(conversacion.flowState);
  }

  /**
   * Borra una conversación del historial (yamas_send_ia_conversaciones).
   * Si es la conversación abierta actualmente, resetea el chat al estado de
   * "nueva conversación" — mismo camino que handleIANuevaConversacion,
   * cancelando cualquier guardado con debounce pendiente para que no
   * "resucite" la fila recién borrada un instante después.
   */
  async function handleIABorrarConversacion(
    conversacionId: string,
  ): Promise<{ error: string | null }> {
    const eraLaActiva = conversacionId === iaConversacionIdRef.current;

    if (eraLaActiva && iaGuardadoTimeoutRef.current) {
      clearTimeout(iaGuardadoTimeoutRef.current);
    }

    const { error } = await borrarConversacionIAAction(conversacionId);
    if (error) return { error };

    if (eraLaActiva) {
      iaConversacionIdRef.current = null;
      iaTituloGeneradoRef.current = false;
      setIaConversacionId(null);
      setMessages([IA_MENSAJE_BIENVENIDA]);
      setIaFlowState(IA_FLOW_IDLE);
    }

    return { error: null };
  }

  // ── filtrado combinado, replicando la lógica del original ──
  const visibleContacts = useMemo(() => {
    const q = contactSearch.trim().toLowerCase();
    return contacts.filter((c) => {
      if (c.bloqueado && !modo24h) return false;
      if (filt.has("24h") && !c.en24h) return false;
      if (filt.has("cliente") && c.etapa !== "cerrado") return false;
      if (filt.has("ai") && !c.enListaAI) return false;
      const scores = (["caliente", "tibio", "frio"] as const).filter((s) =>
        filt.has(s),
      );
      if (scores.length > 0 && !scores.includes(c.score as "caliente" | "tibio" | "frio"))
        return false;
      if (q) {
        const nombre = (c.nombre || "").toLowerCase();
        const tel = (c.tel || "").toLowerCase();
        if (!nombre.includes(q) && !tel.includes(q)) return false;
      }
      return true;
    });
  }, [contacts, filt, modo24h, contactSearch]);

  const contactTotalPages = Math.max(
    1,
    Math.ceil(visibleContacts.length / CONTACTS_PER_PAGE),
  );
  const contactPageSafe = Math.min(contactPage, contactTotalPages);
  const paginatedContacts = useMemo(() => {
    const start = (contactPageSafe - 1) * CONTACTS_PER_PAGE;
    return visibleContacts.slice(start, start + CONTACTS_PER_PAGE);
  }, [visibleContacts, contactPageSafe]);

  const counts = useMemo(
    () => ({
      total: contacts.filter((c) => !c.bloqueado).length,
      clientes: contacts.filter((c) => !c.bloqueado && c.etapa === "cliente")
        .length,
      ai: contacts.filter((c) => c.enListaAI).length,
      h24: contacts.filter((c) => c.en24h).length,
      caliente: contacts.filter((c) => !c.bloqueado && c.score === "caliente")
        .length,
      tibio: contacts.filter((c) => !c.bloqueado && c.score === "tibio")
        .length,
      frio: contacts.filter((c) => !c.bloqueado && c.score === "frio").length,
    }),
    [contacts],
  );

  function recomputeSelFromFilters(nextFilt: Set<KpiFilterKey>, next24h: boolean) {
    const next = new Set<string>();
    contacts.forEach((c) => {
      if (c.bloqueado && !next24h) return;
      if (nextFilt.has("24h") && !c.en24h) return;
      if (nextFilt.has("cliente") && c.etapa !== "cerrado") return;
      if (nextFilt.has("ai") && !c.enListaAI) return;
      const scores = (["caliente", "tibio", "frio"] as const).filter((s) =>
        nextFilt.has(s),
      );
      if (scores.length > 0 && !scores.includes(c.score as "caliente" | "tibio" | "frio"))
        return;
      next.add(c.id);
    });
    setSel(next);
  }

  function handleContactSearchChange(value: string) {
    setContactSearch(value);
    setContactPage(1);
  }

  function handleSelectTotal() {
    setFilt(new Set());
    setModo24h(false);
    setContactPage(1);
    const next = new Set(contacts.filter((c) => !c.bloqueado).map((c) => c.id));
    setSel(next);
    setStatus(next.size > 0 ? "need-tpl" : "idle");
    addMsg(
      `Seleccionaste ${next.size} contactos. ¿Elegís un template existente o querés que te arme uno especial para esta lista?`,
    );
  }

  function handleToggleFilter(key: KpiFilterKey) {
    setContactPage(1);
    setFilt((prev) => {
      const next = new Set(prev);
      let next24h = modo24h;

      if (key === "ai" && !prev.has("ai")) {
        next.clear();
        next.add("ai");
      } else if (key !== "ai" && prev.has("ai")) {
        next.delete("ai");
        next.add(key);
        if (key === "24h") next24h = true;
      } else if (next.has(key)) {
        next.delete(key);
        if (key === "24h") next24h = false;
      } else {
        next.add(key);
        if (key === "24h") next24h = true;
      }

      setModo24h(next24h);
      if (next24h && tplId) {
        setTplId(null);
        setIsCreatingNew(false);
      }
      recomputeSelFromFilters(next, next24h);
      setStatus("need-tpl");
      return next;
    });
  }

  function handleToggleRow(id: string) {
    setSel((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      if (next.size > 0 && status === "idle") setStatus("need-tpl");
      if (next.size === 0) setStatus("idle");
      return next;
    });
  }

  function handleToggleAll(checked: boolean) {
    setSel((prev) => {
      const next = new Set(prev);
      visibleContacts.forEach((c) => {
        checked ? next.add(c.id) : next.delete(c.id);
      });
      return next;
    });
  }

  function handleClearSel() {
    setSel(new Set());
    setTplId(null);
    setIsCreatingNew(false);
    setNewTplContent("");
    setNewTplName("");
    setFilt(new Set());
    setModo24h(false);
    setContactPage(1);
    setStatus("idle");
    addMsg(
      "Hola 👋 Seleccioná contactos usando los KPIs, o pedime que arme una lista. Puedo ayudarte en cada paso.",
    );
  }

  function handleStartNewTpl() {
    setIsCreatingNew(true);
    setTplId(null);
    setNewTplContent("");
    setNewTplName("");
    setNewTplCategoria("marketing");
    setStatus("editing-tpl");
    setTemplateModalOpen(true);
    addMsg(
      `Avisame si necesitás ayuda para escribir el template. Puedo sugerirte un texto pensado para tus ${sel.size} contactos.`,
    );
  }

  // Precarga el modal de creación con los datos de un borrador existente y
  // lo abre, cerrando el modal de detalle. tplId queda seteado con el id del
  // borrador para que handleSaveDraft haga UPDATE en vez de INSERT, y para
  // que handleSendToMeta sepa qué borrador borrar si el envío tiene éxito.
  function handleContinueDraft(template: Template) {
    setIsCreatingNew(true);
    setTplId(template.id);
    setNewTplContent(template.contenido);
    setNewTplName(template.nombre);
    setNewTplCategoria(template.tipo ?? "marketing");
    setStatus("editing-tpl");
    setDetailTemplate(null);
    setTemplateModalOpen(true);
  }

  function handleCancelNewTpl() {
    setIsCreatingNew(false);
    setTplId(null);
    setNewTplContent("");
    setNewTplName("");
    setNewTplCategoria("marketing");
    setTemplateModalOpen(false);
    setStatus(sel.size > 0 ? "need-tpl" : "idle");
  }

  async function handleGenerarIA(descripcion: string) {
    return generarTemplateConIAAction(descripcion, newTplCategoria);
  }

  async function handleSaveDraft() {
    setSavingDraft(true);
    const result = await saveTemplateDraftAction(newTplName, newTplContent, newTplCategoria, tplId);
    setSavingDraft(false);

    if (result.error) {
      addMsg(`No pude guardar el borrador: ${result.error}`);
      return;
    }

    setIsCreatingNew(false);
    setTplId(null);
    setTemplateModalOpen(false);
    router.refresh();
    addMsg(`Borrador "${newTplName}" guardado. Podés retomarlo cuando quieras desde Templates.`);
  }

  async function handleSendToMeta() {
    setStatus("approving");
    const result = await sendTemplateToMetaAction(newTplName, newTplContent, newTplCategoria);

    if (!result.ok) {
      setStatus("rejected");
      addMsg(`No se pudo enviar el template a Meta: ${result.error}`);
      return;
    }

    // Si veníamos de "Continuar borrador", borramos la fila borrador vieja
    // para que no quede duplicada con la nueva fila "enviado" que acaba de
    // crear el workflow de n8n. Se hace después de confirmar el envío para
    // no perder el borrador si sendTemplateToMetaAction hubiese fallado.
    // Si el borrado falla, avisamos: el template igual se envió a Meta
    // correctamente, pero puede quedar una fila "borrador" duplicada.
    if (tplId) {
      const deleteResult = await deleteTemplateDraftAction(tplId);
      if (deleteResult.error) {
        addMsg(
          `⚠️ El template se envió a Meta, pero no pude limpiar el borrador anterior: ${deleteResult.error}`,
          "error",
        );
      }
    }

    addMsg(result.mensaje);
    setStatus("ready");
    setIsCreatingNew(false);
    setTplId(null);
    setTemplateModalOpen(false);
    router.refresh();
    addMsg(
      "El template quedó \"En revisión\". Meta puede tardar unos minutos (a veces más) en aprobarlo — te vamos a avisar apenas cambie el estado.",
    );
  }

  // Historial corto (solo texto, sin payloads) que se le manda al
  // clasificador de intención del orquestador — no hace falta mandar la
  // conversación entera, con los últimos turnos alcanza para dar contexto.
  // Los avisos externos quedan afuera por el filtro de tipos: que Meta haya
  // aprobado un template no es algo que el usuario dijo, y meterlo en el
  // historial confundiría al clasificador sobre qué se está pidiendo.
  function buildHistory(): IAHistoryTurn[] {
    return messages
      .filter((m) => m.type === "user" || m.type === "bot")
      .slice(-8)
      .map((m) => ({
        role: m.type === "user" ? ("user" as const) : ("assistant" as const),
        text: m.text,
      }));
  }

  async function handleChatSend(text: string) {
    addMsg(text, "user");
    setIaSending(true);
    try {
      // Los renombres de audiencia y campaña se aplican por texto libre
      // dentro del flujo de edición, no desde una tarjeta, así que este es
      // el único punto donde podemos detectar que algo cambió en la base.
      const estabaEditando =
        iaFlowState.kind === "editar_recurso" &&
        iaFlowState.step === "editar_esperando_valor";
      const res = await sendIAMessageAction(text, buildHistory(), iaFlowState);
      setIaFlowState(res.flowState);
      addMsg(res.text, res.error ? "error" : "bot", res.payload);
      // El flujo vuelve a idle sólo cuando el cambio se aplicó: si el paso
      // sigue activo es que faltaba un dato, y no hay nada que refrescar.
      if (estabaEditando && !res.error && res.flowState.kind === null) {
        router.refresh();
      }
    } catch {
      addMsg(
        "Tuve un problema para procesar tu pedido. Probá de nuevo en unos segundos.",
        "error",
      );
    } finally {
      setIaSending(false);
    }
  }

  async function handleIAConfirmSeleccion(contactosIds: string[]) {
    setIaSending(true);
    try {
      const res = await confirmarSeleccionContactosAction(
        iaFlowState,
        contactosIds,
      );
      setIaFlowState(res.flowState);
      addMsg(res.text, res.error ? "error" : "bot", res.payload);
    } finally {
      setIaSending(false);
    }
  }

  async function handleIAConfirmAudiencia() {
    setIaSending(true);
    try {
      const res = await confirmarCreacionAudienciaAction(iaFlowState);
      setIaFlowState(res.flowState);
      addMsg(res.text, res.error ? "error" : "bot", res.payload);
      // La audiencia se creó server-side (saveListAction) — refrescamos la
      // prop `lists` desde el Server Component padre para que la sección
      // Audiencias y el botón "Ver audiencia →" de la tarjeta ya lo encuentren.
      if (!res.error) router.refresh();
    } finally {
      setIaSending(false);
    }
  }

  function handleIAVerAudiencia(audienciaId: string) {
    setActiveSection("grupos");
    setOpenGroupId(audienciaId);
  }

  async function handleIAElegirCategoria(categoria: string) {
    setIaSending(true);
    try {
      const res = await seleccionarCategoriaTemplateAction(iaFlowState, categoria);
      setIaFlowState(res.flowState);
      addMsg(res.text, res.error ? "error" : "bot", res.payload);
    } finally {
      setIaSending(false);
    }
  }

  async function handleIAUsarSugerencia() {
    setIaSending(true);
    try {
      const res = await usarSugerenciaTemplateAction(iaFlowState);
      setIaFlowState(res.flowState);
      addMsg(res.text, res.error ? "error" : "bot", res.payload);
    } finally {
      setIaSending(false);
    }
  }

  async function handleIAPedirOtraSugerencia() {
    setIaSending(true);
    try {
      const res = await pedirOtraSugerenciaTemplateAction(iaFlowState);
      setIaFlowState(res.flowState);
      addMsg(res.text, res.error ? "error" : "bot", res.payload);
    } finally {
      setIaSending(false);
    }
  }

  async function handleIAGuardarBorrador() {
    setIaSending(true);
    try {
      const res = await guardarBorradorTemplateAction(iaFlowState);
      setIaFlowState(res.flowState);
      addMsg(res.text, res.error ? "error" : "bot", res.payload);
      if (!res.error) router.refresh();
    } finally {
      setIaSending(false);
    }
  }

  async function handleIAEnviarAMeta() {
    setIaSending(true);
    try {
      const res = await confirmarEnvioTemplateAction(iaFlowState);
      setIaFlowState(res.flowState);
      addMsg(res.text, res.error ? "error" : "bot", res.payload);
      // El template se mandó a Meta (o falló al intentarlo) — refrescamos
      // `templates` para que la sección Templates y el polling de estado
      // ya lo vean sin que el usuario tenga que recargar la página.
      if (!res.error) router.refresh();
    } finally {
      setIaSending(false);
    }
  }

  function handleIAVerTemplates() {
    setActiveSection("templates");
  }

  async function handleIAElegirAudienciaCampana(audienciaId: string) {
    setIaSending(true);
    try {
      const editando = iaFlowState.kind === "editar_recurso";
      const res = await seleccionarAudienciaCampanaAction(iaFlowState, audienciaId);
      setIaFlowState(res.flowState);
      addMsg(res.text, res.error ? "error" : "bot", res.payload);
      if (editando && !res.error) router.refresh();
    } finally {
      setIaSending(false);
    }
  }

  async function handleIAElegirTemplateCampana(templateId: string) {
    setIaSending(true);
    try {
      const editando = iaFlowState.kind === "editar_recurso";
      const res = await seleccionarTemplateCampanaAction(iaFlowState, templateId);
      setIaFlowState(res.flowState);
      addMsg(res.text, res.error ? "error" : "bot", res.payload);
      // Si venía del flujo de edición, la campaña cambió en la base:
      // refrescamos para que la sección Campañas no muestre el dato viejo.
      if (editando && !res.error) router.refresh();
    } finally {
      setIaSending(false);
    }
  }

  async function handleIAElegirMomentoCampana(momento: "ahora" | "programar") {
    setIaSending(true);
    try {
      const res = await seleccionarMomentoCampanaAction(iaFlowState, momento);
      setIaFlowState(res.flowState);
      addMsg(res.text, res.error ? "error" : "bot", res.payload);
    } finally {
      setIaSending(false);
    }
  }

  async function handleIAElegirFechaCampana(fechaIso: string) {
    setIaSending(true);
    try {
      const editando = iaFlowState.kind === "editar_recurso";
      const res = await seleccionarFechaCampanaAction(iaFlowState, fechaIso);
      setIaFlowState(res.flowState);
      addMsg(res.text, res.error ? "error" : "bot", res.payload);
      if (editando && !res.error) router.refresh();
    } finally {
      setIaSending(false);
    }
  }

  async function handleIAConfirmarCampana() {
    setIaSending(true);
    try {
      const res = await confirmarCreacionCampanaAction(iaFlowState);
      setIaFlowState(res.flowState);
      addMsg(res.text, res.error ? "error" : "bot", res.payload);
      // La campaña se guardó (y, si era inmediata, ya se disparó el envío)
      // server-side — refrescamos `campaigns` para que la sección Campañas
      // y el botón "Ver campaña →" de la tarjeta ya la encuentren.
      if (!res.error) router.refresh();
    } finally {
      setIaSending(false);
    }
  }

  function handleIAVerCampana(campanaId: string) {
    setActiveSection("campanas");
    setDetailCampaignId(campanaId);
  }

  async function handleIAElegirRecursoEditar(id: string, nombre: string) {
    setIaSending(true);
    try {
      const res = await seleccionarRecursoEditarAction(iaFlowState, id, nombre);
      setIaFlowState(res.flowState);
      addMsg(res.text, res.error ? "error" : "bot", res.payload);
    } finally {
      setIaSending(false);
    }
  }

  async function handleIAElegirTemperatura(temperatura: "caliente" | "tibio" | "frio") {
    setIaSending(true);
    try {
      const res = await aplicarTemperaturaAction(iaFlowState, temperatura);
      setIaFlowState(res.flowState);
      addMsg(res.text, res.error ? "error" : "bot", res.payload);
      // La temperatura cambió: refrescamos para que Contactos lo refleje.
      if (!res.error) router.refresh();
    } finally {
      setIaSending(false);
    }
  }

  async function handleIAElegirCampoCampana(
    campo: "nombre" | "template" | "audiencia" | "fecha",
  ) {
    setIaSending(true);
    try {
      const res = await seleccionarCampoCampanaAction(iaFlowState, campo);
      setIaFlowState(res.flowState);
      addMsg(res.text, res.error ? "error" : "bot", res.payload);
    } finally {
      setIaSending(false);
    }
  }

  async function handleIAConfirmarImportarContactos(
    diasAnalisis: number,
    limiteContactos: number,
  ) {
    setIaSending(true);
    try {
      const res = await confirmarImportarContactosAction(
        iaFlowState,
        diasAnalisis,
        limiteContactos,
      );
      setIaFlowState(res.flowState);
      addMsg(res.text, res.error ? "error" : "bot", res.payload);
      // La importación pudo haber traído contactos/leads nuevos — refrescamos
      // para que Contactos y el resto de la app los vean sin recargar.
      if (!res.error) router.refresh();
    } finally {
      setIaSending(false);
    }
  }

  async function handleIACrearAudienciaDesdeBusqueda(
    consulta: string,
    contactosIds: string[],
  ) {
    setIaSending(true);
    try {
      const res = await iniciarAudienciaDesdeResultadosBusquedaAction(
        consulta,
        contactosIds,
      );
      setIaFlowState(res.flowState);
      addMsg(res.text, res.error ? "error" : "bot", res.payload);
    } finally {
      setIaSending(false);
    }
  }

  async function handleIACrearAudienciaDesdeImportacion(
    contactosIds: string[],
  ) {
    setIaSending(true);
    try {
      const res = await iniciarAudienciaDesdeImportacionAction(contactosIds);
      setIaFlowState(res.flowState);
      addMsg(res.text, res.error ? "error" : "bot", res.payload);
    } finally {
      setIaSending(false);
    }
  }

  function handleLogout() {
    setProfileOpen(false);
    setDrawerOpen(false);
    setLogoutModalOpen(true);
  }

  async function handleConfirmLogout() {
    setLogoutModalOpen(false);
    await onLogout();
    router.refresh();
  }

  // Configuración (tema/idioma) deshabilitada a pedido de Bauti (2026-08-18):
  // el botón que abría este panel se ocultó, pero se deja la función lista
  // para reactivar fácilmente el acceso más adelante.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  function handleOpenSettings() {
    setProfileView("settings");
    setProfileOpen(true);
  }

  const planLabel = PLAN_LABELS[user.plan] || user.plan;

  return (
    <div className="flex h-full bg-ys-bg overflow-x-hidden">
      <Sidebar
        active={activeSection}
        onNavigate={setActiveSection}
        userName={user.contactoNombre}
        planLabel={planLabel}
        onLogout={handleLogout}
        onOpenMyProfile={() => setMyProfileOpen(true)}
      />

      <MobileHeader onOpenDrawer={() => setDrawerOpen(true)} />
      <MobileDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        active={activeSection}
        onNavigate={setActiveSection}
        userName={user.contactoNombre}
        planLabel={planLabel}
        onLogout={handleLogout}
        onOpenMyProfile={() => setMyProfileOpen(true)}
      />

      <ProfileDrawer
        open={profileOpen}
        user={user}
        view={profileView}
        onViewChange={setProfileView}
        onClose={() => setProfileOpen(false)}
        onLogout={handleLogout}
        onOpenMyProfile={() => {
          setProfileOpen(false);
          setMyProfileOpen(true);
        }}
      />

      <MyProfileModal
        open={myProfileOpen}
        user={user}
        onClose={() => setMyProfileOpen(false)}
        onUserUpdate={(patch) => setUser((prev) => ({ ...prev, ...patch }))}
      />

      <LogoutModal
        open={logoutModalOpen}
        onClose={() => setLogoutModalOpen(false)}
        onConfirm={handleConfirmLogout}
      />

      {activeSection === "dashboard" && (
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden pt-[58px] md:pt-0">
          <Dashboard
            userName={user.contactoNombre}
            tenantId={user.tenantId}
            campaigns={campaigns}
            onViewAllCampaigns={() => setActiveSection("campanas")}
            onNewCampaign={() => {
              setWizardInitial(null);
              setWizardOpen(true);
            }}
          />
        </div>
      )}

      {activeSection === "grupos" && (
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden pt-[58px] md:pt-0">
          <Audiencias
            lists={lists}
            contacts={contacts}
            onOpenGroup={(group) => setOpenGroupId(group.id)}
            onCreateGroup={() => setCreateGroupOpen(true)}
          />
        </div>
      )}

      {activeSection === "templates" && (
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden pt-[58px] md:pt-0">
          <Templates
            templates={templates}
            onNewTemplate={handleStartNewTpl}
            onOpenTemplate={setDetailTemplate}
          />
        </div>
      )}

      {activeSection === "campanas" && (
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden pt-[58px] md:pt-0">
          <Campanas
            campaigns={campaigns}
            onNewCampaign={() => {
              setWizardInitial(null);
              setWizardOpen(true);
            }}
            onOpenCampaign={(campaignId) => setDetailCampaignId(campaignId)}
          />
        </div>
      )}

      {activeSection === "ia" && (
        <IA
          userName={user.contactoNombre}
          messages={messages}
          contacts={contacts}
          onSend={handleChatSend}
          onConfirmSeleccion={handleIAConfirmSeleccion}
          onConfirmAudiencia={handleIAConfirmAudiencia}
          onVerAudiencia={handleIAVerAudiencia}
          onElegirCategoria={handleIAElegirCategoria}
          onUsarSugerencia={handleIAUsarSugerencia}
          onPedirOtraSugerencia={handleIAPedirOtraSugerencia}
          onGuardarBorrador={handleIAGuardarBorrador}
          onEnviarAMeta={handleIAEnviarAMeta}
          onVerTemplates={handleIAVerTemplates}
          onElegirAudienciaCampana={handleIAElegirAudienciaCampana}
          onElegirTemplateCampana={handleIAElegirTemplateCampana}
          onElegirMomentoCampana={handleIAElegirMomentoCampana}
          onElegirFechaCampana={handleIAElegirFechaCampana}
          onConfirmarCampana={handleIAConfirmarCampana}
          onVerCampana={handleIAVerCampana}
          onConfirmarImportarContactos={handleIAConfirmarImportarContactos}
          onCrearAudienciaDesdeBusqueda={handleIACrearAudienciaDesdeBusqueda}
          onCrearAudienciaDesdeImportacion={handleIACrearAudienciaDesdeImportacion}
          onElegirRecursoEditar={handleIAElegirRecursoEditar}
          onElegirTemperatura={handleIAElegirTemperatura}
          onElegirCampoCampana={handleIAElegirCampoCampana}
          onNuevaConversacion={handleIANuevaConversacion}
          onSeleccionarConversacion={handleIASeleccionarConversacion}
          onBorrarConversacion={handleIABorrarConversacion}
          conversacionActivaId={iaConversacionId}
          sending={iaSending}
        />
      )}

      {activeSection === "contactos" && (
      <div className="flex-1 min-w-0 flex flex-col overflow-y-auto pt-[58px] md:pt-0">
      <div className="px-4 md:px-[38px] pt-3 md:pt-[34px] flex flex-col gap-1.5">
        <div className="text-2xl md:text-[28px] font-extrabold tracking-[-0.025em] text-ys-text">
          Contactos
        </div>
        <div className="text-sm md:text-[15px] text-ys-dim font-medium">
          Gestioná y analizá tus contactos de WhatsApp.
        </div>
      </div>

      <KpiRow
        counts={counts}
        activeFilters={filt}
        onSelectTotal={handleSelectTotal}
        onToggleFilter={handleToggleFilter}
        onImportClick={() => setQrOpen(true)}
        onAnalyzeClick={() => {
          if (wahaConectada) {
            setSyncModalOpen(true);
          } else {
            setWahaRequiredOpen(true);
          }
        }}
        importing={false}
      />

      {/* ── Contenido desktop: grid de 2 columnas, sin cambios de comportamiento ── */}
      <div className="hidden md:flex relative px-[38px] pb-[34px]">
        <div className="flex flex-col flex-1 relative bg-white border border-ys-border rounded-2xl">
          <div className="flex items-center gap-3 px-6 pt-[18px] pb-4 flex-none">
            <div className="text-[15px] font-extrabold text-ys-text">Todos los contactos</div>
            <div className="ml-auto flex items-center gap-2.5 bg-ys-bg border border-ys-border rounded-[10px] px-3.5 py-2.5 w-[250px] transition-colors focus-within:border-ys-green-border">
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none" className="flex-none">
                <circle cx="7" cy="7" r="4.5" stroke="#9aa19c" strokeWidth="1.5" />
                <path d="m10.5 10.5 3 3" stroke="#9aa19c" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              <input
                type="text"
                value={contactSearch}
                onChange={(e) => handleContactSearchChange(e.target.value)}
                placeholder="Buscar contacto..."
                className="flex-1 min-w-0 bg-transparent border-none outline-none text-[13.5px] text-ys-text placeholder:text-[#9aa19c] placeholder:font-medium"
              />
            </div>
          </div>
          <div className="overflow-hidden rounded-b-2xl">
            <ContactsTable
              contacts={paginatedContacts}
              selected={sel}
              onToggleRow={handleToggleRow}
              onToggleAll={handleToggleAll}
              onOpenDetail={setDetailContact}
              modo24h={modo24h}
            />
          </div>
          <ContactsPagination
            page={contactPageSafe}
            totalPages={contactTotalPages}
            totalItems={visibleContacts.length}
            perPage={CONTACTS_PER_PAGE}
            onChange={setContactPage}
          />
        </div>
      </div>
      {sel.size > 0 && (
        <div
          className="hidden md:flex fixed bottom-6 left-[calc(248px+38px)] right-[38px] z-[9] bg-ys-dark rounded-2xl pl-[18px] pr-3.5 py-3 items-center gap-3.5 shadow-[0_12px_30px_rgba(16,24,20,0.22)]"
          style={{ animation: "ys-bar-up .18s cubic-bezier(.4,0,.2,1) both" }}
        >
          <div className="text-[13.5px] font-bold text-white">
            {sel.size} contacto{sel.size === 1 ? "" : "s"} seleccionado{sel.size === 1 ? "" : "s"}
          </div>
          <button
            onClick={handleClearSel}
            className="text-[12.5px] font-semibold text-[#9aa9a3] hover:text-white transition-colors cursor-pointer"
          >
            Deseleccionar
          </button>
          <div className="ml-auto flex items-center gap-2.5">
            <button
              onClick={() => setAddToGroupOpen(true)}
              className="text-[13px] font-bold text-[#eef1ef] border border-[#33403a] rounded-[10px] px-3.5 py-2.5 cursor-pointer transition-colors hover:bg-[#1e2a24]"
            >
              Agregar a audiencia existente
            </button>
            <button
              onClick={() => setCreateGroupOpen(true)}
              className="text-[13px] font-extrabold text-[#0b1310] bg-ys-green rounded-[10px] px-4 py-2.5 cursor-pointer transition-all hover:bg-[#3ddb8f] hover:-translate-y-px"
            >
              Crear nueva audiencia
            </button>
          </div>
        </div>
      )}

      {/* ── Contenido mobile: misma tabla + barra flotante que en desktop ── */}
      <div className="flex md:hidden flex-col px-4 pb-4">
        <div className="flex flex-col relative bg-white border border-ys-border rounded-2xl">
          <div className="px-4 pt-4 pb-3 flex-none">
            <div className="text-sm font-extrabold text-ys-text mb-3">Todos los contactos</div>
            <div className="flex items-center gap-2.5 bg-ys-bg border border-ys-border rounded-[10px] px-3.5 py-2.5 transition-colors focus-within:border-ys-green-border">
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none" className="flex-none">
                <circle cx="7" cy="7" r="4.5" stroke="#9aa19c" strokeWidth="1.5" />
                <path d="m10.5 10.5 3 3" stroke="#9aa19c" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              <input
                type="text"
                value={contactSearch}
                onChange={(e) => handleContactSearchChange(e.target.value)}
                placeholder="Buscar contacto..."
                className="flex-1 min-w-0 bg-transparent border-none outline-none text-[13.5px] text-ys-text placeholder:text-[#9aa19c] placeholder:font-medium"
              />
            </div>
          </div>
          <div className="overflow-hidden rounded-b-2xl">
            <ContactsTable
              contacts={paginatedContacts}
              selected={sel}
              onToggleRow={handleToggleRow}
              onToggleAll={handleToggleAll}
              onOpenDetail={setDetailContact}
              modo24h={modo24h}
            />
          </div>
          <ContactsPagination
            page={contactPageSafe}
            totalPages={contactTotalPages}
            totalItems={visibleContacts.length}
            perPage={CONTACTS_PER_PAGE}
            onChange={setContactPage}
            compact
          />
        </div>
      </div>
      {sel.size > 0 && (
        <div
          className="flex md:hidden fixed bottom-3 left-3 right-3 z-[9] bg-ys-dark rounded-2xl pl-4 pr-3 py-3 flex-wrap items-center gap-2.5 shadow-[0_12px_30px_rgba(16,24,20,0.22)]"
          style={{ animation: "ys-bar-up .18s cubic-bezier(.4,0,.2,1) both" }}
        >
          <div className="text-[13px] font-bold text-white">{sel.size} sel.</div>
          <button
            onClick={handleClearSel}
            className="text-xs font-semibold text-[#9aa9a3] cursor-pointer"
          >
            Deseleccionar
          </button>
          <div className="w-full flex items-center gap-2 mt-1">
            <button
              onClick={() => setAddToGroupOpen(true)}
              className="flex-1 text-xs font-bold text-[#eef1ef] border border-[#33403a] rounded-lg px-2.5 py-2 cursor-pointer text-center"
            >
              Agregar a audiencia
            </button>
            <button
              onClick={() => setCreateGroupOpen(true)}
              className="flex-1 text-xs font-extrabold text-[#0b1310] bg-ys-green rounded-lg px-2.5 py-2 cursor-pointer text-center"
            >
              Crear audiencia
            </button>
          </div>
        </div>
      )}
      </div>
      )}

      <QrImportModal
        open={qrOpen}
        onClose={() => setQrOpen(false)}
        status={qrStatus}
        qrImageUrl={qrImageUrl}
      />

      <WahaRequiredModal
        open={wahaRequiredOpen}
        onClose={() => setWahaRequiredOpen(false)}
        onVincular={() => {
          setWahaRequiredOpen(false);
          setQrOpen(true);
        }}
      />

      <SyncConfigModal
        open={syncModalOpen}
        onClose={() => setSyncModalOpen(false)}
        wahaConectada={wahaConectada === true}
        onWahaDesconectada={() => setWahaRequiredOpen(true)}
        onRun={async (config) => {
          const result = await syncAndAnalyzeAction(config);
          if (result.success) {
            notificar(
              `Analicé ${result.contactosAnalizados} conversaciones y encontré ${result.leadsIdentificados} leads con interés.`,
            );
            router.refresh();
          } else {
            notificar(
              `No pude completar el análisis: ${result.error ?? "error desconocido"}`,
              "error",
            );
          }
          return result;
        }}
      />

      <TemplateCreateModal
        open={templateModalOpen}
        content={newTplContent}
        onContentChange={setNewTplContent}
        name={newTplName}
        onNameChange={setNewTplName}
        categoria={newTplCategoria}
        onCategoriaChange={setNewTplCategoria}
        onCancel={handleCancelNewTpl}
        onSaveDraft={handleSaveDraft}
        onSendToMeta={handleSendToMeta}
        onGenerateIA={handleGenerarIA}
        sending={status === "approving"}
        savingDraft={savingDraft}
      />

      <TemplateDetailModal
        template={detailTemplate}
        onClose={() => setDetailTemplate(null)}
        onContinueDraft={handleContinueDraft}
      />

      <CampaignWizardModal
        key={wizardInitial ? `dup-${wizardInitial.nombre}` : "new"}
        open={wizardOpen}
        lists={lists}
        templates={templatesAprobados}
        costPerMsg={COST_PER_MSG}
        initial={wizardInitial ?? undefined}
        onClose={() => setWizardOpen(false)}
        onFetchInsight={async () => {
          const result = await getCampaignInsightAction();
          return { insight: result.insight, error: result.error };
        }}
        onFetchSugerenciaHorario={getSugerenciaHorarioAction}
        onConfirm={async ({ nombre, listaId, templateId, contactosIds, momento, fechaProgramada }) => {
          const saveResult = await saveCampaignAction(
            nombre,
            listaId,
            templateId,
            contactosIds,
            momento === "programar" ? fechaProgramada : null,
            wizardInitial?.esDuplicada ?? false,
          );

          if (saveResult.error || !saveResult.id) {
            return { error: saveResult.error };
          }

          if (momento === "programar") {
            notificar(
              `Campaña "${nombre}" programada para ${fechaProgramada ? new Date(fechaProgramada).toLocaleString("es-AR") : ""}.`,
            );
            router.refresh();
            return { error: null };
          }

          const template = templates.find((t) => t.id === templateId);
          const sendResult = await sendCampaignAction(
            saveResult.id,
            listaId ?? "",
            template?.nombre ?? "",
            template?.templateLang ?? "es_AR",
            false,
            contactosIds.length,
          );

          if (sendResult.error) {
            return { error: sendResult.error };
          }

          notificar(
            `Campaña "${nombre}" enviándose a ${contactosIds.length} contactos.`,
          );
          router.refresh();
          return { error: null };
        }}
      />

      <CampaignDetailModal
        campaignId={detailCampaignId}
        tenantId={user.tenantId}
        onClose={() => setDetailCampaignId(null)}
        onFetchDetail={getCampaignDetailAction}
        onFetchInsight={async () => {
          const result = await getCampaignInsightAction();
          return { insight: result.insight, error: result.error };
        }}
        onDuplicate={(detail) => {
          setDetailCampaignId(null);
          const listaExiste = !!detail.listaId && lists.some((l) => l.id === detail.listaId);
          const templateExiste = !!detail.templateId && templates.some((t) => t.id === detail.templateId);
          setWizardInitial({
            nombre: `${detail.nombre} (copia)`,
            listaId: listaExiste ? detail.listaId : null,
            templateId: templateExiste ? detail.templateId : null,
            paso: listaExiste && templateExiste ? 4 : 1,
            esDuplicada: true,
          });
          setWizardOpen(true);
        }}
        onDelete={async (campaignId) => {
          const result = await deleteCampaignAction(campaignId);
          if (result.error) {
            notificar(`No se pudo eliminar la campaña: ${result.error}`, "error");
            return { error: result.error };
          }
          notificar("Campaña eliminada");
          setDetailCampaignId(null);
          router.refresh();
          return { error: null };
        }}
        key={detailCampaignId ?? "closed"}
      />

      <CreateAudienceModal
        open={createGroupOpen}
        contacts={contacts}
        preselectedIds={Array.from(sel)}
        onClose={() => setCreateGroupOpen(false)}
        onGoToContacts={() => {
          setCreateGroupOpen(false);
          setActiveSection("contactos");
        }}
        onCreate={async (nombre, contactIds) => {
          const result = await saveListAction(nombre, contactIds);
          if (result.error) {
            notificar(`No se pudo crear la audiencia: ${result.error}`, "error");
          } else {
            notificar(`Audiencia "${nombre}" creada con ${contactIds.length} contacto${contactIds.length === 1 ? "" : "s"}`);
            router.refresh();
            setCreateGroupOpen(false);
            handleClearSel();
          }
        }}
      />

      <AddToAudienceModal
        open={addToGroupOpen}
        lists={lists}
        selectedCount={sel.size}
        onClose={() => setAddToGroupOpen(false)}
        onAdd={async (listaId) => {
          const result = await addContactsToListAction(listaId, Array.from(sel));
          if (result.error) {
            notificar(`No se pudo agregar a la audiencia: ${result.error}`, "error");
          } else {
            const audiencia = lists.find((l) => l.id === listaId);
            notificar(
              `${sel.size} contacto${sel.size === 1 ? "" : "s"} agregado${sel.size === 1 ? "" : "s"} a "${audiencia?.nombre ?? "audiencia"}"`,
            );
            router.refresh();
            setAddToGroupOpen(false);
            handleClearSel();
          }
        }}
      />

      <AudienciaDetailModal
        key={openGroupId ?? "none"}
        group={lists.find((l) => l.id === openGroupId) ?? null}
        contacts={contacts}
        campaigns={campaigns}
        onClose={() => setOpenGroupId(null)}
        onRename={async (id, nombre) => {
          const result = await renameListAction(id, nombre);
          if (result.error) {
            notificar(`No se pudo renombrar la audiencia: ${result.error}`, "error");
          } else {
            notificar(`Audiencia renombrada a "${nombre}"`);
            router.refresh();
          }
        }}
        onRemoveContacts={async (id, contactIds) => {
          const result = await removeContactsFromListAction(id, contactIds);
          if (result.error) {
            notificar(`No se pudo quitar el contacto de la audiencia: ${result.error}`, "error");
          } else {
            router.refresh();
          }
        }}
        onAddContacts={async (id, contactIds) => {
          const result = await addContactsToListAction(id, contactIds);
          if (result.error) {
            notificar(`No se pudo agregar contactos a la audiencia: ${result.error}`, "error");
          } else {
            notificar(
              `${contactIds.length} contacto${contactIds.length === 1 ? "" : "s"} agregado${contactIds.length === 1 ? "" : "s"} a la audiencia`,
            );
            router.refresh();
          }
        }}
        onDelete={async (id) => {
          const audiencia = lists.find((l) => l.id === id);
          const result = await deleteListAction(id);
          if (result.error) {
            notificar(`No se pudo eliminar la audiencia: ${result.error}`, "error");
          } else {
            notificar(`Audiencia "${audiencia?.nombre ?? ""}" eliminada`);
            router.refresh();
            setOpenGroupId(null);
          }
        }}
        onCreateCampaign={() => {
          setOpenGroupId(null);
          setWizardInitial(null);
          setWizardOpen(true);
        }}
      />

      <ContactDetailModal
        contact={detailContact}
        onClose={() => setDetailContact(null)}
        onSetTemperaturaManual={async (contactId, temperatura) => {
          const result = await setTemperaturaManualAction(contactId, temperatura);
          if (result.error) {
            notificar(`No se pudo guardar el ajuste: ${result.error}`, "error");
            return;
          }
          // Actualización optimista en el modal abierto, así el cambio se ve
          // al instante sin esperar el refresh del servidor.
          setDetailContact((prev) =>
            prev && prev.id === contactId
              ? { ...prev, scoreManual: temperatura ?? "", score: temperatura ?? prev.score }
              : prev,
          );
          router.refresh();
        }}
      />

      <Toast toast={toast} onCerrar={() => setToast(null)} />
    </div>
  );
}
