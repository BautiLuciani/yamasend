"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  AppSection,
  AppUser,
  Campaign,
  ChatMessage,
  Contact,
  ContactList,
  KpiFilterKey,
  StatusState,
  Template,
} from "@/lib/types";
import Sidebar from "./Sidebar";
import MobileHeader from "./MobileHeader";
import MobileDrawer from "./MobileDrawer";
import Dashboard from "./Dashboard";
import ProfileDrawer from "./ProfileDrawer";
import KpiRow from "./KpiRow";
import ContactsTable from "./ContactsTable";
import CampaignPanel from "./CampaignPanel";
import Footer, { ListActionsBar, CampaignActionsBar } from "./Footer";
import AiChatBar from "./AiChatBar";
import QrImportModal from "./QrImportModal";
import SyncConfigModal from "./SyncConfigModal";
import ContactDetailModal from "./ContactDetailModal";
import SaveModal from "./SaveModal";
import { saveListAction, saveCampaignAction } from "@/lib/actions/write";
import { syncAndAnalyzeAction, setTemperaturaManualAction } from "@/lib/actions/sync";
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
  templates,
  lists,
  campaigns,
  onLogout,
}: AppShellProps) {
  const router = useRouter();
  const [activeSection, setActiveSection] = useState<AppSection>("dashboard");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [filt, setFilt] = useState<Set<KpiFilterKey>>(new Set());
  const [modo24h, setModo24h] = useState(false);

  const [tplId, setTplId] = useState<string | null>(null);
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [newTplContent, setNewTplContent] = useState("");
  const [newTplName, setNewTplName] = useState("");
  const [freeText, setFreeText] = useState("");

  const [status, setStatus] = useState<StatusState>("idle");

  const [qrOpen, setQrOpen] = useState(false);
  const [qrStatus, setQrStatus] = useState<
    "loading" | "waiting" | "connected" | "error"
  >("loading");
  const [qrImageUrl, setQrImageUrl] = useState<string | null>(null);
  const qrPollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const qrObjectUrlRef = useRef<string | null>(null);
  const [saveModal, setSaveModal] = useState<"lista" | "campaña" | null>(null);
  const [mobileTab, setMobileTab] = useState<
    "inicio" | "contactos" | "campana" | "chat"
  >("contactos");
  const [syncModalOpen, setSyncModalOpen] = useState(false);
  const [detailContact, setDetailContact] = useState<Contact | null>(null);

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
          // Le damos un instante al usuario para ver el "✅ Conectado" antes
          // de pasar automáticamente al modal de configuración del análisis.
          setTimeout(() => {
            setQrOpen(false);
            setSyncModalOpen(true);
          }, 1200);
          return; // conectado: dejamos de pollear
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

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      type: "bot",
      text: "Hola 👋 Soy tu asistente AI. Podés pedirme que arme listas, redacte mensajes o te ayude con la campaña.",
    },
  ]);

  function addMsg(text: string, type: ChatMessage["type"] = "bot") {
    setMessages((prev) => [
      ...prev,
      { id: `${Date.now()}-${Math.random()}`, text, type },
    ]);
  }

  // ── filtrado combinado, replicando la lógica del original ──
  const visibleContacts = useMemo(() => {
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
      return true;
    });
  }, [contacts, filt, modo24h]);

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

  function handleSelectTotal() {
    setFilt(new Set());
    setModo24h(false);
    const next = new Set(contacts.filter((c) => !c.bloqueado).map((c) => c.id));
    setSel(next);
    setStatus(next.size > 0 ? "need-tpl" : "idle");
    addMsg(
      `Seleccionaste ${next.size} contactos. ¿Elegís un template existente o querés que te arme uno especial para esta lista?`,
    );
  }

  function handleToggleFilter(key: KpiFilterKey) {
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
    setFreeText("");
    setFilt(new Set());
    setModo24h(false);
    setStatus("idle");
    addMsg(
      "Hola 👋 Seleccioná contactos usando los KPIs, o pedime que arme una lista. Puedo ayudarte en cada paso.",
    );
  }

  function handleSelectTpl(id: string | null) {
    setTplId(id);
    setIsCreatingNew(false);
    if (id && sel.size > 0) {
      setStatus("ready");
      addMsg(
        `✅ Todo listo para enviar. ${sel.size} contactos · ${templates.find((t) => t.id === id)?.nombre ?? "template"}. Cuando quieras presioná Enviar campaña.`,
      );
    } else if (sel.size > 0) {
      setStatus("need-tpl");
    } else {
      setStatus("idle");
    }
  }

  function handleStartNewTpl() {
    setIsCreatingNew(true);
    setTplId(null);
    setNewTplContent("");
    setNewTplName("");
    setStatus("editing-tpl");
    addMsg(
      `Avisame si necesitás ayuda para escribir el template. Puedo sugerirte un texto pensado para tus ${sel.size} contactos.`,
    );
  }

  function handleCancelNewTpl() {
    setIsCreatingNew(false);
    setNewTplContent("");
    setNewTplName("");
    setStatus(sel.size > 0 ? "need-tpl" : "idle");
  }

  function handleSendToMeta() {
    setStatus("approving");
    addMsg(
      "Template enviado a Meta para revisión. Te aviso cuando esté aprobado — puede tardar unos minutos.",
    );
    // Simulación: en producción esto llama al webhook de n8n desde el servidor
    setTimeout(() => {
      setStatus("ready");
      setIsCreatingNew(false);
      addMsg(
        "✅ Template aprobado por Meta. Ya podés enviar la campaña. Presioná Enviar campaña.",
      );
    }, 3000);
  }

  function handleEnviar() {
    if (status !== "ready") return;
    const cost = modo24h ? "Gratis" : `USD ${(sel.size * COST_PER_MSG).toFixed(2)}`;
    addMsg(`✅ Campaña enviada. ${sel.size} contactos · ${cost}.`);
    handleClearSel();
  }

  function handleChatSend(text: string) {
    addMsg(text, "user");
    setTimeout(() => {
      addMsg(
        "Podés pedirme que arme una lista, te sugiera un template, o te diga el costo estimado del envío. ¿Qué necesitás?",
      );
    }, 500);
  }

  const costEstimate = modo24h
    ? "Gratis"
    : tplId || isCreatingNew
      ? `USD ${(sel.size * COST_PER_MSG).toFixed(2)}`
      : "—";

  async function handleLogout() {
    await onLogout();
    router.refresh();
  }

  const planLabel = PLAN_LABELS[user.plan] || user.plan;

  return (
    <div className="flex h-full bg-ys-bg">
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
        onClose={() => setProfileOpen(false)}
        onLogout={handleLogout}
      />

      {activeSection === "dashboard" && (
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden pt-[58px] md:pt-0">
          <Dashboard userName={user.contactoNombre} />
        </div>
      )}

      {/* ── Placeholder "próximamente" para secciones aún sin construir en este bloque ── */}
      {(activeSection === "grupos" ||
        activeSection === "templates" ||
        activeSection === "campanas" ||
        activeSection === "ia") && (
        <div className="flex-1 min-w-0 flex items-center justify-center pt-[58px] md:pt-0">
          <div className="flex flex-col items-center gap-3">
            <div className="w-[52px] h-[52px] rounded-2xl bg-ys-el2 flex items-center justify-center">
              <svg width="22" height="22" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="5.5" stroke="#9aa19c" strokeWidth="1.5" />
                <path d="M8 5v3.2l2.2 1.3" stroke="#9aa19c" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div className="text-[19px] font-extrabold text-ys-text tracking-[-0.02em] capitalize">
              {activeSection}
            </div>
            <div className="text-sm text-ys-muted font-medium">
              Esta sección todavía está en construcción.
            </div>
          </div>
        </div>
      )}

      {activeSection === "contactos" && (
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden pt-[58px] md:pt-0">
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
      <div className="hidden md:grid md:grid-cols-[2fr_1fr] flex-1 overflow-hidden">
        <ContactsTable
          contacts={visibleContacts}
          selected={sel}
          onToggleRow={handleToggleRow}
          onToggleAll={handleToggleAll}
          onOpenDetail={setDetailContact}
          modo24h={modo24h}
        />
        <CampaignPanel
          templates={templates}
          selectedTplId={tplId}
          onSelectTpl={handleSelectTpl}
          isCreatingNew={isCreatingNew}
          onStartNewTpl={handleStartNewTpl}
          onCancelNewTpl={handleCancelNewTpl}
          newTplContent={newTplContent}
          onNewTplContentChange={setNewTplContent}
          newTplName={newTplName}
          onNewTplNameChange={setNewTplName}
          onSendToMeta={handleSendToMeta}
          selectedCount={sel.size}
          costEstimate={costEstimate}
          status={status}
          onEnviar={handleEnviar}
          modo24h={modo24h}
          freeTextValue={freeText}
          onFreeTextChange={setFreeText}
        />
      </div>

      {/* ── Selector de vista mobile (reemplaza al bottom-nav; la navegación entre
           SECCIONES ahora vive en el drawer superior) ── */}
      <div className="flex md:hidden items-center gap-1 px-4 py-2 border-b border-ys-border-softest overflow-x-auto">
        {(
          [
            { key: "inicio", label: "Inicio" },
            { key: "contactos", label: "Contactos" },
            { key: "campana", label: "Campaña" },
            { key: "chat", label: "AI chat" },
          ] as const
        ).map((t) => (
          <button
            key={t.key}
            onClick={() => setMobileTab(t.key)}
            className={`relative flex-none rounded-lg px-3 py-1.5 text-[12.5px] font-semibold cursor-pointer transition-colors ${
              mobileTab === t.key
                ? "bg-ys-green-bg text-ys-green-text"
                : "text-ys-muted"
            }`}
          >
            {t.label}
            {t.key === "contactos" && sel.size > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[15px] h-[15px] px-[3px] rounded-full bg-ys-green text-white text-[9px] font-semibold flex items-center justify-center leading-none">
                {sel.size}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Contenido mobile: un tab visible a la vez, misma lógica y handlers ── */}
      <div className="flex md:hidden flex-col flex-1 overflow-hidden min-h-0">
        {mobileTab === "inicio" && (
          <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-4">
            <div>
              <div className="text-[9px] font-semibold text-ys-dim uppercase tracking-[0.8px] mb-2">
                Selección actual
              </div>
              <div className="rounded-lg border border-ys-border bg-ys-card px-4 py-3 flex items-center justify-between">
                <span className="text-sm">
                  <strong className="text-ys-text">{sel.size}</strong>{" "}
                  <span className="text-ys-muted">contactos seleccionados</span>
                </span>
                {sel.size > 0 && (
                  <button
                    onClick={() => setMobileTab("campana")}
                    className="rounded-md bg-ys-red text-white px-3 py-1.5 text-xs font-semibold cursor-pointer"
                  >
                    Armar campaña
                  </button>
                )}
              </div>
            </div>
            <div>
              <div className="text-[9px] font-semibold text-ys-dim uppercase tracking-[0.8px] mb-2">
                Listas guardadas
              </div>
              <ListActionsBar
                selectedCount={sel.size}
                onClearSel={handleClearSel}
                lists={lists}
                onLoadList={(id) => {
                  const list = lists.find((l) => l.id === id);
                  if (!list) return;
                  setSel(new Set(list.contactosIds));
                  setStatus("need-tpl");
                  addMsg(
                    `Lista "${list.nombre}" cargada con ${list.contactosIds.length} contactos.`,
                  );
                }}
                onSaveList={() => setSaveModal("lista")}
                onConfirmList={async () => {
                  if (sel.size === 0) return;
                  const nombreAuto = `Lista ${new Date().toLocaleDateString("es-AR")} (${sel.size} contactos)`;
                  const result = await saveListAction(nombreAuto, Array.from(sel));
                  if (result.error) {
                    addMsg(`⚠️ No se pudo guardar la lista: ${result.error}`, "error");
                  } else {
                    addMsg(`Lista guardada con ${sel.size} contactos. ✓`);
                    router.refresh();
                  }
                }}
              />
            </div>
          </div>
        )}

        {mobileTab === "contactos" && (
          <div className="flex-1 flex flex-col overflow-hidden min-h-0 relative">
            <ContactsTable
              contacts={visibleContacts}
              selected={sel}
              onToggleRow={handleToggleRow}
              onToggleAll={handleToggleAll}
              onOpenDetail={setDetailContact}
              modo24h={modo24h}
            />
            <div className="absolute right-4 bottom-4 flex flex-col gap-2 items-end">
              <button
                onClick={() => setSyncModalOpen(true)}
                title="Analizar conversaciones con IA"
                className="min-w-[56px] px-2.5 py-2 rounded-2xl bg-ys-el border border-ys-border2 text-ys-text flex flex-col items-center justify-center gap-0.5 shadow-[0_4px_14px_rgba(0,0,0,.35)] cursor-pointer"
              >
                <span className="text-[16px] leading-none">🔎</span>
                <span className="text-[9px] font-semibold leading-none">
                  Analizar
                </span>
              </button>
              <button
                onClick={() => setQrOpen(true)}
                title="Importar contactos de WhatsApp"
                className="min-w-[56px] px-2.5 py-2 rounded-2xl bg-ys-red border border-ys-red text-white flex flex-col items-center justify-center gap-0.5 shadow-[0_4px_14px_rgba(255,61,61,.35)] cursor-pointer"
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="white"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="5" y="2" width="14" height="20" rx="2" />
                  <circle cx="12" cy="17" r="1" fill="white" />
                </svg>
                <span className="text-[9px] font-semibold leading-none">
                  Importar
                </span>
              </button>
            </div>
          </div>
        )}

        {mobileTab === "campana" && (
          <div className="flex-1 flex flex-col overflow-hidden min-h-0">
            <CampaignPanel
              templates={templates}
              selectedTplId={tplId}
              onSelectTpl={handleSelectTpl}
              isCreatingNew={isCreatingNew}
              onStartNewTpl={handleStartNewTpl}
              onCancelNewTpl={handleCancelNewTpl}
              newTplContent={newTplContent}
              onNewTplContentChange={setNewTplContent}
              newTplName={newTplName}
              onNewTplNameChange={setNewTplName}
              onSendToMeta={handleSendToMeta}
              selectedCount={sel.size}
              costEstimate={costEstimate}
              status={status}
              onEnviar={handleEnviar}
              modo24h={modo24h}
              freeTextValue={freeText}
              onFreeTextChange={setFreeText}
              showOnMobile
            />
            <div className="px-[18px] py-2.5 border-t border-ys-border">
              <CampaignActionsBar
                campaigns={campaigns}
                onLoadCampaign={(id) => {
                  const camp = campaigns.find((c) => c.id === id);
                  if (!camp) return;
                  addMsg(`Campaña "${camp.nombre}" cargada.`);
                }}
                onSaveCampaign={() => setSaveModal("campaña")}
              />
            </div>
          </div>
        )}

        {mobileTab === "chat" && (
          <AiChatBar
            messages={messages}
            onSend={handleChatSend}
            modo24h={modo24h}
            fullHeight
          />
        )}
      </div>

      <Footer
        selectedCount={sel.size}
        onClearSel={handleClearSel}
        lists={lists}
        onLoadList={(id) => {
          const list = lists.find((l) => l.id === id);
          if (!list) return;
          setSel(new Set(list.contactosIds));
          setStatus("need-tpl");
          addMsg(`Lista "${list.nombre}" cargada con ${list.contactosIds.length} contactos.`);
        }}
        onSaveList={() => setSaveModal("lista")}
        onConfirmList={async () => {
          if (sel.size === 0) return;
          const nombreAuto = `Lista ${new Date().toLocaleDateString("es-AR")} (${sel.size} contactos)`;
          const result = await saveListAction(nombreAuto, Array.from(sel));
          if (result.error) {
            addMsg(`⚠️ No se pudo guardar la lista: ${result.error}`, "error");
          } else {
            addMsg(`Lista guardada con ${sel.size} contactos. ✓`);
            router.refresh();
          }
        }}
        campaigns={campaigns}
        onLoadCampaign={(id) => {
          const camp = campaigns.find((c) => c.id === id);
          if (!camp) return;
          addMsg(`Campaña "${camp.nombre}" cargada.`);
        }}
        onSaveCampaign={() => setSaveModal("campaña")}
      />

      <div className="hidden md:block">
        <AiChatBar messages={messages} onSend={handleChatSend} modo24h={modo24h} />
      </div>
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

      <SaveModal
        open={saveModal !== null}
        context={saveModal}
        selectedCount={sel.size}
        onClose={() => setSaveModal(null)}
        onSave={async (name) => {
          if (saveModal === "lista") {
            if (sel.size === 0) {
              addMsg("⚠️ Seleccioná contactos antes de guardar la lista.", "error");
              setSaveModal(null);
              return;
            }
            const result = await saveListAction(name, Array.from(sel));
            if (result.error) {
              addMsg(`⚠️ No se pudo guardar la lista: ${result.error}`, "error");
            } else {
              addMsg(`"${name}" guardada con ${sel.size} contactos ✓`);
              router.refresh();
            }
          } else if (saveModal === "campaña") {
            if (!tplId) {
              addMsg("⚠️ Elegí un template antes de guardar la campaña.", "error");
              setSaveModal(null);
              return;
            }
            const result = await saveCampaignAction(
              name,
              null,
              tplId,
              Array.from(sel),
            );
            if (result.error) {
              addMsg(`⚠️ No se pudo guardar la campaña: ${result.error}`, "error");
            } else {
              addMsg(`Campaña "${name}" guardada ✓`);
              router.refresh();
            }
          }
          setSaveModal(null);
        }}
      />
    </div>
  );
}
