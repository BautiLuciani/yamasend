"use client";

import { useState } from "react";
import Image from "next/image";
import type { PlanKey } from "@/lib/types";

interface LoginScreenProps {
  onLogin: (email: string, password: string) => Promise<string | null>; // devuelve error o null
  onRegister: (data: {
    nombre: string;
    email: string;
    whatsapp: string;
    password: string;
    plan: PlanKey;
  }) => Promise<string | null>;
}

const PLANS: { key: PlanKey; nombre: string; precio: string; features: string[] }[] = [
  {
    key: "starter",
    nombre: "Starter",
    precio: "USD 100 /mes",
    features: ["500 msgs/día", "1 número WA", "AI calificación leads", "Panel Ycloud.com"],
  },
  {
    key: "pro",
    nombre: "Pro",
    precio: "USD 200 /mes",
    features: [
      "Ilimitado msgs/día",
      "3 números WA",
      "AI calificación leads",
      "Panel Ycloud.com",
      "Slack 24/7",
    ],
  },
  {
    key: "uso",
    nombre: "Uso",
    precio: "USD 0,15 /msg",
    features: ["Sin límite diario", "1 número WA", "AI calificación leads", "Panel Ycloud.com"],
  },
];

export default function LoginScreen({ onLogin, onRegister }: LoginScreenProps) {
  const [tab, setTab] = useState<"login" | "register">("login");
  const [regStep, setRegStep] = useState<1 | 2>(1);
  const [success, setSuccess] = useState<{ title: string; sub: string } | null>(
    null,
  );

  // login state
  const [liEmail, setLiEmail] = useState("");
  const [liPw, setLiPw] = useState("");
  const [liShowPw, setLiShowPw] = useState(false);
  const [liErr, setLiErr] = useState("");
  const [liLoading, setLiLoading] = useState(false);
  const [liFocused, setLiFocused] = useState<"email" | "pw" | null>(null);
  const [liRecordar, setLiRecordar] = useState(false);

  // register state
  const [regNombre, setRegNombre] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regWa, setRegWa] = useState("");
  const [regPw, setRegPw] = useState("");
  const [regShowPw, setRegShowPw] = useState(false);
  const [regPlan, setRegPlan] = useState<PlanKey>("starter");
  const [regErr, setRegErr] = useState("");
  const [regLoading, setRegLoading] = useState(false);

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(regEmail);
  const pwValid = regPw.length >= 8;
  const pwHasUpper = /[A-Z]/.test(regPw);
  const pwHasNumber = /[0-9]/.test(regPw);
  const paso1Valido =
    regNombre.trim().length > 0 &&
    emailValid &&
    regWa.trim().length > 0 &&
    pwValid;

  async function handleLogin() {
    setLiErr("");
    if (!liEmail) {
      setLiErr("Ingresá tu email.");
      return;
    }
    if (!liPw) {
      setLiErr("Ingresá tu contraseña.");
      return;
    }
    setLiLoading(true);
    const err = await onLogin(liEmail, liPw);
    setLiLoading(false);
    if (err) {
      setLiErr(err);
    } else {
      setSuccess({ title: `¡Bienvenido!`, sub: "Cargando tu panel..." });
    }
  }

  async function handleCrearCuenta() {
    setRegErr("");
    if (!regNombre || !regEmail || !regWa) {
      setRegErr("Nombre, email y número de WhatsApp son obligatorios.");
      return;
    }
    if (!emailValid) {
      setRegErr("Email inválido.");
      return;
    }
    if (!pwValid) {
      setRegErr("La contraseña debe tener al menos 8 caracteres.");
      return;
    }
    setRegLoading(true);
    const err = await onRegister({
      nombre: regNombre,
      email: regEmail,
      whatsapp: regWa,
      password: regPw,
      plan: regPlan,
    });
    setRegLoading(false);
    if (err) {
      setRegErr(err);
    } else {
      setSuccess({ title: "¡Cuenta creada!", sub: "Cargando panel..." });
    }
  }

  function handleContinuarPaso1() {
    setRegErr("");
    if (!regNombre || !regEmail || !regWa) {
      setRegErr("Nombre, email y número de WhatsApp son obligatorios.");
      return;
    }
    if (!emailValid) {
      setRegErr("Email inválido.");
      return;
    }
    if (!pwValid) {
      setRegErr("La contraseña debe tener al menos 8 caracteres.");
      return;
    }
    setRegStep(2);
  }

  return (
    <div className="relative min-h-screen bg-[#fbfcfb] overflow-x-hidden flex justify-center px-4 py-12">
      <div
        className="absolute -top-[90px] -left-[70px] w-[320px] h-[320px] rounded-full pointer-events-none"
        style={{ background: "#12B76A", opacity: 0.06, filter: "blur(60px)" }}
      />
      <div
        className="absolute -bottom-[110px] -right-[60px] w-[360px] h-[360px] rounded-full pointer-events-none"
        style={{ background: "#12B76A", opacity: 0.05, filter: "blur(70px)" }}
      />

      <div
        className="relative w-full flex flex-col gap-[26px]"
        style={{
          maxWidth: tab === "register" && regStep === 2 && !success ? "560px" : "440px",
          animation: "ys-fade-up .24s cubic-bezier(.4,0,.2,1) both",
        }}
      >
        {!success && (
          <div className="flex flex-col items-center flex-none">
            <Image
              src="/brand/logo-login.png"
              alt="YamaSend · Mensajería masiva por IA"
              width={220}
              height={147}
              className="w-full max-w-[220px] h-auto object-contain"
              priority
            />
          </div>
        )}

        {success ? (
          <div className="bg-white border border-ys-border rounded-[18px] p-7 sm:p-9 shadow-[var(--shadow-card)]">
            <div className="text-center py-4">
              <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-ys-green-bg flex items-center justify-center">
                <svg width="26" height="26" viewBox="0 0 16 16" fill="none">
                  <path d="m3 8.4 3.4 3L13 4.6" stroke="#12B76A" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div className="text-xl font-extrabold tracking-[-0.02em] text-ys-text mb-2">
                {success.title}
              </div>
              <div className="text-ys-muted text-sm font-medium">{success.sub}</div>
              <div className="mt-5 h-[3px] rounded-sm bg-ys-border-softest overflow-hidden">
                <div
                  className="h-full bg-ys-green transition-[width] duration-[2200ms] ease-linear"
                  style={{ width: "100%" }}
                />
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Tabs */}
            <div className="flex gap-[26px] justify-center border-b border-ys-border-softest">
              <button
                onClick={() => setTab("login")}
                className="relative pb-3 px-0.5 text-sm font-bold cursor-pointer transition-colors"
                style={{ color: tab === "login" ? "#16211b" : "#8a908c" }}
              >
                Iniciar sesión
                {tab === "login" && (
                  <div className="absolute left-0 right-0 -bottom-px h-0.5 rounded-sm bg-ys-green" />
                )}
              </button>
              <button
                onClick={() => setTab("register")}
                className="relative pb-3 px-0.5 text-sm font-bold cursor-pointer transition-colors"
                style={{ color: tab === "register" ? "#16211b" : "#8a908c" }}
              >
                Crear cuenta
                {tab === "register" && (
                  <div className="absolute left-0 right-0 -bottom-px h-0.5 rounded-sm bg-ys-green" />
                )}
              </button>
            </div>

            <div className="bg-white border border-ys-border rounded-[18px] p-7 sm:p-9 flex flex-col gap-5 shadow-[var(--shadow-card)]">
              {tab === "login" && (
                <div className="flex flex-col gap-5">
                  <div className="flex flex-col gap-[5px]">
                    <div className="text-[21px] font-extrabold tracking-[-0.02em] text-ys-text">
                      Bienvenido de nuevo
                    </div>
                    <p className="text-[13.5px] text-ys-muted font-medium">
                      Ingresá a tu cuenta para continuar.
                    </p>
                  </div>

                  {liErr && (
                    <div className="rounded-lg bg-ys-red-bg border border-ys-red-border text-ys-red-text px-3.5 py-2.5 text-[13px] font-medium">
                      {liErr}
                    </div>
                  )}

                  <div className="flex flex-col gap-[7px]">
                    <div className="text-[12.5px] font-extrabold text-ys-text">Email</div>
                    <div
                      className="flex items-center gap-2.5 border rounded-[10px] px-[13px] py-[11px] transition-colors"
                      style={{ borderColor: liFocused === "email" ? "#12B76A" : "#e8ebe9" }}
                    >
                      <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                        <rect x="2" y="3.5" width="12" height="9" rx="2" stroke="#9aa19c" strokeWidth="1.5" />
                        <path d="m2.6 4.6 5.4 4 5.4-4" stroke="#9aa19c" strokeWidth="1.5" strokeLinejoin="round" />
                      </svg>
                      <input
                        type="email"
                        value={liEmail}
                        onChange={(e) => setLiEmail(e.target.value)}
                        onFocus={() => setLiFocused("email")}
                        onBlur={() => setLiFocused(null)}
                        onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                        placeholder="tu@empresa.com"
                        autoComplete="off"
                        className="flex-1 min-w-0 border-none outline-none bg-transparent text-sm font-semibold text-ys-text"
                      />
                    </div>
                  </div>

                  <div className="flex flex-col gap-[7px]">
                    <div className="flex items-center gap-2.5">
                      <div className="text-[12.5px] font-extrabold text-ys-text">Contraseña</div>
                      <button
                        type="button"
                        disabled
                        title="Disponible próximamente"
                        className="ml-auto text-[12.5px] font-bold text-ys-green-text cursor-not-allowed opacity-70"
                      >
                        ¿Olvidaste tu contraseña?
                      </button>
                    </div>
                    <div
                      className="flex items-center gap-2.5 border rounded-[10px] px-[13px] py-[11px] transition-colors"
                      style={{ borderColor: liFocused === "pw" ? "#12B76A" : "#e8ebe9" }}
                    >
                      <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                        <rect x="3" y="7" width="10" height="6.5" rx="1.8" stroke="#9aa19c" strokeWidth="1.5" />
                        <path d="M5.5 7V5.2a2.5 2.5 0 0 1 5 0V7" stroke="#9aa19c" strokeWidth="1.5" />
                      </svg>
                      <input
                        type={liShowPw ? "text" : "password"}
                        value={liPw}
                        onChange={(e) => setLiPw(e.target.value)}
                        onFocus={() => setLiFocused("pw")}
                        onBlur={() => setLiFocused(null)}
                        onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                        placeholder="••••••••"
                        autoComplete="new-password"
                        className="flex-1 min-w-0 border-none outline-none bg-transparent text-sm font-semibold text-ys-text"
                      />
                      <button
                        type="button"
                        onClick={() => setLiShowPw((v) => !v)}
                        className="flex-none cursor-pointer flex items-center text-ys-dimmer"
                      >
                        {liShowPw ? (
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
                  </div>

                  <button
                    type="button"
                    onClick={() => setLiRecordar((v) => !v)}
                    className="flex items-center gap-[9px] cursor-pointer self-start"
                  >
                    <div
                      className="w-[17px] h-[17px] rounded-[5px] border-[1.5px] flex items-center justify-center transition-colors"
                      style={{
                        borderColor: liRecordar ? "#12B76A" : "#d8ded9",
                        background: liRecordar ? "#12B76A" : "transparent",
                      }}
                    >
                      {liRecordar && (
                        <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
                          <path d="m3 8.4 3.4 3L13 4.6" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </div>
                    <div className="text-[13px] text-ys-muted font-semibold">Recordarme</div>
                  </button>

                  {liLoading ? (
                    <div className="flex items-center justify-center gap-2.5 bg-ys-green-hover text-white text-sm font-bold py-[13px] rounded-[11px]">
                      <div className="w-[15px] h-[15px] rounded-full border-2 border-white/35 border-t-white animate-spin" />
                      Ingresando...
                    </div>
                  ) : (
                    <button
                      onClick={handleLogin}
                      className="flex items-center justify-center gap-2.5 bg-ys-green text-white text-sm font-bold py-[13px] rounded-[11px] cursor-pointer transition-all hover:bg-ys-green-hover hover:-translate-y-px shadow-[var(--shadow-cta)]"
                    >
                      Iniciar sesión
                    </button>
                  )}

                  <div className="flex justify-center gap-[7px] text-[13px] text-ys-muted font-semibold">
                    ¿No tenés una cuenta?
                    <button
                      onClick={() => setTab("register")}
                      className="text-ys-green-text font-bold cursor-pointer"
                    >
                      Creá una gratis
                    </button>
                  </div>
                </div>
              )}

              {tab === "register" && (
                <div className="flex flex-col gap-5">
                  <div className="flex items-center gap-2.5">
                    <StepBadge n={1} label="Cuenta" state={regStep === 1 ? "on" : "done"} />
                    <div className="flex-1 h-[1.5px] bg-ys-border-softest rounded-sm overflow-hidden">
                      <div
                        className="h-full bg-ys-green transition-[width] duration-200"
                        style={{ width: regStep > 1 ? "100%" : "0%" }}
                      />
                    </div>
                    <StepBadge n={2} label="Plan" state={regStep === 2 ? "on" : "pending"} />
                  </div>

                  {regStep === 1 && (
                    <div className="flex flex-col gap-5" style={{ animation: "ys-fade-up .2s cubic-bezier(.4,0,.2,1) both" }}>
                      <div className="flex flex-col gap-[5px]">
                        <div className="text-[21px] font-extrabold tracking-[-0.02em] text-ys-text">
                          Creá tu cuenta
                        </div>
                        <p className="text-[13.5px] text-ys-muted font-medium">
                          Empezá a usar YamaSend en pocos minutos.
                        </p>
                      </div>

                      {regErr && (
                        <div className="rounded-lg bg-ys-red-bg border border-ys-red-border text-ys-red-text px-3.5 py-2.5 text-[13px] font-medium">
                          {regErr}
                        </div>
                      )}

                      <div className="flex flex-col gap-[7px]">
                        <div className="text-[12.5px] font-extrabold text-ys-text">Nombre</div>
                        <div className="flex items-center gap-2.5 border border-ys-border rounded-[10px] px-[13px] py-[11px] transition-colors hover:border-ys-green-border focus-within:!border-ys-green">
                          <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                            <circle cx="8" cy="5.5" r="2.6" stroke="#9aa19c" strokeWidth="1.5" />
                            <path d="M3 13.5c0-2.4 2.2-3.8 5-3.8s5 1.4 5 3.8" stroke="#9aa19c" strokeWidth="1.5" strokeLinecap="round" />
                          </svg>
                          <input
                            value={regNombre}
                            onChange={(e) => setRegNombre(e.target.value)}
                            placeholder="Martina Ruiz"
                            className="flex-1 min-w-0 border-none outline-none bg-transparent text-sm font-semibold text-ys-text"
                          />
                        </div>
                      </div>

                      <div className="flex flex-col gap-[7px]">
                        <div className="text-[12.5px] font-extrabold text-ys-text">Email</div>
                        <div className="flex items-center gap-2.5 border border-ys-border rounded-[10px] px-[13px] py-[11px] transition-colors hover:border-ys-green-border focus-within:!border-ys-green">
                          <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                            <rect x="2" y="3.5" width="12" height="9" rx="2" stroke="#9aa19c" strokeWidth="1.5" />
                            <path d="m2.6 4.6 5.4 4 5.4-4" stroke="#9aa19c" strokeWidth="1.5" strokeLinejoin="round" />
                          </svg>
                          <input
                            type="email"
                            value={regEmail}
                            onChange={(e) => setRegEmail(e.target.value)}
                            placeholder="martina@empresa.com"
                            className="flex-1 min-w-0 border-none outline-none bg-transparent text-sm font-semibold text-ys-text"
                          />
                        </div>
                        {regEmail && (
                          <div
                            className={`text-[11px] font-semibold ${emailValid ? "text-ys-green-text" : "text-ys-red-text"}`}
                          >
                            {emailValid ? "✓ Email válido" : "Formato inválido"}
                          </div>
                        )}
                      </div>

                      <div className="flex flex-col gap-[7px]">
                        <div className="text-[12.5px] font-extrabold text-ys-text">
                          WhatsApp Business
                        </div>
                        <div className="flex items-center gap-2.5 border border-ys-border rounded-[10px] px-[13px] py-[11px] transition-colors hover:border-ys-green-border focus-within:!border-ys-green">
                          <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                            <path d="M14 7.5c0 3-2.7 5.2-6 5.2-.7 0-1.4-.1-2-.3L2.5 13.5l.8-2.5A5 5 0 0 1 2 7.5C2 4.5 4.7 2.3 8 2.3s6 2.2 6 5.2Z" stroke="#9aa19c" strokeWidth="1.5" strokeLinejoin="round" />
                          </svg>
                          <input
                            type="tel"
                            value={regWa}
                            onChange={(e) => setRegWa(e.target.value)}
                            placeholder="+54 9 11 1234-5678"
                            className="flex-1 min-w-0 border-none outline-none bg-transparent text-sm font-semibold text-ys-text"
                          />
                        </div>
                        <div className="text-[11px] text-ys-dim font-medium">
                          Tu número de Meta Business — ID de cuenta.
                        </div>
                      </div>

                      <div className="flex flex-col gap-[9px]">
                        <div className="text-[12.5px] font-extrabold text-ys-text">Contraseña</div>
                        <div className="flex items-center gap-2.5 border border-ys-border rounded-[10px] px-[13px] py-[11px] transition-colors hover:border-ys-green-border focus-within:!border-ys-green">
                          <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                            <rect x="3" y="7" width="10" height="6.5" rx="1.8" stroke="#9aa19c" strokeWidth="1.5" />
                            <path d="M5.5 7V5.2a2.5 2.5 0 0 1 5 0V7" stroke="#9aa19c" strokeWidth="1.5" />
                          </svg>
                          <input
                            type={regShowPw ? "text" : "password"}
                            value={regPw}
                            onChange={(e) => setRegPw(e.target.value)}
                            placeholder="Creá una contraseña"
                            className="flex-1 min-w-0 border-none outline-none bg-transparent text-sm font-semibold text-ys-text"
                          />
                          <button
                            type="button"
                            onClick={() => setRegShowPw((v) => !v)}
                            className="flex-none cursor-pointer flex items-center text-ys-dimmer"
                          >
                            {regShowPw ? (
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
                        <div className="flex flex-col gap-1.5">
                          <PasswordHint ok={pwValid} label="8 caracteres o más" />
                          <PasswordHint ok={pwHasUpper} label="Una mayúscula (recomendado)" />
                          <PasswordHint ok={pwHasNumber} label="Un número (recomendado)" />
                        </div>
                      </div>

                      <div className="text-xs text-ys-dim font-medium leading-relaxed">
                        Al crear tu cuenta aceptás los{" "}
                        <a href="#terminos" className="text-ys-green-text font-semibold">
                          Términos
                        </a>{" "}
                        y la{" "}
                        <a href="#privacidad" className="text-ys-green-text font-semibold">
                          Política de privacidad
                        </a>
                        .
                      </div>

                      <button
                        onClick={handleContinuarPaso1}
                        disabled={!paso1Valido}
                        className={`mt-1 flex items-center justify-center gap-2 text-sm font-bold py-[13px] rounded-[11px] transition-all ${
                          paso1Valido
                            ? "bg-ys-green text-white cursor-pointer hover:bg-ys-green-hover hover:-translate-y-px shadow-[var(--shadow-cta)]"
                            : "bg-ys-el2 text-ys-faint cursor-not-allowed"
                        }`}
                      >
                        Continuar →
                      </button>

                      <div className="flex justify-center gap-[7px] text-[13px] text-ys-muted font-semibold">
                        ¿Ya tenés cuenta?
                        <button
                          onClick={() => setTab("login")}
                          className="text-ys-green-text font-bold cursor-pointer"
                        >
                          Iniciá sesión
                        </button>
                      </div>
                    </div>
                  )}

                  {regStep === 2 && (
                    <div className="flex flex-col gap-[18px]" style={{ animation: "ys-fade-up .2s cubic-bezier(.4,0,.2,1) both" }}>
                      <div className="flex flex-col gap-[5px]">
                        <div className="text-[21px] font-extrabold tracking-[-0.02em] text-ys-text">
                          Elegí tu plan
                        </div>
                        <p className="text-[13.5px] text-ys-muted font-medium">
                          14 días gratis en cualquier plan. Podés cambiarlo cuando quieras.
                        </p>
                      </div>

                      {regErr && (
                        <div className="rounded-lg bg-ys-red-bg border border-ys-red-border text-ys-red-text px-3.5 py-2.5 text-[13px] font-medium">
                          {regErr}
                        </div>
                      )}

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-[11px]">
                        {PLANS.map((p) => {
                          const active = regPlan === p.key;
                          return (
                            <button
                              key={p.key}
                              onClick={() => setRegPlan(p.key)}
                              className={`text-left rounded-[14px] border-[1.5px] px-4 py-[14px] flex flex-col gap-2.5 cursor-pointer transition-all hover:-translate-y-px ${
                                active ? "border-ys-green bg-ys-green-bg" : "border-ys-border"
                              }`}
                            >
                              <div className="flex items-center gap-2.5">
                                <div
                                  className={`text-[15px] font-extrabold ${active ? "text-ys-green-text" : "text-ys-text"}`}
                                >
                                  {p.nombre}
                                </div>
                                {active && (
                                  <svg className="ml-auto" width="18" height="18" viewBox="0 0 16 16" fill="none">
                                    <circle cx="8" cy="8" r="7" fill="#12B76A" />
                                    <path d="m4.6 8.3 2.3 2.2L11.4 6" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                                  </svg>
                                )}
                              </div>
                              <div className="font-mono text-[15px] font-medium text-ys-text">
                                {p.precio}
                              </div>
                              <div className="text-[10.5px] text-ys-dim leading-loose">
                                {p.features.map((f) => (
                                  <span key={f} className="block">
                                    <span className="text-ys-green-text">✓ </span>
                                    {f}
                                  </span>
                                ))}
                              </div>
                            </button>
                          );
                        })}
                      </div>

                      <div className="text-[11px] text-ys-dim font-medium text-center">
                        * Costos de Meta no incluidos · 14 días gratis en cualquier plan
                      </div>

                      <div className="flex gap-2.5">
                        <button
                          onClick={() => setRegStep(1)}
                          className="flex-none px-[18px] rounded-[11px] border border-ys-border text-[13.5px] font-bold text-[#3f4844] cursor-pointer transition-colors hover:bg-[#f7f9f8]"
                        >
                          Atrás
                        </button>
                        {regLoading ? (
                          <div className="flex-1 flex items-center justify-center gap-2.5 bg-ys-green-hover text-white text-sm font-bold py-3 rounded-[11px]">
                            <div className="w-[15px] h-[15px] rounded-full border-2 border-white/35 border-t-white animate-spin" />
                            Creando tu cuenta...
                          </div>
                        ) : (
                          <button
                            onClick={handleCrearCuenta}
                            className="flex-1 flex items-center justify-center bg-ys-green text-white text-sm font-bold py-3 rounded-[11px] cursor-pointer transition-all hover:bg-ys-green-hover hover:-translate-y-px shadow-[var(--shadow-cta)]"
                          >
                            Crear cuenta gratis
                          </button>
                        )}
                      </div>

                      <div className="flex justify-center gap-[7px] text-[13px] text-ys-muted font-semibold">
                        ¿Ya tenés cuenta?
                        <button
                          onClick={() => setTab("login")}
                          className="text-ys-green-text font-bold cursor-pointer"
                        >
                          Iniciá sesión
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function StepBadge({
  n,
  label,
  state,
}: {
  n: number;
  label: string;
  state: "on" | "done" | "pending";
}) {
  const color = state === "pending" ? "#9aa19c" : "#16211b";
  const bg = state === "on" ? "#12B76A" : state === "done" ? "#ecf9f2" : "#f2f4f3";
  const tx = state === "on" ? "#fff" : state === "done" ? "#067647" : "#9aa19c";
  return (
    <div className="flex items-center gap-2" style={{ color }}>
      <div
        className="w-5 h-5 rounded-full flex items-center justify-center font-mono text-[10.5px]"
        style={{ background: bg, color: tx }}
      >
        {n}
      </div>
      <span className="text-xs font-extrabold">{label}</span>
    </div>
  );
}

function PasswordHint({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div
      className="flex items-center gap-2 text-xs font-semibold transition-colors"
      style={{ color: ok ? "#12B76A" : "#9aa19c" }}
    >
      <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
        <path d="m3 8.4 3.4 3L13 4.6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {label}
    </div>
  );
}
