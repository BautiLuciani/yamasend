"use client";

import { useState } from "react";
import { PERMISO_KEYS, type PermisoKey, type Permisos } from "@/lib/types";
import { crearInvitacionAction } from "@/lib/actions/empresa";

const PERMISO_LABEL: Record<PermisoKey, string> = {
  crear_audiencias: "Crear audiencias",
  importar_contactos: "Importar contactos",
  crear_templates: "Crear templates",
  enviar_templates_meta: "Enviar templates a Meta",
  crear_campanas: "Crear campañas",
  enviar_campanas: "Enviar campañas",
  comprar_creditos: "Comprar créditos",
  usar_ia: "Usar el asistente de IA",
};

/** Arranque conservador: puede organizarse, pero no gastar plata todavía. */
const PERMISOS_INICIALES: Permisos = {
  crear_audiencias: true,
  importar_contactos: true,
  crear_templates: false,
  enviar_templates_meta: false,
  crear_campanas: false,
  enviar_campanas: false,
  comprar_creditos: false,
  usar_ia: true,
};

export default function InvitarEmpleadoModal({
  onClose,
  onCreada,
}: {
  onClose: () => void;
  onCreada: () => void;
}) {
  const [nombre, setNombre] = useState("");
  const [permisos, setPermisos] = useState<Permisos>({ ...PERMISOS_INICIALES });
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);

  async function crear() {
    setGuardando(true);
    setError(null);
    const res = await crearInvitacionAction(nombre.trim(), permisos);
    setGuardando(false);

    if (!res.ok || !res.token) {
      setError(res.error ?? "No se pudo crear la invitación.");
      return;
    }
    // El link se arma acá y no en el servidor porque el origin correcto lo
    // conoce el navegador (dominio propio, preview de Vercel, localhost).
    setLink(`${window.location.origin}/register?invite=${res.token}`);
    onCreada();
  }

  async function copiar() {
    if (!link) return;
    await navigator.clipboard.writeText(link);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center px-4 py-6">
      <div className="absolute inset-0 bg-[rgba(16,24,20,0.45)]" onClick={onClose} />

      <div className="relative w-full max-w-[520px] max-h-full overflow-y-auto bg-white border border-ys-border rounded-2xl p-5 md:p-6 flex flex-col gap-5 shadow-[0_20px_48px_rgba(16,24,20,0.18)]">
        <div className="flex items-start gap-3">
          <div className="flex flex-col gap-1 min-w-0">
            <h2 className="text-[18px] font-extrabold text-ys-text">
              {link ? "Invitación creada" : "Invitar a un empleado"}
            </h2>
            <p className="text-[13px] text-ys-dim font-medium">
              {link
                ? "Copiá el link y mandáselo. Vence en 14 días."
                : "Se genera un link para que se registre. Vas a tener que aprobarlo después."}
            </p>
          </div>
          <button
            onClick={onClose}
            className="ml-auto w-8 h-8 flex-none flex items-center justify-center rounded-lg hover:bg-ys-el2 cursor-pointer"
            aria-label="Cerrar"
          >
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
              <path d="m4 4 8 8M12 4l-8 8" stroke="#6b736e" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {link ? (
          <div className="flex flex-col gap-3">
            <div className="bg-[#fbfcfb] border border-ys-border rounded-xl px-3.5 py-3">
              <span className="text-[12.5px] font-mono text-ys-muted break-all">
                {link}
              </span>
            </div>
            <button
              onClick={copiar}
              className="w-full flex items-center justify-center gap-2 bg-ys-green text-white text-[13.5px] font-bold px-[17px] py-[11px] rounded-[10px] cursor-pointer transition-all hover:bg-ys-green-hover"
            >
              {copiado ? "¡Copiado!" : "Copiar link"}
            </button>
            <p className="text-[12.5px] text-ys-dim font-medium leading-relaxed">
              Cuando se registre te va a aparecer acá arriba, en invitaciones
              abiertas, con los botones para aceptarlo o rechazarlo. Recién
              cuando lo aceptes puede entrar.
            </p>
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-3.5">
              <label className="flex flex-col gap-1.5">
                <span className="text-[12.5px] font-bold text-ys-text">
                  Nombre del empleado
                </span>
                <input
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  placeholder="Juan Pérez"
                  className="bg-white border border-ys-border rounded-[10px] px-3.5 py-2.5 text-[13.5px] font-semibold text-ys-text outline-none focus:border-ys-green-border"
                />
                <span className="text-[11.5px] text-ys-dim font-medium leading-snug">
                  Es solo para que lo reconozcas en tu lista. Él se registra con
                  el email que quiera.
                </span>
              </label>
            </div>

            <div className="flex flex-col gap-2.5 border-t border-ys-border-softest pt-4">
              <span className="text-[12.5px] font-bold text-ys-text">
                Permisos con los que arranca
              </span>
              <div className="flex flex-col gap-1">
                {PERMISO_KEYS.map((key) => (
                  <label
                    key={key}
                    className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg cursor-pointer hover:bg-[#f7f9f8]"
                  >
                    <input
                      type="checkbox"
                      checked={permisos[key]}
                      onChange={(e) =>
                        setPermisos((p) => ({ ...p, [key]: e.target.checked }))
                      }
                      className="w-4 h-4 accent-[#12b76a] cursor-pointer"
                    />
                    <span className="text-[13px] font-semibold text-[#3f4844]">
                      {PERMISO_LABEL[key]}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {error && (
              <div className="bg-ys-red-bg border border-ys-red-border rounded-xl px-3.5 py-2.5">
                <span className="text-[13px] font-semibold text-ys-red-text">{error}</span>
              </div>
            )}

            <div className="flex items-center gap-2.5 border-t border-ys-border-softest pt-4">
              <button
                onClick={onClose}
                className="text-[13.5px] font-bold text-[#3f4844] bg-white border border-ys-border rounded-[10px] px-4 py-[11px] cursor-pointer hover:bg-[#f7f9f8]"
              >
                Cancelar
              </button>
              <button
                onClick={crear}
                disabled={guardando || nombre.trim().length < 2}
                className="ml-auto flex items-center gap-2 bg-ys-green text-white text-[13.5px] font-bold px-[17px] py-[11px] rounded-[10px] cursor-pointer transition-all hover:bg-ys-green-hover disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {guardando ? "Creando..." : "Generar link"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
