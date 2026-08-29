import { redirect } from "next/navigation";
import { getCurrentMembership } from "@/lib/auth/permisos";
import LoginGate from "../login-gate";

export default async function LoginPage() {
  // Se chequea la membresía y no el AppUser: getCurrentAppUser() devuelve
  // null para una cuenta empresa, y eso la dejaría entrar acá estando logueada.
  const membership = await getCurrentMembership();

  if (membership) {
    redirect("/panel");
  }

  return <LoginGate initialTab="login" />;
}
