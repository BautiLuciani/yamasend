import Image from "next/image";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMembership } from "@/lib/auth/permisos";
import { esAuthorizationIdValido, urlConsentimiento } from "@/lib/utils/redireccionOauth";
import { decidirAutorizacionAction } from "./actions";
import BotonesDecision from "./BotonesDecision";

/**
 * Pantalla de consentimiento del conector (Claude / ChatGPT → YamaSend).
 *
 * El OAuth Server de Supabase manda acá al usuario después de que tocó
 * "Conectar" en su chat (Authentication → OAuth Server → Authorization Path =
 * /oauth/consent). Si no tiene sesión, pasa primero por el login normal de
 * YamaSend y vuelve solo.
 */

const MENSAJES_ERROR: Record<string, string> = {
  solicitud_invalida: "El link de conexión no es válido.",
  solicitud_vencida:
    "Esta solicitud de conexión venció o ya se usó. Volvé a tocar \"Conectar\" desde Claude o ChatGPT.",
};

export default async function ConsentPage({
  searchParams,
}: {
  searchParams: Promise<{ authorization_id?: string; error?: string }>;
}) {
  const { authorization_id: authorizationId, error: codigoError } = await searchParams;

  if (codigoError || !authorizationId || !esAuthorizationIdValido(authorizationId)) {
    return (
      <Marco>
        <Titulo>No pudimos conectar</Titulo>
        <Texto>
          {MENSAJES_ERROR[codigoError ?? ""] ?? MENSAJES_ERROR.solicitud_invalida}
        </Texto>
      </Marco>
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?next=${encodeURIComponent(urlConsentimiento(authorizationId))}`);
  }

  const { data: detalles, error } = await supabase.auth.oauth.getAuthorizationDetails(authorizationId);

  if (error || !detalles) {
    return (
      <Marco>
        <Titulo>No pudimos conectar</Titulo>
        <Texto>{MENSAJES_ERROR.solicitud_vencida}</Texto>
      </Marco>
    );
  }

  // Ya había aprobado antes a este cliente: Supabase devuelve directo la URL
  // de vuelta, no hace falta preguntar de nuevo.
  if (!("authorization_id" in detalles)) {
    redirect(detalles.redirect_url);
  }

  const membership = await getCurrentMembership();
  const nombreCliente = detalles.client?.name?.trim() || "Una aplicación";

  let destino = "";
  try {
    destino = new URL(detalles.redirect_uri).host;
  } catch {
    destino = "";
  }

  const cuentaLista = membership && membership.rol !== "empresa" && membership.estado === "activo";

  return (
    <Marco>
      <Titulo>
        {nombreCliente} quiere conectarse con tu cuenta de YamaSend
      </Titulo>
      <Texto>
        Vas a poder manejar YamaSend hablando desde el chat. Sesión iniciada como{" "}
        <span className="font-bold text-ys-text">{detalles.user?.email ?? user.email}</span>.
      </Texto>

      <div className="w-full text-left rounded-xl border border-ys-border bg-ys-el2/40 px-4 py-3.5 flex flex-col gap-2.5">
        <Permiso>Ver tus contactos, audiencias, templates, campañas y métricas</Permiso>
        <Permiso>Crear audiencias y borradores de templates</Permiso>
        <Permiso>
          Mandar templates a Meta y enviar o programar campañas,{" "}
          <span className="font-bold">mostrándote antes un resumen para que lo confirmes</span>
        </Permiso>
      </div>

      {!cuentaLista && (
        <div className="w-full rounded-lg bg-ys-warn-bg text-ys-warn-text px-3.5 py-2.5 text-[12.5px] font-medium text-left">
          {membership?.rol === "empresa"
            ? "Esta es una cuenta de empresa: por ahora el conector trabaja con las cuentas de cada vendedor, que son las que tienen WhatsApp conectado."
            : "Tu cuenta todavía no está lista (por ejemplo, falta conectar WhatsApp). Podés conectar igual, pero las acciones no van a funcionar hasta que termines la configuración en YamaSend."}
        </div>
      )}

      <form action={decidirAutorizacionAction} className="w-full">
        <input type="hidden" name="authorization_id" value={detalles.authorization_id} />
        <BotonesDecision />
      </form>

      <p className="text-[11px] text-ys-dim font-medium leading-relaxed">
        {destino ? <>Después de elegir vas a volver a <span className="font-semibold">{destino}</span>. </> : null}
        Podés desconectar el acceso cuando quieras desde la configuración de conectores de tu chat.
      </p>
    </Marco>
  );
}

function Marco({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-ys-bg flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-[460px] bg-ys-card border border-ys-border rounded-[18px] p-7 sm:p-9 shadow-[var(--shadow-card)] flex flex-col items-center text-center gap-4">
        <Image
          src="/brand/logo-login.png"
          alt="YamaSend"
          width={160}
          height={107}
          className="w-full max-w-[140px] h-auto object-contain"
          priority
        />
        {children}
      </div>
    </div>
  );
}

function Titulo({ children }: { children: React.ReactNode }) {
  return (
    <h1 className="text-[20px] font-extrabold tracking-[-0.02em] text-ys-text leading-snug">{children}</h1>
  );
}

function Texto({ children }: { children: React.ReactNode }) {
  return <p className="text-[13.5px] text-ys-muted font-medium leading-relaxed">{children}</p>;
}

function Permiso({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 text-[13px] text-ys-text font-medium leading-snug">
      <svg className="mt-[3px] shrink-0" width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="m3 8.4 3.4 3L13 4.6" stroke="var(--ys-green)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span>{children}</span>
    </div>
  );
}
