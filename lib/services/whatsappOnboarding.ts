/**
 * Punto único que sabe cómo conseguir el link de conexión de WhatsApp
 * (Meta Embedded Signup / Coexistence vía YCloud).
 *
 * Hoy la cuenta de YCloud es Pro: el link es SIEMPRE el mismo, estático,
 * generado a mano una vez en la consola de YCloud ("Employee self-service")
 * y pegado en YCLOUD_ONBOARDING_LINK. Cuando pasemos a la cuenta Tech
 * Partner, este archivo es el ÚNICO lugar que cambia: en vez de leer una env
 * var fija, se llama a `POST /v2/partner/embeddedSignup/links` pasando
 * `partnerCustomerId: pendingConnectionId` (que YCloud devuelve en el
 * webhook para mapear WABA↔cliente). El resto de la app no se entera.
 */
export async function getOnboardingLink(_pendingConnectionId: string): Promise<string> {
  const link = process.env.YCLOUD_ONBOARDING_LINK;
  if (!link) {
    throw new Error(
      "Falta YCLOUD_ONBOARDING_LINK en el entorno (el link estático de 'Employee self-service' de YCloud).",
    );
  }
  return link;

  // --- Cuando migremos a Tech Partner, reemplazar el cuerpo por algo así: ---
  // const res = await fetch("https://api.ycloud.com/v2/partner/embeddedSignup/links", {
  //   method: "POST",
  //   headers: {
  //     "X-API-Key": process.env.YCLOUD_API_KEY!,
  //     "Content-Type": "application/json",
  //   },
  //   body: JSON.stringify({
  //     partnerCustomerId: _pendingConnectionId,
  //     onboardingType: "WHATSAPP_BUSINESS_APP",
  //     locale: "es_ES",
  //   }),
  // });
  // const data = await res.json();
  // return data.link;
}
