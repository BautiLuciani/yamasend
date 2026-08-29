import { redirect } from "next/navigation";
import {
  getCurrentAppUser,
  getContactsForTenant,
  getCurrentEmpresaUser,
} from "@/lib/actions/user";
import {
  getTemplatesForTenant,
  getListsForTenant,
  getCampaignsForTenant,
} from "@/lib/actions/campaigns";
import { getCurrentMembership } from "@/lib/auth/permisos";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/components/yamasend/AppShell";
import PendingApprovalScreen from "@/components/yamasend/PendingApprovalScreen";
import { logoutAction } from "@/lib/actions/auth";

/**
 * Punto de entrada del panel. Ruteo por rol:
 *
 *   sin membresía          → /login
 *   empleado no activo     → pared de "esperando aprobación"
 *   empresa / admin        → consola de gestión (solo lectura)
 *   empleado activo        → la app de siempre
 *
 * El rol se resuelve ANTES de cargar cualquier dato: si primero cargáramos
 * los datos y después chequeáramos el rol, una cuenta empresa dispararía
 * queries de empleado que no le corresponden.
 */
export default async function PanelPage() {
  const membership = await getCurrentMembership();

  if (!membership) {
    redirect("/login");
  }

  if (membership.rol === "empresa" || membership.rol === "admin") {
    const empresa = await getCurrentEmpresaUser();
    if (!empresa) {
      redirect("/login");
    }
    // TODO(fase 2): EmpresaShell con Dashboard, Contactos, Audiencias,
    // Templates, Campañas y Configuración. Las funciones de lectura ya están
    // creadas en Supabase (yamas_send_empresa_*). Hasta que exista el shell,
    // una cuenta empresa no tiene a dónde entrar.
    redirect("/login");
  }

  if (membership.estado !== "activo") {
    // El email sale de la sesión de Auth, no de la membresía: tenantId es el
    // número de WhatsApp, no un email.
    const supabase = await createClient();
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();

    return (
      <PendingApprovalScreen
        nombreEmpresa={membership.orgNombre}
        email={authUser?.email ?? ""}
        onLogout={logoutAction}
      />
    );
  }

  const user = await getCurrentAppUser();

  if (!user) {
    redirect("/login");
  }

  const [contacts, templates, lists, campaigns] = await Promise.all([
    getContactsForTenant(user.tenantId),
    getTemplatesForTenant(user.tenantId),
    getListsForTenant(user.tenantId),
    getCampaignsForTenant(user.tenantId),
  ]);

  return (
    <AppShell
      user={user}
      contacts={contacts}
      templates={templates}
      lists={lists}
      campaigns={campaigns}
      onLogout={logoutAction}
    />
  );
}
