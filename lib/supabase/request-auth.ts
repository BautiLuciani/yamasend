import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Identidad de un request que NO viene del navegador sino de un cliente
 * externo autenticado por token (hoy: el conector MCP de Claude / ChatGPT).
 *
 * El panel se autentica con la cookie de sesión de Supabase. El conector no
 * tiene cookies: manda un access token OAuth emitido por el OAuth Server de
 * Supabase en el header Authorization. Ese token es un JWT del mismo usuario
 * (mismo sub, role "authenticated"), así que RLS, auth.uid() y todas las RPC
 * se comportan exactamente igual que en el panel.
 *
 * En vez de duplicar la lógica de negocio (permisos, reserva de créditos,
 * guards del Motor) en código aparte, el route handler del MCP corre cada
 * request dentro de runWithAccessToken(). createClient() de
 * lib/supabase/server.ts mira este contexto: si hay token, arma el cliente
 * con ese token; si no, sigue por el camino de siempre (cookies). El panel no
 * cambia en nada.
 *
 * AsyncLocalStorage aísla el valor por request: dos llamadas concurrentes de
 * usuarios distintos nunca ven el token de la otra.
 */
interface RequestAuth {
  accessToken: string;
  /**
   * Resultado de auth.getUser() para este token, memoizado por request. Una
   * sola tool pasa por varios server actions y cada uno llama getUser(); en el
   * panel eso lo absorbe cache() de React, pero en un route handler cache() no
   * memoiza. Sin esto serían ~10 idas al Auth server por cada tool.
   */
  userMemo?: Promise<unknown>;
}

const storage = new AsyncLocalStorage<RequestAuth>();

export function runWithAccessToken<T>(accessToken: string, fn: () => T): T {
  return storage.run({ accessToken }, fn);
}

/** Store del request actual (uso interno de lib/supabase/server.ts). */
export function getRequestAuthStore(): RequestAuth | null {
  return storage.getStore() ?? null;
}

/** Token del request actual, o null si el request viene del panel (cookies). */
export function getRequestAccessToken(): string | null {
  return storage.getStore()?.accessToken ?? null;
}
