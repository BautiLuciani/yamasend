import { redirect } from "next/navigation";
import { getCurrentMembership } from "@/lib/auth/permisos";
import { getInfoInvitacionAction } from "@/lib/actions/auth";
import AceptarInvitacionScreen from "@/components/yamasend/AceptarInvitacionScreen";
import LoginGate from "../login-gate";

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ invite?: string; error?: string }>;
}) {
  const { invite, error } = await searchParams;
  // Se chequea la membresía y no el AppUser: getCurrentAppUser() devuelve
  // null para una cuenta empresa, y eso la dejaría entrar acá estando logueada.
  const membership = await getCurrentMembership();

  // El tipo de invitación se resuelve en el servidor: el cliente no puede
  // decidir que su registro es "de empresa" para saltearse el WhatsApp.
  const info = invite ? await getInfoInvitacionAction(invite) : null;

  if (membership) {
    // Con sesión abierta y un link válido, la invitación NO se descarta: se
    // ofrece sumar esta cuenta al equipo. Antes se redirigía a /panel sin
    // mirar el token, y el link se perdía en silencio.
    if (invite && info?.valida) {
      // El motivo de bloqueo se calcula acá, en el servidor, para no mandar al
      // cliente a chocarse contra la RPC y recién ahí enterarse de que no podía.
      let bloqueo: string | null = null;
      if (info.rol === "empresa") {
        bloqueo =
          "Ese link sirve para crear una cuenta de empresa nueva, no para sumar la tuya a un equipo. Cerrá sesión y abrilo de nuevo.";
      } else if (membership.rol === "empresa") {
        bloqueo =
          "Estás usando una cuenta de empresa, que no puede sumarse a otro equipo como empleado. Iniciá sesión con la cuenta que querés vincular.";
      } else if (membership.orgId) {
        bloqueo = membership.orgNombre
          ? `Tu cuenta ya forma parte de ${membership.orgNombre}. Pediles que te quiten del equipo antes de sumarte a otra empresa.`
          : "Tu cuenta ya forma parte de una empresa. Tenés que salir de esa antes de sumarte a otra.";
      } else if (membership.estado === "suspendido") {
        bloqueo =
          "Tu cuenta está suspendida, así que no puede sumarse a un equipo.";
      }

      return (
        <AceptarInvitacionScreen
          token={invite}
          organizacion={info.organizacion}
          nombreUsuario={membership.nombreDisplay ?? "tu cuenta"}
          bloqueo={bloqueo}
        />
      );
    }

    redirect("/panel");
  }

  return (
    <LoginGate
      initialTab="register"
      inviteToken={invite ?? null}
      esInvitacionEmpresa={info?.valida === true && info.rol === "empresa"}
      organizacionInvita={info?.organizacion ?? null}
      initialError={error ?? null}
    />
  );
}
