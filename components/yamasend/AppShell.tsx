"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  AppSection,
  AppUser,
  Campaign,
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
import Grupos from "./Grupos";
import GroupDetailModal from "./GroupDetailModal";
import Templates from "./Templates";
import TemplateCreateModal from "./TemplateCreateModal";
import TemplateDetailModal from "./TemplateDetailModal";
import Campanas from "./Campanas";
import CampaignWizardModal from "./CampaignWizardModal";
import CampaignDetailModal from "./CampaignDetailModal";
import IA from "./IA";
import ProfileDrawer from "./ProfileDrawer";
import LogoutModal from "./LogoutModal";
import KpiRow from "./KpiRow";
import ContactsTable from "./ContactsTable";
import ContactsPagination from "./ContactsPagination";
import QrImportModal from "./QrImportModal";
import SyncConfigModal from "./SyncConfigModal";
import ContactDetailModal from "./ContactDetailModal";
import { CreateGroupModal, AddToGroupModal } from "./GroupModals";
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
} from "@/lib/actions/sync";
import { getCampaignDetailAction } from "@/lib/actions/campaigns";
import {
  sendIAMessageAction,
  confirmarSeleccionContactosAction,
  confirmarCreacionGrupoAction,
} from "@/lib/actions/ia";
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
  user,
  contacts,
  templates: templatesProp,
  lists,
  campaigns,
  onLogout,
}: AppShellProps) {
  const router = useRouter();
  // Estado local de templates, sincronizado inicialmente con la prop del
  // server component. Necesario para poder actualizarlo desde el polling de
  // abajo sin depender de router.refresh() (que recarga todo /panel).
  const [templates, setTemplates] = useState<Template[]>(templatesProp);
  useEffect(() => {
    setTemplates(templatesProp);
  }, [templatesProp]);

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
        setTemplates(result.templates);
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

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      type: "bot",
      text: "Hola 👋 Soy tu asistente AI. Podés pedirme que arme un grupo de contactos hablando conmigo.",
    },
  ]);
  const [iaFlowState, setIaFlowState] = useState<IAFlowState>(IA_FLOW_IDLE);
  const [iaSending, setIaSending] = useState(false);

  function addMsg(
    text: string,
    type: ChatMessage["type"] = "bot",
    payload?: ChatPayload,
  ) {
    const id = `${Date.now()}-${Math.random()}`;
    setMessages((prev) => [...prev, { id, text, type, payload }]);
    return id;
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
      const res = await sendIAMessageAction(text, buildHistory(), iaFlowState);
      setIaFlowState(res.flowState);
      addMsg(res.text, res.error ? "error" : "bot", res.payload);
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

  async function handleIAConfirmGrupo() {
    setIaSending(true);
    try {
      const res = await confirmarCreacionGrupoAction(iaFlowState);
      setIaFlowState(res.flowState);
      addMsg(res.text, res.error ? "error" : "bot", res.payload);
      // El grupo se creó server-side (saveListAction) — refrescamos la
      // prop `lists` desde el Server Component padre para que la sección
      // Grupos y el botón "Ver grupo →" de la tarjeta ya lo encuentren.
      if (!res.error) router.refresh();
    } finally {
      setIaSending(false);
    }
  }

  function handleIAVerGrupo(grupoId: string) {
    setActiveSection("grupos");
    setOpenGroupId(grupoId);
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
      />

      <ProfileDrawer
        open={profileOpen}
        user={user}
        view={profileView}
        onViewChange={setProfileView}
        onClose={() => setProfileOpen(false)}
        onLogout={handleLogout}
      />

      <LogoutModal
        open={logoutModalOpen}
        onClose={() => setLogoutModalOpen(false)}
        onConfirm={handleConfirmLogout}
      />

      {activeSection === "dashboard" && (
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden pt-[58px] md:pt-0">
          <Dashboard userName={user.contactoNombre} />
        </div>
      )}

      {activeSection === "grupos" && (
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden pt-[58px] md:pt-0">
          <Grupos
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
          onConfirmGrupo={handleIAConfirmGrupo}
          onVerGrupo={handleIAVerGrupo}
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
        onAnalyzeClick={() => setSyncModalOpen(true)}
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
              Agregar a grupo existente
            </button>
            <button
              onClick={() => setCreateGroupOpen(true)}
              className="text-[13px] font-extrabold text-[#0b1310] bg-ys-green rounded-[10px] px-4 py-2.5 cursor-pointer transition-all hover:bg-[#3ddb8f] hover:-translate-y-px"
            >
              Crear nuevo grupo
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
              Agregar a grupo
            </button>
            <button
              onClick={() => setCreateGroupOpen(true)}
              className="flex-1 text-xs font-extrabold text-[#0b1310] bg-ys-green rounded-lg px-2.5 py-2 cursor-pointer text-center"
            >
              Crear grupo
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

      <SyncConfigModal
        open={syncModalOpen}
        onClose={() => setSyncModalOpen(false)}
        onRun={async (config) => {
          const result = await syncAndAnalyzeAction(config);
          if (result.success) {
            addMsg(
              `✅ Analicé ${result.contactosAnalizados} conversaciones y encontré ${result.leadsIdentificados} leads con interés. Ya podés verlos en tu lista de contactos.`,
            );
            router.refresh();
          } else {
            addMsg(
              `⚠️ No pude completar el análisis: ${result.error ?? "error desconocido"}`,
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
        templates={templates}
        costPerMsg={COST_PER_MSG}
        initial={wizardInitial ?? undefined}
        onClose={() => setWizardOpen(false)}
        onFetchInsight={async () => {
          const result = await getCampaignInsightAction();
          return { insight: result.insight, error: result.error };
        }}
        onConfirm={async ({ nombre, listaId, templateId, contactosIds, momento, fechaProgramada }) => {
          const saveResult = await saveCampaignAction(
            nombre,
            listaId,
            templateId,
            contactosIds,
            momento === "programar" ? fechaProgramada : null,
          );

          if (saveResult.error || !saveResult.id) {
            return { error: saveResult.error };
          }

          if (momento === "programar") {
            addMsg(
              `🕒 Campaña "${nombre}" programada para ${fechaProgramada ? new Date(fechaProgramada).toLocaleString("es-AR") : ""}.`,
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

          addMsg(
            `✅ Campaña "${nombre}" enviándose a ${contactosIds.length} contactos.`,
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
          });
          setWizardOpen(true);
        }}
        onDelete={async (campaignId) => {
          const result = await deleteCampaignAction(campaignId);
          if (result.error) {
            addMsg(`⚠️ No se pudo eliminar la campaña: ${result.error}`, "error");
            return { error: result.error };
          }
          addMsg("Campaña eliminada ✓");
          setDetailCampaignId(null);
          router.refresh();
          return { error: null };
        }}
        key={detailCampaignId ?? "closed"}
      />

      <CreateGroupModal
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
            addMsg(`⚠️ No se pudo crear el grupo: ${result.error}`, "error");
          } else {
            addMsg(`Grupo "${nombre}" creado con ${contactIds.length} contacto${contactIds.length === 1 ? "" : "s"} ✓`);
            router.refresh();
            setCreateGroupOpen(false);
            handleClearSel();
          }
        }}
      />

      <AddToGroupModal
        open={addToGroupOpen}
        lists={lists}
        selectedCount={sel.size}
        onClose={() => setAddToGroupOpen(false)}
        onAdd={async (listaId) => {
          const result = await addContactsToListAction(listaId, Array.from(sel));
          if (result.error) {
            addMsg(`⚠️ No se pudo agregar al grupo: ${result.error}`, "error");
          } else {
            const grupo = lists.find((l) => l.id === listaId);
            addMsg(
              `${sel.size} contacto${sel.size === 1 ? "" : "s"} agregado${sel.size === 1 ? "" : "s"} a "${grupo?.nombre ?? "grupo"}" ✓`,
            );
            router.refresh();
            setAddToGroupOpen(false);
            handleClearSel();
          }
        }}
      />

      <GroupDetailModal
        key={openGroupId ?? "none"}
        group={lists.find((l) => l.id === openGroupId) ?? null}
        contacts={contacts}
        campaigns={campaigns}
        onClose={() => setOpenGroupId(null)}
        onRename={async (id, nombre) => {
          const result = await renameListAction(id, nombre);
          if (result.error) {
            addMsg(`⚠️ No se pudo renombrar el grupo: ${result.error}`, "error");
          } else {
            addMsg(`Grupo renombrado a "${nombre}" ✓`);
            router.refresh();
          }
        }}
        onRemoveContacts={async (id, contactIds) => {
          const result = await removeContactsFromListAction(id, contactIds);
          if (result.error) {
            addMsg(`⚠️ No se pudo quitar el contacto del grupo: ${result.error}`, "error");
          } else {
            router.refresh();
          }
        }}
        onAddContacts={async (id, contactIds) => {
          const result = await addContactsToListAction(id, contactIds);
          if (result.error) {
            addMsg(`⚠️ No se pudo agregar contactos al grupo: ${result.error}`, "error");
          } else {
            addMsg(
              `${contactIds.length} contacto${contactIds.length === 1 ? "" : "s"} agregado${contactIds.length === 1 ? "" : "s"} al grupo ✓`,
            );
            router.refresh();
          }
        }}
        onDelete={async (id) => {
          const grupo = lists.find((l) => l.id === id);
          const result = await deleteListAction(id);
          if (result.error) {
            addMsg(`⚠️ No se pudo eliminar el grupo: ${result.error}`, "error");
          } else {
            addMsg(`Grupo "${grupo?.nombre ?? ""}" eliminado ✓`);
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
            addMsg(`⚠️ No se pudo guardar el ajuste: ${result.error}`, "error");
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
    </div>
  );
}
