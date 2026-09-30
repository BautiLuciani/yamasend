import { promises as dns } from "dns";

/**
 * Chequea que el DOMINIO de un email pueda recibir correo (tiene registros
 * MX, o al menos A/AAAA como exige el fallback implícito de RFC 5321).
 *
 * No verifica que la casilla puntual exista (eso requeriría un servicio
 * pago tipo ZeroBounce/Abstract API) — pero frena la mayoría de los typos
 * comunes ("gmial.com") y los dominios inventados, que es lo que importa
 * para el MVP: el magic link ya se encarga de confirmar que la persona
 * tiene acceso real a esa casilla.
 *
 * Ante cualquier problema que NO sea "el dominio no existe" (timeout,
 * DNS caído, red del server con problemas) se deja pasar el email: mejor
 * un typo que se cuela que bloquear un registro legítimo por un problema
 * nuestro.
 */
export async function dominioDeEmailExiste(email: string): Promise<boolean> {
  const dominio = email.split("@")[1]?.trim().toLowerCase();
  if (!dominio) return false;

  const conTimeout = function <T>(promesa: Promise<T>): Promise<T> {
    return Promise.race([
      promesa,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error("timeout_dns")), 3000),
      ),
    ]);
  };

  try {
    const registrosMx = await conTimeout(dns.resolveMx(dominio));
    if (registrosMx.length > 0) return true;
  } catch (err) {
    const codigo = (err as NodeJS.ErrnoException)?.code;
    // Dominio no existe o no tiene MX: probamos el fallback A/AAAA antes
    // de descartarlo. Cualquier otro código (timeout, servidor DNS caído)
    // es un problema nuestro, no del email: no lo tratamos como inválido.
    if (codigo !== "ENOTFOUND" && codigo !== "ENODATA" && (err as Error)?.message !== "timeout_dns") {
      return true;
    }
  }

  try {
    const registrosA = await conTimeout(dns.resolve4(dominio));
    if (registrosA.length > 0) return true;
  } catch {
    // seguimos al intento de AAAA
  }

  try {
    const registrosAaaa = await conTimeout(dns.resolve6(dominio));
    return registrosAaaa.length > 0;
  } catch (err) {
    const codigo = (err as NodeJS.ErrnoException)?.code;
    if (codigo !== "ENOTFOUND" && codigo !== "ENODATA" && (err as Error)?.message !== "timeout_dns") {
      return true; // problema nuestro, no del dominio: dejamos pasar
    }
    return false;
  }
}
