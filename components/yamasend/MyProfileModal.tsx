"use client";

import { useEffect, useState } from "react";
import type { AppUser, EmpresaUser } from "@/lib/types";
import { useLang } from "./LangContext";
import CreditosSection from "./CreditosSection";
import {
  updateProfileAction,
  updateEmpresaPerfilAction,
  changePasswordAction,
  getDatosNegocioAction,
  actualizarDatosNegocioAction,
  type DatosNegocio,
} from "@/lib/actions/profile";

/**
 * Identidad mínima que necesita este modal, sea la sesión de un empleado
 * (AppUser), de una cuenta individual (también AppUser, con orgId null) o de
 * una empresa (EmpresaUser). Se arma acá y no se reusan los tipos completos
 * porque los dos difieren en varios campos que este modal no necesita
 * (permisos, tenantId, creditosPool...) — pedir solo lo que se usa hace
 * explícito qué de cada tipo entra en juego.
 */
interface Identidad {
  rol: "empresa" | "empleado";
  contactoNombre: string;
  contactoEmail: string;
  /** Empresa no tiene WhatsApp: la sección Perfil personal esconde el campo. */
  ventasTel: string | null;
  orgId: string | null;
  trialEnd: string | null;
}

function identidadDe(user: AppUser | EmpresaUser): Identidad {
  if ("miembroId" in user) {
    // EmpresaUser
    return {
      rol: "empresa",
      contactoNombre: user.contactoNombre,
      contactoEmail: user.contactoEmail,
      ventasTel: null,
      orgId: user.orgId,
      trialEnd: null,
    };
  }
  return {
    rol: "empleado",
    contactoNombre: user.contactoNombre,
    contactoEmail: user.contactoEmail,
    ventasTel: user.ventasTel,
    orgId: user.orgId,
    trialEnd: user.trialEnd,
  };
}

interface MyProfileModalProps {
  open: boolean;
  user: AppUser | EmpresaUser;
  onClose: () => void;
  onUserUpdate: (patch: Partial<AppUser>) => void;
}

type Section = "personal" | "security" | "agency" | "creditos";

function NavItem({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[13.5px] font-semibold text-left cursor-pointer transition-colors w-full ${
        active
          ? "bg-ys-green-bg text-ys-green-text"
          : "text-[#3f4844] hover:bg-ys-el2"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[12.5px] font-extrabold text-ys-text">{children}</div>
  );
}

function TextInput({
  value,
  onChange,
  placeholder,
  readOnly,
  type = "text",
}: {
  value: string;
  onChange?: (v: string) => void;
  placeholder?: string;
  readOnly?: boolean;
  type?: string;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <div
      className={`flex items-center gap-2.5 border rounded-[10px] px-[13px] py-[11px] transition-colors ${
        readOnly ? "bg-ys-el2" : ""
      }`}
      style={{ borderColor: focused ? "#12B76A" : "#e8ebe9" }}
    >
      <input
        type={type}
        value={value}
        readOnly={readOnly}
        onChange={(e) => onChange?.(e.target.value)}
        onFocus={() => !readOnly && setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={placeholder}
        autoComplete="off"
        className={`flex-1 min-w-0 border-none outline-none bg-transparent text-sm font-semibold text-ys-text ${
          readOnly ? "cursor-not-allowed text-ys-muted" : ""
        }`}
      />
    </div>
  );
}

function TextArea({
  value,
  onChange,
  placeholder,
  rows = 3,
  readOnly,
}: {
  value: string;
  onChange?: (v: string) => void;
  placeholder?: string;
  rows?: number;
  readOnly?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <div
      className={`flex items-center gap-2.5 border rounded-[10px] px-[13px] py-[11px] transition-colors ${
        readOnly ? "bg-ys-el2" : ""
      }`}
      style={{ borderColor: focused ? "#12B76A" : "#e8ebe9" }}
    >
      <textarea
        value={value}
        readOnly={readOnly}
        onChange={(e) => onChange?.(e.target.value)}
        onFocus={() => !readOnly && setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={placeholder}
        rows={rows}
        className={`flex-1 min-w-0 border-none outline-none bg-transparent text-sm font-semibold text-ys-text resize-none ${
          readOnly ? "cursor-not-allowed text-ys-muted" : ""
        }`}
      />
    </div>
  );
}

function PasswordInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [focused, setFocused] = useState(false);
  const [show, setShow] = useState(false);
  return (
    <div
      className="flex items-center gap-2.5 border rounded-[10px] px-[13px] py-[11px] transition-colors"
      style={{ borderColor: focused ? "#12B76A" : "#e8ebe9" }}
    >
      <input
        type={show ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={placeholder ?? "••••••••"}
        autoComplete="new-password"
        className="flex-1 min-w-0 border-none outline-none bg-transparent text-sm font-semibold text-ys-text"
      />
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        className="flex-none cursor-pointer flex items-center text-ys-dimmer"
      >
        {show ? (
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M3 3l10 10M6.4 6.5A1.8 1.8 0 0 0 8 9.8M1.8 8S4.2 4 8 4c1 0 1.9.3 2.7.7M13.6 9.8c.4-.6.6-1.1.6-1.1s-.8-1.3-2.1-2.3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M1.8 8s2.4-4 6.2-4 6.2 4 6.2 4-2.4 4-6.2 4S1.8 8 1.8 8Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
            <circle cx="8" cy="8" r="1.8" stroke="currentColor" strokeWidth="1.4" />
          </svg>
        )}
      </button>
    </div>
  );
}

const DATOS_NEGOCIO_VACIOS: DatosNegocio = {
  editable: true,
  nombreEmpresa: "",
  rubro: "",
  descripcionNegocio: "",
  publicoObjetivo: "",
  tonoComunicacion: "",
  zonaCobertura: "",
  diferenciales: "",
  reglasEvitar: "",
};

export default function MyProfileModal({
  open,
  user,
  onClose,
  onUserUpdate,
}: MyProfileModalProps) {
  const { t } = useLang();
  const identidad = identidadDe(user);
  const [section, setSection] = useState<Section>("personal");
  // Solo tiene efecto en mobile: controla si se muestra el menú de
  // secciones o el contenido de la sección elegida (pantallas separadas,
  // una a la vez). En desktop ambas conviven siempre lado a lado.
  const [mobileView, setMobileView] = useState<"menu" | "content">("menu");

  // Perfil personal
  const [nombre, setNombre] = useState(identidad.contactoNombre);
  const [tel, setTel] = useState(identidad.ventasTel ?? "");
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMsg, setProfileMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  // Datos de la empresa. Se piden por RPC al abrir el modal, no vienen en las
  // props: es la única sección cuya fuente cambia según el rol (organización
  // vs fila propia) y ese cálculo ya vive en yamas_send_mi_perfil_datos_negocio(),
  // así que no tiene sentido resolverlo de nuevo acá con datos que además
  // AppUser/EmpresaUser ya no cargan.
  const [datosNegocio, setDatosNegocio] = useState<DatosNegocio>(DATOS_NEGOCIO_VACIOS);
  // Arranca en true (no se setea dentro del efecto) siguiendo el mismo
  // patrón que ya usa AppShell para dashboardInsightLoading: la carga
  // siempre corre al abrir, así que el estado inicial ya la refleja.
  const [cargandoNegocio, setCargandoNegocio] = useState(true);
  const [savingAgency, setSavingAgency] = useState(false);
  const [agencyMsg, setAgencyMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    if (!open) return;
    let vivo = true;
    getDatosNegocioAction().then((res) => {
      if (!vivo) return;
      setDatosNegocio(res ?? DATOS_NEGOCIO_VACIOS);
      setCargandoNegocio(false);
    });
    return () => {
      vivo = false;
    };
  }, [open]);

  // Contraseña
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [savingPw, setSavingPw] = useState(false);
  const [pwMsg, setPwMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  // Resetear el estado local del form cuando cambia el usuario (ej. tras
  // guardar). Ajustado durante el render, no en un efecto, siguiendo el
  // patrón recomendado por React para "adjust state when a prop changes".
  const [prevUser, setPrevUser] = useState(user);
  if (user !== prevUser) {
    setPrevUser(user);
    const nueva = identidadDe(user);
    setNombre(nueva.contactoNombre);
    setTel(nueva.ventasTel ?? "");
  }

  function handleSelectSection(s: Section) {
    setSection(s);
    setMobileView("content");
  }

  function handleClose() {
    onClose();
    setTimeout(() => {
      setSection("personal");
      setMobileView("menu");
      setCurrentPw("");
      setNewPw("");
      setConfirmPw("");
      setPwMsg(null);
      setProfileMsg(null);
      setAgencyMsg(null);
    }, 200);
  }

  async function handleSaveProfile() {
    setSavingProfile(true);
    setProfileMsg(null);

    const res =
      identidad.rol === "empresa"
        ? await updateEmpresaPerfilAction(nombre)
        : await updateProfileAction({ contactoNombre: nombre, ventasTel: tel });

    setSavingProfile(false);
    if (res.error) {
      setProfileMsg({ type: "err", text: res.error });
      return;
    }
    setProfileMsg({ type: "ok", text: t("myprofile_saved") });
    // onUserUpdate solo tiene sentido para AppUser (EmpresaUser no fluye por
    // ese callback en EmpresaShell); no pasa nada si EmpresaShell lo ignora.
    onUserUpdate({ contactoNombre: nombre.trim(), ventasTel: tel.trim() });
  }

  async function handleSaveAgency() {
    if (!datosNegocio.editable) return;
    setSavingAgency(true);
    setAgencyMsg(null);
    const res = await actualizarDatosNegocioAction(
      datosNegocio,
      identidad.orgId !== null,
    );
    setSavingAgency(false);
    if (res.error) {
      setAgencyMsg({ type: "err", text: res.error });
    } else {
      setAgencyMsg({ type: "ok", text: t("myprofile_saved") });
    }
  }

  async function handleChangePassword() {
    setPwMsg(null);
    if (newPw.length < 8) {
      setPwMsg({ type: "err", text: t("myprofile_password_too_short") });
      return;
    }
    if (newPw !== confirmPw) {
      setPwMsg({ type: "err", text: t("myprofile_password_mismatch") });
      return;
    }
    setSavingPw(true);
    const res = await changePasswordAction({
      currentPassword: currentPw,
      newPassword: newPw,
    });
    setSavingPw(false);
    if (res.error) {
      setPwMsg({ type: "err", text: res.error });
    } else {
      setPwMsg({ type: "ok", text: t("myprofile_password_changed") });
      setCurrentPw("");
      setNewPw("");
      setConfirmPw("");
    }
  }

  if (!open) return null;

  // Setter genérico por campo, no un hook: escribe directo sobre el objeto
  // datosNegocio ya en estado. Evita ocho useState sueltos para ocho campos
  // que siempre viajan juntos al guardar.
  function setCampoNegocio<K extends keyof Omit<DatosNegocio, "editable">>(
    key: K,
  ) {
    return (v: string) => setDatosNegocio((d) => ({ ...d, [key]: v }));
  }


  return (
    <div
      onClick={handleClose}
      className="fixed inset-0 z-[9000] bg-[rgba(16,24,20,0.34)] flex items-center justify-center p-4"
      style={{ animation: "ys-fade .16s ease both" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[760px] h-[560px] max-h-[88dvh] bg-ys-card rounded-[18px] shadow-[var(--shadow-modal)] flex overflow-hidden"
        style={{ animation: "ys-modal .19s cubic-bezier(.4,0,.2,1) both" }}
      >
        {/* Sidebar interno */}
        <div
          className={`${mobileView === "menu" ? "flex" : "hidden"} md:flex w-full md:w-[220px] flex-none bg-ys-el2 border-r border-ys-border-soft p-4 flex-col gap-1`}
        >
          <div className="text-[15px] font-extrabold text-ys-text px-2 pb-3">
            {t("myprofile_title")}
          </div>

          <NavItem
            active={section === "personal"}
            onClick={() => handleSelectSection("personal")}
            label={t("myprofile_nav_personal")}
            icon={
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="5.5" r="2.6" stroke="currentColor" strokeWidth="1.5" />
                <path d="M3 13.5c0-2.4 2.2-3.8 5-3.8s5 1.4 5 3.8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            }
          />
          <NavItem
            active={section === "security"}
            onClick={() => handleSelectSection("security")}
            label={t("myprofile_nav_security")}
            icon={
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                <path d="M8 1.5 3 3.5v4c0 3.5 2.3 5.8 5 6.5 2.7-.7 5-3 5-6.5v-4L8 1.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
              </svg>
            }
          />
          <NavItem
            active={section === "agency"}
            onClick={() => handleSelectSection("agency")}
            label={t("myprofile_nav_agency")}
            icon={
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                <rect x="2.5" y="2.5" width="11" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
                <path d="M5.5 5.5h1.2M9.3 5.5h1.2M5.5 8h1.2M9.3 8h1.2M6.5 13.5V11h3v2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            }
          />
          {/* Créditos: solo tiene sentido para empleado/individual, que gastan
              créditos directamente. La empresa carga y reparte créditos desde
              su sección de Empleados, no acá. */}
          {identidad.rol !== "empresa" && (
            <NavItem
              active={section === "creditos"}
              onClick={() => handleSelectSection("creditos")}
              label={t("myprofile_nav_creditos")}
              icon={
                <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                  <circle cx="8" cy="8" r="5.8" stroke="currentColor" strokeWidth="1.5" />
                  <path d="M8 5.2v5.6M6.4 6.6h2.2a1.1 1.1 0 0 1 0 2.2H6.4h2.4a1.1 1.1 0 0 1 0 2.2H6.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              }
            />
          )}

          <div className="hidden md:block mt-auto pt-3 border-t border-ys-border-softest">
            <button
              onClick={handleClose}
              className="w-full text-[12.5px] font-bold text-ys-muted hover:text-ys-text transition-colors px-2 py-2 text-left cursor-pointer"
            >
              {t("logout_cancel")}
            </button>
          </div>
        </div>

        {/* Contenido */}
        <div
          className={`${mobileView === "content" ? "flex" : "hidden"} md:flex flex-1 min-w-0 overflow-y-auto p-5 md:p-7 flex-col gap-6 relative`}
        >
          <button
            onClick={() => setMobileView("menu")}
            className="flex md:hidden items-center gap-1.5 self-start text-[13px] font-bold text-ys-muted hover:text-ys-text transition-colors cursor-pointer -mt-1"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M10 3.5 5 8l5 4.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {t("myprofile_title")}
          </button>

          <button
            onClick={handleClose}
            className="absolute top-5 right-5 w-8 h-8 rounded-lg flex items-center justify-center text-ys-dimmer hover:bg-ys-el2 hover:text-ys-text transition-colors cursor-pointer text-xl leading-none"
          >
            ×
          </button>

          {section === "personal" && (
            <>
              <div className="flex flex-col gap-1">
                <div className="text-[19px] font-extrabold tracking-[-0.02em] text-ys-text">
                  {t("myprofile_personal_title")}
                </div>
                <div className="text-[13.5px] text-ys-muted font-medium">
                  {t("myprofile_personal_desc")}
                </div>
              </div>

              <div className="flex flex-col gap-4 max-w-[420px]">
                <div className="flex flex-col gap-[7px]">
                  <FieldLabel>{t("myprofile_field_name")}</FieldLabel>
                  <TextInput value={nombre} onChange={setNombre} />
                </div>

                <div className="flex flex-col gap-[7px]">
                  <FieldLabel>{t("myprofile_field_email")}</FieldLabel>
                  <TextInput value={identidad.contactoEmail} readOnly type="email" />
                  <div className="text-[12px] text-ys-dim font-medium">
                    {t("myprofile_field_email_readonly")}
                  </div>
                </div>

                {/* Una cuenta empresa no tiene WhatsApp propio: es una
                    consola de gestión, no envía mensajes. */}
                {identidad.rol !== "empresa" && (
                  <div className="flex flex-col gap-[7px]">
                    <FieldLabel>{t("myprofile_field_phone")}</FieldLabel>
                    <TextInput value={tel} onChange={setTel} />
                  </div>
                )}

                {profileMsg && (
                  <div
                    className={`text-[13px] font-medium rounded-lg px-3.5 py-2.5 border ${
                      profileMsg.type === "ok"
                        ? "bg-ys-green-bg text-ys-green-text border-ys-green-border"
                        : "bg-ys-red-bg text-ys-red-text border-ys-red-border"
                    }`}
                  >
                    {profileMsg.text}
                  </div>
                )}

                <button
                  onClick={handleSaveProfile}
                  disabled={savingProfile}
                  className="self-start text-[13.5px] font-bold text-white bg-ys-green rounded-[10px] px-[18px] py-2.5 cursor-pointer transition-all hover:bg-ys-green-hover hover:-translate-y-px disabled:opacity-60 disabled:cursor-default disabled:hover:translate-y-0"
                >
                  {savingProfile ? "..." : t("myprofile_save")}
                </button>
              </div>
            </>
          )}

          {section === "security" && (
            <>
              <div className="flex flex-col gap-1">
                <div className="text-[19px] font-extrabold tracking-[-0.02em] text-ys-text">
                  {t("myprofile_security_title")}
                </div>
                <div className="text-[13.5px] text-ys-muted font-medium">
                  {t("myprofile_security_desc")}
                </div>
              </div>

              <div className="flex flex-col gap-4 max-w-[420px] border-t border-ys-border-softest pt-5">
                <div className="flex flex-col gap-1">
                  <div className="text-[13.5px] font-bold text-ys-text">
                    {t("myprofile_password_title")}
                  </div>
                  <div className="text-[12px] text-ys-dim font-medium leading-[1.4]">
                    {t("myprofile_password_desc")}
                  </div>
                </div>

                <div className="flex flex-col gap-[7px]">
                  <FieldLabel>{t("myprofile_field_current_password")}</FieldLabel>
                  <PasswordInput value={currentPw} onChange={setCurrentPw} />
                </div>

                <div className="flex flex-col gap-[7px]">
                  <FieldLabel>{t("myprofile_field_new_password")}</FieldLabel>
                  <PasswordInput value={newPw} onChange={setNewPw} />
                </div>

                <div className="flex flex-col gap-[7px]">
                  <FieldLabel>{t("myprofile_field_confirm_password")}</FieldLabel>
                  <PasswordInput value={confirmPw} onChange={setConfirmPw} />
                </div>

                {pwMsg && (
                  <div
                    className={`text-[13px] font-medium rounded-lg px-3.5 py-2.5 border ${
                      pwMsg.type === "ok"
                        ? "bg-ys-green-bg text-ys-green-text border-ys-green-border"
                        : "bg-ys-red-bg text-ys-red-text border-ys-red-border"
                    }`}
                  >
                    {pwMsg.text}
                  </div>
                )}

                <button
                  onClick={handleChangePassword}
                  disabled={
                    savingPw || !currentPw || !newPw || !confirmPw
                  }
                  className="self-start text-[13.5px] font-bold text-white bg-ys-green rounded-[10px] px-[18px] py-2.5 cursor-pointer transition-all hover:bg-ys-green-hover hover:-translate-y-px disabled:opacity-60 disabled:cursor-default disabled:hover:translate-y-0"
                >
                  {savingPw ? "..." : t("myprofile_password_change")}
                </button>
              </div>
            </>
          )}

          {section === "agency" && (
            <>
              <div className="flex flex-col gap-1">
                <div className="text-[19px] font-extrabold tracking-[-0.02em] text-ys-text">
                  {t("myprofile_agency_title")}
                </div>
                <div className="text-[13.5px] text-ys-muted font-medium">
                  {t("myprofile_agency_desc")}
                </div>
              </div>

              {/* Aviso de solo lectura: solo se ve para un empleado con
                  organización. Ni la empresa ni un individual lo ven, porque
                  en esos dos casos SÍ pueden editar. */}
              {!datosNegocio.editable && (
                <div className="bg-ys-warn-bg border border-[#f0dcb4] rounded-xl px-3.5 py-3 flex items-center gap-2.5 max-w-[560px]">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="flex-none">
                    <path d="M4.2 7.2V5.4a3.8 3.8 0 0 1 7.6 0v1.8" stroke="#c07a12" strokeWidth="1.6" strokeLinecap="round" />
                    <rect x="3" y="7.2" width="10" height="6.3" rx="1.8" stroke="#c07a12" strokeWidth="1.6" />
                  </svg>
                  <span className="text-[12.5px] font-semibold text-ys-warn-text">
                    {t("myprofile_agency_readonly_notice")}
                  </span>
                </div>
              )}

              <div className={`flex flex-col gap-4 max-w-[560px] ${cargandoNegocio ? "opacity-50 pointer-events-none" : ""}`}>
                <div className="flex flex-col gap-[7px]">
                  <FieldLabel>{t("myprofile_field_agency_name")}</FieldLabel>
                  <TextInput
                    value={datosNegocio.nombreEmpresa}
                    onChange={setCampoNegocio("nombreEmpresa")}
                    readOnly={!datosNegocio.editable}
                  />
                </div>

                <div className="flex flex-col gap-[7px]">
                  <FieldLabel>{t("myprofile_field_agency_field")}</FieldLabel>
                  <TextInput
                    value={datosNegocio.rubro}
                    onChange={setCampoNegocio("rubro")}
                    readOnly={!datosNegocio.editable}
                  />
                </div>

                <div className="flex flex-col gap-[7px]">
                  <FieldLabel>{t("myprofile_field_descripcion_negocio")}</FieldLabel>
                  <TextArea
                    value={datosNegocio.descripcionNegocio}
                    onChange={setCampoNegocio("descripcionNegocio")}
                    placeholder={t("myprofile_field_descripcion_negocio_placeholder")}
                    rows={3}
                    readOnly={!datosNegocio.editable}
                  />
                </div>

                <div className="flex flex-col gap-[7px]">
                  <FieldLabel>{t("myprofile_field_publico_objetivo")}</FieldLabel>
                  <TextArea
                    value={datosNegocio.publicoObjetivo}
                    onChange={setCampoNegocio("publicoObjetivo")}
                    placeholder={t("myprofile_field_publico_objetivo_placeholder")}
                    rows={2}
                    readOnly={!datosNegocio.editable}
                  />
                </div>

                <div className="flex flex-col gap-[7px]">
                  <FieldLabel>{t("myprofile_field_tono_comunicacion")}</FieldLabel>
                  <TextArea
                    value={datosNegocio.tonoComunicacion}
                    onChange={setCampoNegocio("tonoComunicacion")}
                    placeholder={t("myprofile_field_tono_comunicacion_placeholder")}
                    rows={2}
                    readOnly={!datosNegocio.editable}
                  />
                </div>

                <div className="flex flex-col gap-[7px]">
                  <FieldLabel>{t("myprofile_field_zona_cobertura")}</FieldLabel>
                  <TextInput
                    value={datosNegocio.zonaCobertura}
                    onChange={setCampoNegocio("zonaCobertura")}
                    placeholder={t("myprofile_field_zona_cobertura_placeholder")}
                    readOnly={!datosNegocio.editable}
                  />
                </div>

                <div className="flex flex-col gap-[7px]">
                  <FieldLabel>{t("myprofile_field_diferenciales")}</FieldLabel>
                  <TextArea
                    value={datosNegocio.diferenciales}
                    onChange={setCampoNegocio("diferenciales")}
                    placeholder={t("myprofile_field_diferenciales_placeholder")}
                    rows={3}
                    readOnly={!datosNegocio.editable}
                  />
                </div>

                <div className="flex flex-col gap-[7px]">
                  <FieldLabel>{t("myprofile_field_reglas_evitar")}</FieldLabel>
                  <TextArea
                    value={datosNegocio.reglasEvitar}
                    onChange={setCampoNegocio("reglasEvitar")}
                    placeholder={t("myprofile_field_reglas_evitar_placeholder")}
                    rows={2}
                    readOnly={!datosNegocio.editable}
                  />
                </div>

                {agencyMsg && (
                  <div
                    className={`text-[13px] font-medium rounded-lg px-3.5 py-2.5 border ${
                      agencyMsg.type === "ok"
                        ? "bg-ys-green-bg text-ys-green-text border-ys-green-border"
                        : "bg-ys-red-bg text-ys-red-text border-ys-red-border"
                    }`}
                  >
                    {agencyMsg.text}
                  </div>
                )}

                {datosNegocio.editable && (
                  <button
                    onClick={handleSaveAgency}
                    disabled={savingAgency}
                    className="self-start text-[13.5px] font-bold text-white bg-ys-green rounded-[10px] px-[18px] py-2.5 cursor-pointer transition-all hover:bg-ys-green-hover hover:-translate-y-px disabled:opacity-60 disabled:cursor-default disabled:hover:translate-y-0"
                  >
                    {savingAgency ? "..." : t("myprofile_save")}
                  </button>
                )}
              </div>
            </>
          )}

          {section === "creditos" && identidad.rol !== "empresa" && (
            <>
              <div className="flex flex-col gap-1">
                <div className="text-[19px] font-extrabold tracking-[-0.02em] text-ys-text">
                  {t("myprofile_creditos_title")}
                </div>
                <div className="text-[13.5px] text-ys-muted font-medium">
                  {t("myprofile_creditos_desc")}
                </div>
              </div>

              <CreditosSection />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
