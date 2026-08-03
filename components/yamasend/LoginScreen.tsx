"use client";

import { useState } from "react";
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

  return (
    <div className="fixed inset-0 bg-ys-bg overflow-y-auto overflow-x-hidden">
      <div
        className="absolute -top-[20%] -right-[10%] w-[60%] h-[70%] pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse, rgba(255,61,61,.18) 0%, transparent 65%)",
          filter: "blur(80px)",
        }}
      />
      <div className="min-h-full flex items-center justify-center py-8 px-4">
        <div
          className={`relative z-[2] rounded-[18px] border border-ys-border2 bg-ys-card p-6 sm:p-9 w-full shadow-[0_24px_80px_rgba(0,0,0,.5)] transition-[max-width] duration-200 ${
            tab === "register" && regStep === 1 && !success
              ? "max-w-[410px] sm:max-w-[560px]"
              : "max-w-[410px]"
          }`}
        >
          {success ? (
          <div className="text-center py-4 px-0">
            <div className="w-14 h-14 mx-auto mb-4.5 rounded-full bg-ys-green-bg border-[1.5px] border-[rgba(34,197,94,.35)] flex items-center justify-center text-2xl">
              ✓
            </div>
            <div className="font-display text-xl font-bold mb-2">
              {success.title}
            </div>
            <div className="text-ys-muted text-sm">{success.sub}</div>
            <div className="mt-5 h-[3px] rounded-sm bg-ys-el overflow-hidden">
              <div
                className="h-full bg-ys-green transition-[width] duration-[2200ms] ease-linear"
                style={{ width: "100%" }}
              />
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2.5 mb-[22px]">
              <div className="w-2.5 h-2.5 rounded-full bg-ys-red shadow-[0_0_8px_var(--ys-red)]" />
              <span className="font-display text-xl font-bold">Yamas.AI</span>
              <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-ys-green-bg border border-[rgba(34,197,94,.2)] text-ys-green px-2.5 py-[3px] text-[10px] font-semibold">
                WhatsApp Marketing
              </span>
            </div>

            <div className="flex bg-ys-el border border-ys-border rounded-[10px] p-[3px] gap-[3px] mb-6">
              <button
                onClick={() => setTab("login")}
                className={`flex-1 py-2 font-display text-[13px] font-semibold text-center rounded-lg transition-colors cursor-pointer ${
                  tab === "login"
                    ? "bg-ys-card text-ys-text border border-ys-border shadow-[0_1px_6px_rgba(0,0,0,.4)]"
                    : "text-ys-muted"
                }`}
              >
                Iniciar sesión
              </button>
              <button
                onClick={() => setTab("register")}
                className={`flex-1 py-2 font-display text-[13px] font-semibold text-center rounded-lg transition-colors cursor-pointer ${
                  tab === "register"
                    ? "bg-ys-card text-ys-text border border-ys-border shadow-[0_1px_6px_rgba(0,0,0,.4)]"
                    : "text-ys-muted"
                }`}
              >
                Crear cuenta
              </button>
            </div>

            {tab === "login" && (
              <div>
                <div className="font-display text-[21px] font-bold mb-1.5">
                  Bienvenido de nuevo
                </div>
                <p className="text-ys-muted text-sm mb-[22px]">
                  Ingresá con tu cuenta para acceder al panel.
                </p>

                {liErr && (
                  <div className="rounded-lg bg-ys-red-bg border border-[rgba(255,61,61,.25)] text-[#ff7070] px-3.5 py-2.5 text-[13px] mb-4">
                    {liErr}
                  </div>
                )}

                <div className="mb-4">
                  <label className="block text-xs text-ys-muted mb-1.5 font-medium">
                    Email
                  </label>
                  <input
                    type="email"
                    value={liEmail}
                    onChange={(e) => setLiEmail(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                    placeholder="tu@empresa.com"
                    autoComplete="off"
                    className="w-full rounded-lg border border-ys-border bg-ys-el px-3.5 py-[11px] text-sm outline-none focus:border-[rgba(255,61,61,.5)] transition-colors"
                  />
                </div>
                <div className="mb-4">
                  <label className="block text-xs text-ys-muted mb-1.5 font-medium">
                    Contraseña
                  </label>
                  <div className="relative">
                    <input
                      type={liShowPw ? "text" : "password"}
                      value={liPw}
                      onChange={(e) => setLiPw(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                      placeholder="••••••••"
                      autoComplete="new-password"
                      className="w-full rounded-lg border border-ys-border bg-ys-el px-3.5 py-[11px] pr-11 text-sm outline-none focus:border-[rgba(255,61,61,.5)] transition-colors"
                    />
                    <button
                      type="button"
                      onClick={() => setLiShowPw((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-ys-muted hover:text-ys-text p-1 cursor-pointer"
                    >
                      {liShowPw ? "🙈" : "👁️"}
                    </button>
                  </div>
                </div>

                <button
                  onClick={handleLogin}
                  disabled={liLoading}
                  className="w-full mt-1 rounded-lg bg-ys-red text-white py-[13px] font-display text-[15px] font-semibold transition-all hover:shadow-[0_8px_28px_rgba(255,61,61,.3)] hover:-translate-y-px disabled:opacity-60 disabled:cursor-not-allowed disabled:transform-none disabled:shadow-none cursor-pointer"
                >
                  {liLoading ? "Verificando..." : "Iniciar sesión"}
                </button>

                <div className="mt-3.5 text-center text-xs text-ys-dim">
                  ¿No tenés cuenta?{" "}
                  <button
                    onClick={() => setTab("register")}
                    className="text-ys-muted border-b border-ys-border hover:text-ys-text cursor-pointer"
                  >
                    Creá una gratis
                  </button>
                </div>
              </div>
            )}

            {tab === "register" && (
              <div>
                <div className="flex items-center gap-1.5 mb-1.5">
                  <StepCircle n={1} state={regStep === 1 ? "on" : "done"} />
                  <div
                    className={`flex-1 h-px ${regStep > 1 ? "bg-[rgba(34,197,94,.3)]" : "bg-ys-border"}`}
                  />
                  <StepCircle n={2} state={regStep === 2 ? "on" : "pending"} />
                </div>
                <div className="flex justify-between mb-[18px]">
                  <span className="text-[10px] text-ys-dim font-medium">
                    Cuenta
                  </span>
                  <span className="text-[10px] text-ys-dim font-medium">
                    Plan
                  </span>
                </div>

                {regStep === 1 && (
                  <div>
                    <div className="font-display text-[21px] font-bold mb-1.5">
                      Creá tu cuenta
                    </div>
                    <p className="text-ys-muted text-sm mb-5">
                      Gratis por 14 días, sin tarjeta de crédito.
                    </p>

                    {regErr && (
                      <div className="rounded-lg bg-ys-red-bg border border-[rgba(255,61,61,.25)] text-[#ff7070] px-3.5 py-2.5 text-[13px] mb-3.5">
                        {regErr}
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-4 mb-4">
                      <div>
                        <label className="block text-xs text-ys-muted mb-1.5 font-medium">
                          Nombre
                        </label>
                        <input
                          value={regNombre}
                          onChange={(e) => setRegNombre(e.target.value)}
                          placeholder="Juan"
                          className="w-full rounded-lg border border-ys-border bg-ys-el px-3.5 py-[11px] text-sm outline-none focus:border-[rgba(255,61,61,.5)] transition-colors"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-ys-muted mb-1.5 font-medium">
                          Email
                        </label>
                        <input
                          type="email"
                          value={regEmail}
                          onChange={(e) => setRegEmail(e.target.value)}
                          placeholder="juan@empresa.com"
                          className="w-full rounded-lg border border-ys-border bg-ys-el px-3.5 py-[11px] text-sm outline-none focus:border-[rgba(255,61,61,.5)] transition-colors"
                        />
                        {regEmail && (
                          <div
                            className={`text-[11px] mt-1 ${emailValid ? "text-ys-green" : "text-[#ff7070]"}`}
                          >
                            {emailValid ? "✓ Email válido" : "Formato inválido"}
                          </div>
                        )}
                      </div>
                      <div>
                        <label className="block text-xs text-ys-muted mb-1.5 font-medium">
                          WhatsApp Business
                        </label>
                        <input
                          type="tel"
                          value={regWa}
                          onChange={(e) => setRegWa(e.target.value)}
                          placeholder="+54 9 11 1234-5678"
                          className="w-full rounded-lg border border-ys-border bg-ys-el px-3.5 py-[11px] text-sm outline-none focus:border-[rgba(255,61,61,.5)] transition-colors"
                        />
                        <div className="text-[11px] text-ys-dim mt-1">
                          Tu número de Meta Business — ID de cuenta.
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs text-ys-muted mb-1.5 font-medium">
                          Contraseña
                        </label>
                        <div className="relative">
                          <input
                            type={regShowPw ? "text" : "password"}
                            value={regPw}
                            onChange={(e) => setRegPw(e.target.value)}
                            placeholder="Mín. 8 caracteres"
                            className="w-full rounded-lg border border-ys-border bg-ys-el px-3.5 py-[11px] pr-11 text-sm outline-none focus:border-[rgba(255,61,61,.5)] transition-colors"
                          />
                          <button
                            type="button"
                            onClick={() => setRegShowPw((v) => !v)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-ys-muted hover:text-ys-text p-1 cursor-pointer"
                          >
                            {regShowPw ? "🙈" : "👁️"}
                          </button>
                        </div>
                        {regPw && (
                          <div
                            className={`text-[11px] mt-1 ${pwValid ? "text-ys-green" : "text-[#ff7070]"}`}
                          >
                            {pwValid ? "✓ Contraseña segura" : "Mínimo 8 caracteres"}
                          </div>
                        )}
                      </div>
                    </div>

                    <button
                      onClick={() => {
                        setRegErr("");
                        if (!regNombre || !regEmail || !regWa) {
                          setRegErr(
                            "Nombre, email y número de WhatsApp son obligatorios.",
                          );
                          return;
                        }
                        if (!emailValid) {
                          setRegErr("Email inválido.");
                          return;
                        }
                        if (!pwValid) {
                          setRegErr(
                            "La contraseña debe tener al menos 8 caracteres.",
                          );
                          return;
                        }
                        setRegStep(2);
                      }}
                      className="w-full mt-1 rounded-lg bg-ys-red text-white py-[13px] font-display text-[15px] font-semibold hover:shadow-[0_8px_28px_rgba(255,61,61,.3)] hover:-translate-y-px transition-all cursor-pointer"
                    >
                      Continuar →
                    </button>
                  </div>
                )}

                {regStep === 2 && (
                  <div>
                    <div className="font-display text-[21px] font-bold mb-1.5">
                      Elegí tu plan
                    </div>
                    <p className="text-ys-muted text-sm mb-[18px]">
                      14 días gratis en cualquier plan.
                    </p>

                    {regErr && (
                      <div className="rounded-lg bg-ys-red-bg border border-[rgba(255,61,61,.25)] text-[#ff7070] px-3.5 py-2.5 text-[13px] mb-3.5">
                        {regErr}
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-3">
                      {PLANS.map((p) => (
                        <button
                          key={p.key}
                          onClick={() => setRegPlan(p.key)}
                          className={`text-left rounded-[10px] border-[1.5px] px-3 py-2.5 select-none transition-colors cursor-pointer ${
                            regPlan === p.key
                              ? "border-ys-red bg-ys-red-bg"
                              : "border-ys-border hover:border-ys-border2"
                          }`}
                        >
                          <div
                            className={`font-display text-xs font-bold mb-0.5 ${regPlan === p.key ? "text-ys-red" : ""}`}
                          >
                            {p.nombre}
                          </div>
                          <div className="font-display text-[13px] font-bold my-1">
                            {p.precio}
                          </div>
                          <div className="mt-2 text-[10px] text-ys-dim leading-loose">
                            {p.features.map((f) => (
                              <span key={f} className="block">
                                <span className="text-ys-green">✓ </span>
                                {f}
                              </span>
                            ))}
                          </div>
                        </button>
                      ))}
                    </div>

                    <div className="text-[11px] text-ys-dim mb-4 text-center">
                      * Costos de Meta no incluidos · 14 días gratis en
                      cualquier plan
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={() => setRegStep(1)}
                        className="flex-none w-[76px] rounded-lg bg-ys-el border border-ys-border text-ys-muted text-[13px] py-[13px] font-display cursor-pointer"
                      >
                        ← Volver
                      </button>
                      <button
                        onClick={handleCrearCuenta}
                        disabled={regLoading}
                        className="flex-1 rounded-lg bg-ys-red text-white py-[13px] font-display text-[15px] font-semibold hover:shadow-[0_8px_28px_rgba(255,61,61,.3)] hover:-translate-y-px transition-all disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
                      >
                        {regLoading ? "Creando cuenta..." : "Crear cuenta gratis"}
                      </button>
                    </div>
                  </div>
                )}

                <div className="mt-3.5 text-center text-xs text-ys-dim leading-relaxed">
                  ¿Ya tenés cuenta?{" "}
                  <button
                    onClick={() => setTab("login")}
                    className="text-ys-muted border-b border-ys-border hover:text-ys-text cursor-pointer"
                  >
                    Iniciá sesión
                  </button>
                  <br />
                  <span className="text-[10px]">
                    Al registrarte aceptás los{" "}
                    <a href="#" className="text-ys-muted border-b border-ys-border">
                      Términos
                    </a>{" "}
                    y la{" "}
                    <a href="#" className="text-ys-muted border-b border-ys-border">
                      Política de privacidad
                    </a>
                    .
                  </span>
                </div>
              </div>
            )}
          </>
        )}
        </div>
      </div>
    </div>
  );
}

function StepCircle({
  n,
  state,
}: {
  n: number;
  state: "on" | "done" | "pending";
}) {
  return (
    <div
      className={`w-[22px] h-[22px] rounded-full flex items-center justify-center text-[10px] font-bold font-display flex-shrink-0 border ${
        state === "on"
          ? "bg-ys-red border-ys-red text-white"
          : state === "done"
            ? "bg-[rgba(34,197,94,.15)] border-[rgba(34,197,94,.4)] text-ys-green"
            : "bg-ys-el border-ys-border text-ys-dim"
      }`}
    >
      {state === "done" ? "✓" : n}
    </div>
  );
}
