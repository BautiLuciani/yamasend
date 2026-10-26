/**
 * La API key de YCloud es UNA sola para toda la plataforma: la carga el
 * administrador en las variables de entorno (YCLOUD_API_KEY) y ningún usuario
 * la pega ni la ve.
 *
 * Mientras se migra, si la variable no está se usa la que tenga guardada la
 * fila del tenant (cuentas viejas). En cuanto la variable existe, manda ella:
 * una clave distinta guardada por cuenta se ignora.
 *
 * Solo servidor. No exporta nada que viaje al navegador.
 */
export function ycloudApiKey(claveDeLaFila?: string | null): string | null {
  const global = process.env.YCLOUD_API_KEY?.trim();
  if (global) return global;
  const fila = claveDeLaFila?.trim();
  return fila ? fila : null;
}

/** true si la plataforma tiene la clave única cargada (sin exponerla). */
export function hayClaveYcloudGlobal(): boolean {
  return Boolean(process.env.YCLOUD_API_KEY?.trim());
}
