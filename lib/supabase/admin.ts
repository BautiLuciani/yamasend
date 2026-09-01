import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Cliente de Supabase con service role: saltea RLS por completo.
 *
 * Hace falta para las dos operaciones que NO tienen una sesión de usuario
 * detrás y que el usuario tampoco debe poder hacer por su cuenta:
 *
 *   - Guardar la cotización del dólar. Si un cliente pudiera escribirla, se
 *     fijaría su propio tipo de cambio y compraría créditos a un peso.
 *   - Acreditar los créditos cuando Mercado Pago avisa que un pago se aprobó.
 *     Ese webhook lo llama Mercado Pago, no el usuario: no hay cookie ni
 *     sesión, y el que paga no puede ser el que se acredita a sí mismo.
 *
 * Vive aparte de lib/supabase/server.ts a propósito. Ese módulo importa
 * next/headers y solo sirve dentro de una request con cookies; este no importa
 * nada de Next y anda también en un route handler. Mezclarlos haría que
 * cualquier archivo que necesite service role arrastre next/headers.
 *
 * NUNCA importar este módulo desde un componente cliente. La clave es un
 * secreto de servidor: si se filtra al bundle, cualquiera lee y escribe toda
 * la base sin restricciones.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  // Se falla ruidoso y temprano en vez de devolver un cliente a medias: un
  // cliente sin la clave se convierte en un anon disfrazado, y el error
  // aparecería mucho después, como un "no encontré la fila" incomprensible.
  if (!url || !key) {
    throw new Error(
      "Falta SUPABASE_SERVICE_ROLE_KEY o NEXT_PUBLIC_SUPABASE_URL en el entorno.",
    );
  }

  return createSupabaseClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** true si el entorno tiene lo necesario para usar service role. */
export function hayServiceRole(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}
