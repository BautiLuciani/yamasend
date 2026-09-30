import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getRequestAccessToken, getRequestAuthStore } from "@/lib/supabase/request-auth";

export async function createClient() {
  // Request autenticado por token (conector MCP de Claude / ChatGPT): no hay
  // cookies, la identidad viaja en el access token. Ver
  // lib/supabase/request-auth.ts. Para el panel este bloque nunca corre y el
  // comportamiento es exactamente el de siempre.
  const accessToken = getRequestAccessToken();
  if (accessToken) return createClientConToken(accessToken);

  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // setAll fue llamado desde un Server Component.
            // Se puede ignorar si hay middleware refrescando la sesión.
          }
        },
      },
    },
  );
}

/**
 * Cliente que actúa como el usuario dueño del token.
 *
 * - PostgREST y las RPC reciben el token en Authorization, así que RLS y
 *   auth.uid() resuelven al mismo usuario que en el panel.
 * - auth.getUser() sin argumentos normalmente lee la sesión guardada en
 *   cookies, que acá no existe. Se lo redirige al token del request: todo el
 *   código existente llama getUser() sin parámetros y tiene que seguir
 *   funcionando sin cambios. getUser(token) valida el token contra el Auth
 *   server de Supabase (firma, vencimiento y que la sesión no esté revocada).
 * - Nunca escribe cookies: un cliente externo no tiene navegador.
 */
function createClientConToken(accessToken: string) {
  const client = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return [];
        },
        setAll() {},
      },
      global: {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  );

  const getUserOriginal = client.auth.getUser.bind(client.auth);
  type GetUserResult = ReturnType<typeof getUserOriginal>;

  client.auth.getUser = (jwt?: string): GetUserResult => {
    if (jwt && jwt !== accessToken) return getUserOriginal(jwt);

    // Una sola validación contra el Auth server por request (ver userMemo).
    const store = getRequestAuthStore();
    if (store && store.accessToken === accessToken) {
      store.userMemo ??= getUserOriginal(accessToken);
      return store.userMemo as GetUserResult;
    }
    return getUserOriginal(accessToken);
  };

  return client;
}
