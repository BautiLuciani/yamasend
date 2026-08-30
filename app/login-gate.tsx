"use client";

import { useRouter } from "next/navigation";
import LoginScreen from "@/components/yamasend/LoginScreen";
import { loginAction, registerAction } from "@/lib/actions/auth";
import type { PlanKey } from "@/lib/types";

export default function LoginGate({
  initialTab,
  redirectTo = "/panel",
  inviteToken = null,
  esInvitacionEmpresa = false,
  organizacionInvita = null,
}: {
  initialTab?: "login" | "register";
  redirectTo?: string;
  inviteToken?: string | null;
  esInvitacionEmpresa?: boolean;
  organizacionInvita?: string | null;
}) {
  const router = useRouter();

  async function handleLogin(email: string, password: string) {
    const { error } = await loginAction(email, password);
    if (error) return error;
    router.push(redirectTo);
    return null;
  }

  async function handleRegister(data: {
    nombre: string;
    email: string;
    whatsapp: string;
    password: string;
    plan: PlanKey;
    inviteToken?: string | null;
  }) {
    const { error } = await registerAction(data);
    if (error) return error;
    router.push(redirectTo);
    return null;
  }

  return (
    <LoginScreen
      onLogin={handleLogin}
      onRegister={handleRegister}
      initialTab={initialTab}
      inviteToken={inviteToken}
      esInvitacionEmpresa={esInvitacionEmpresa}
      organizacionInvita={organizacionInvita}
      onTabChange={(next) => {
        // Actualiza solo la URL visible, sin disparar navegación de Next
        // (que activaría el Suspense/loading.tsx de /login o /register
        // para un simple cambio de tab que es 100% estado local).
        window.history.replaceState(null, "", `/${next}`);
      }}
    />
  );
}
