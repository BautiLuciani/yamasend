"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { esAuthorizationIdValido, urlConsentimiento } from "@/lib/utils/redireccionOauth";

/**
 * Decisión del usuario en la pantalla de consentimiento. Supabase devuelve la
 * URL a la que hay que volver (Claude / ChatGPT) con el código de
 * autorización (si aprobó) o con access_denied (si canceló).
 */
export async function decidirAutorizacionAction(formData: FormData): Promise<void> {
  const authorizationId = String(formData.get("authorization_id") ?? "");
  const decision = String(formData.get("decision") ?? "");

  if (!esAuthorizationIdValido(authorizationId)) {
    redirect("/oauth/consent?error=solicitud_invalida");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(urlConsentimiento(authorizationId));

  const { data, error } =
    decision === "aprobar"
      ? await supabase.auth.oauth.approveAuthorization(authorizationId, { skipBrowserRedirect: true })
      : await supabase.auth.oauth.denyAuthorization(authorizationId, { skipBrowserRedirect: true });

  if (error || !data?.redirect_url) {
    redirect("/oauth/consent?error=solicitud_vencida");
  }

  redirect(data.redirect_url);
}
