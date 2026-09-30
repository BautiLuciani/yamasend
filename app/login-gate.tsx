"use client";

import LoginScreen from "@/components/yamasend/LoginScreen";
import { requestLoginLink, requestRegisterLink } from "@/lib/actions/auth";

export default function LoginGate({
  initialTab,
  inviteToken = null,
  esInvitacionEmpresa = false,
  organizacionInvita = null,
  initialError = null,
}: {
  initialTab?: "login" | "register";
  redirectTo?: string;
  inviteToken?: string | null;
  esInvitacionEmpresa?: boolean;
  organizacionInvita?: string | null;
  initialError?: string | null;
}) {
  async function handleLogin(email: string) {
    const { error } = await requestLoginLink(email);
    return error;
  }

  async function handleRegister(data: {
    nombre: string;
    email: string;
    tipoCuenta: "individual" | "empresa";
    nombreEmpresa?: string | null;
    inviteToken?: string | null;
  }) {
    const { error } = await requestRegisterLink(data);
    return { error };
  }

  return (
    <LoginScreen
      onLogin={handleLogin}
      onRegister={handleRegister}
      initialTab={initialTab}
      inviteToken={inviteToken}
      esInvitacionEmpresa={esInvitacionEmpresa}
      organizacionInvita={organizacionInvita}
      initialError={initialError}
      onTabChange={(next) => {
        window.history.replaceState(null, "", `/${next}`);
      }}
    />
  );
}
