"use client";

import { useRouter } from "next/navigation";
import LoginScreen from "@/components/yamasend/LoginScreen";
import { loginAction, registerAction } from "@/lib/actions/auth";
import type { PlanKey } from "@/lib/types";

export default function LoginGate() {
  const router = useRouter();

  async function handleLogin(email: string, password: string) {
    const { error } = await loginAction(email, password);
    if (error) return error;
    router.refresh();
    return null;
  }

  async function handleRegister(data: {
    nombre: string;
    email: string;
    whatsapp: string;
    password: string;
    plan: PlanKey;
  }) {
    const { error } = await registerAction(data);
    if (error) return error;
    router.refresh();
    return null;
  }

  return <LoginScreen onLogin={handleLogin} onRegister={handleRegister} />;
}
