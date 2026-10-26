"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentMembership } from "@/lib/auth/permisos";

/**
 * Cuántos contactos aparecieron desde `desdeIso` (la última vez que se miró
 * Contactos). Alimenta el globo con contador del menú. Solo lectura.
 */
export async function contarContactosNuevosAction(desdeIso: string): Promise<number> {
  const desde = Date.parse(desdeIso);
  if (!Number.isFinite(desde)) return 0;
  const membership = await getCurrentMembership();
  if (!membership?.tenantId) return 0;

  const supabase = await createClient();
  const { count } = await supabase
    .from("yamas_send_leads")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", membership.tenantId)
    .eq("activo", true)
    .gt("created_at", new Date(desde).toISOString());
  return count ?? 0;
}
