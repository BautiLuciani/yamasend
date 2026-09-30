import { redirect } from "next/navigation";
import { getCurrentMembership } from "@/lib/auth/permisos";
import LoginGate from "../login-gate";
import { nextOauthSeguro } from "@/lib/utils/redireccionOauth";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const { error, next } = await searchParams;
  // Solo se honra "next" para volver a la pantalla de consentimiento del
  // conector (Claude / ChatGPT). Cualquier otro valor se ignora.
  const nextOauth = nextOauthSeguro(next);
  // Se chequea la membresía y no el AppUser: getCurrentAppUser() devuelve
  // null para una cuenta empresa, y eso la dejaría entrar acá estando logueada.
  const membership = await getCurrentMembership();

  if (membership) {
    redirect(nextOauth ?? "/panel");
  }

  return <LoginGate initialTab="login" initialError={error ?? null} nextOauth={nextOauth} />;
}
