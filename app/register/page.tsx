import { redirect } from "next/navigation";
import { getCurrentMembership } from "@/lib/auth/permisos";
import { getInfoInvitacionAction } from "@/lib/actions/auth";
import LoginGate from "../login-gate";

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ invite?: string }>;
}) {
  const { invite } = await searchParams;
  // Se chequea la membresía y no el AppUser: getCurrentAppUser() devuelve
  // null para una cuenta empresa, y eso la dejaría entrar acá estando logueada.
  const membership = await getCurrentMembership();

  if (membership) {
    redirect("/panel");
  }

  // El tipo de invitación se resuelve en el servidor: el cliente no puede
  // decidir que su registro es "de empresa" para saltearse el WhatsApp.
  const info = invite ? await getInfoInvitacionAction(invite) : null;

  return (
    <LoginGate
      initialTab="register"
      inviteToken={invite ?? null}
      esInvitacionEmpresa={info?.valida === true && info.rol === "empresa"}
      organizacionInvita={info?.organizacion ?? null}
    />
  );
}
