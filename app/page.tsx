import { getCurrentAppUser, getContactsForTenant } from "@/lib/actions/user";
import {
  getTemplatesForTenant,
  getListsForTenant,
  getCampaignsForTenant,
} from "@/lib/actions/campaigns";
import LoginGate from "./login-gate";
import AppShell from "@/components/yamasend/AppShell";
import { logoutAction } from "@/lib/actions/auth";

export default async function Home() {
  const user = await getCurrentAppUser();

  if (!user) {
    return <LoginGate />;
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
