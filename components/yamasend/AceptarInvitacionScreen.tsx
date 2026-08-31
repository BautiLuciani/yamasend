"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { aceptarInvitacionExistenteAction } from "@/lib/actions/membresia";

/**
 * Pantalla que ve alguien que YA tiene sesión abierta y entra a un link de
 * invitación.
 *
 * Antes este caso se perdía en silencio: /register redirigía a /panel sin
 * mirar el token, así que la invitación se descartaba sin decir nada.
 *
 * Es una decisión explícita y no un vínculo automático porque aceptar cambia
 * el dueño de los datos: la empresa pasa a ver los contactos, las campañas y
 * las métricas de esta cuenta, y los permisos dejan de ser propios. Eso hay
 * que decirlo antes, no después.
 */
export default function AceptarInvitacionScreen({
  token,
  organizacion,
  nombreUsuario,
  bloqueo,
}: {
  token: string;
  organizacion: string | null;
  nombreUsuario: string;
  /**
   * Motivo por el que esta cuenta NO puede aceptar (ya está en otra empresa,
   * es cuenta de empresa, etc.). Se resuelve en el servidor; si viene, se
   * muestra la explicación en vez de los botones.
   */
  bloqueo: string | null;
}) {
  const router = useRouter();
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function aceptar() {
    setCargando(true);
    setError(null);
    const res = await aceptarInvitacionExistenteAction(token);

    if (!res.ok) {
      // Solo se rehabilita el botón si falló: si salió bien, la navegación ya
      // está en camino y dejarlo clickeable permitía un segundo click real
      // sobre una invitación ya consumida (que devolvía "ya_tiene_empresa").
      setCargando(false);
      setError(res.error);
      return;
    }

    // Navegación dura y no router.push() + router.refresh().
    //
    // Aceptar cambia la membresía de "empleado independiente activo" a
    // "pendiente", así que /panel tiene que renderizar algo completamente
    // distinto (la pared de espera en vez de la app). El problema es que
    // /panel ya estaba en el Router Cache de Next con el árbol viejo: push()
    // servía ese árbol cacheado y refresh() salía a buscar el nuevo en
    // paralelo, dos navegaciones compitiendo por la misma ruta. El resultado
    // era que el primer click no cambiaba nada a la vista, aunque del lado del
    // servidor ya estuviera todo hecho.
    //
    // Un assign() fuerza un render limpio desde el servidor con el estado
    // nuevo. Cuesta una recarga completa, pero esto pasa una sola vez en la
    // vida de la cuenta y a cambio es determinístico.
    window.location.assign("/panel");
  }

  const empresa = organizacion ?? "una empresa";

  return (
    <div className="fixed inset-0 overflow-y-auto bg-ys-bg">
      <div className="min-h-full w-full flex items-center justify-center px-5 py-10">
        <div className="w-full max-w-[460px] flex flex-col items-center text-center gap-6">
          <Image
            src="/brand/logo-login.png"
            alt="YamaSend"
            width={190}
            height={76}
            className="w-[170px] h-auto object-contain"
            priority
          />

          <div className="w-full bg-ys-card border border-ys-border rounded-2xl p-7 sm:p-8 flex flex-col items-center gap-5 shadow-[0_12px_28px_rgba(16,24,20,0.08)]">
            <div className="w-14 h-14 rounded-full bg-ys-green-bg flex items-center justify-center flex-shrink-0">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
                <circle cx="9" cy="8" r="3.4" stroke="#12B76A" strokeWidth="1.8" />
                <path
                  d="M3.5 19c0-3.2 2.9-5 5.5-5s5.5 1.8 5.5 5"
                  stroke="#12B76A"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
                <path
                  d="M17 9.5h4M19 7.5v4"
                  stroke="#12B76A"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </svg>
            </div>

            <div className="flex flex-col gap-2">
              <h1 className="text-[19px] sm:text-xl font-extrabold text-ys-text leading-snug">
                Te invitaron a sumarte a{" "}
                <span className="text-ys-green-text">{empresa}</span>
              </h1>
              <p className="text-[14px] text-ys-muted leading-relaxed">
                Estás con la sesión de{" "}
                <span className="font-bold text-ys-text">{nombreUsuario}</span>.
              </p>
            </div>

            {bloqueo ? (
              <div className="w-full bg-ys-warn-bg border border-[#f0dcb4] rounded-xl px-4 py-3 text-left">
                <span className="text-[13px] font-semibold text-ys-warn-text leading-relaxed">
                  {bloqueo}
                </span>
              </div>
            ) : (
              <>
                {/* Lo que cambia al aceptar, dicho antes de aceptar. */}
                <div className="w-full bg-ys-warn-bg border border-[#f0dcb4] rounded-xl px-4 py-3.5 flex flex-col gap-2 text-left">
                  <span className="text-[12.5px] font-extrabold text-ys-warn-text">
                    Al aceptar, tu cuenta pasa a formar parte de {empresa}:
                  </span>
                  <ul className="flex flex-col gap-1.5">
                    {[
                      "Van a poder ver tus contactos, audiencias, templates y campañas",
                      "Van a ver tus métricas de envío",
                      "Tus permisos pasan a definirlos ellos",
                    ].map((t) => (
                      <li
                        key={t}
                        className="text-[12.5px] font-medium text-ys-warn-text leading-snug flex gap-2"
                      >
                        <span className="flex-none">•</span>
                        {t}
                      </li>
                    ))}
                  </ul>
                </div>

                <p className="text-[12.5px] text-ys-dim font-medium leading-relaxed">
                  No se borra nada tuyo. Si más adelante te sacan del equipo,
                  volvés a ser una cuenta independiente con todo tu contenido.
                </p>
              </>
            )}

            {error && (
              <div className="w-full bg-ys-red-bg border border-ys-red-border rounded-xl px-4 py-3">
                <span className="text-[13px] font-semibold text-ys-red-text">
                  {error}
                </span>
              </div>
            )}

            <div className="w-full flex items-center gap-2.5">
              <button
                onClick={() => router.push("/panel")}
                disabled={cargando}
                className="flex-1 text-[13.5px] font-bold text-[#3f4844] bg-white border border-ys-border rounded-[11px] px-4 py-3 cursor-pointer transition-colors hover:bg-[#f7f9f8] disabled:opacity-40"
              >
                {bloqueo ? "Volver al panel" : "Rechazar"}
              </button>
              {!bloqueo && (
                <button
                  onClick={aceptar}
                  disabled={cargando}
                  className="flex-1 text-[13.5px] font-bold text-white bg-ys-green rounded-[11px] px-4 py-3 cursor-pointer transition-all hover:bg-ys-green-hover disabled:opacity-40"
                >
                  {cargando ? "Sumándote..." : "Aceptar"}
                </button>
              )}
            </div>
          </div>

          <p className="text-[12.5px] text-ys-dim font-medium leading-relaxed max-w-[380px]">
            Si rechazás, el link sigue siendo válido: podés volver a abrirlo más
            adelante mientras la empresa no lo revoque.
          </p>
        </div>
      </div>
    </div>
  );
}
