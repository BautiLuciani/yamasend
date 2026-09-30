"use client";

import LoginScreen from "@/components/yamasend/LoginScreen";
import { createClient } from "@/lib/supabase/client";
import { validarDominioEmailAction } from "@/lib/actions/auth";
import { COOKIE_NEXT_OAUTH } from "@/lib/utils/redireccionOauth";

/**
 * El magic link se pide desde el NAVEGADOR, no desde una Server Action.
 *
 * signInWithOtp guarda una cookie (el code verifier de PKCE). Si eso pasa
 * dentro de una Server Action, Next.js re-renderiza la página en el servidor
 * para reflejar la cookie nueva, el LoginScreen se vuelve a montar y se
 * pierde el estado que muestra el cartel de "Revisá tu email". Desde el
 * browser la cookie se guarda igual (la lee /auth/callback para canjear el
 * código) y no hay ningún re-render.
 */
function urlCallback(): string {
  // Mismo origen que antes (NEXT_PUBLIC_APP_URL), que es el que está en la
  // lista de redirects permitidos de Supabase. Fallback al origen actual.
  const base = (process.env.NEXT_PUBLIC_APP_URL || window.location.origin).replace(/\/+$/, "");
  return `${base}/auth/callback`;
}

/**
 * Si el usuario llegó al login desde "Conectar" en Claude / ChatGPT, se
 * recuerda a dónde volver en una cookie de corta duración: /auth/callback la
 * lee al confirmar el magic link. Va en cookie y no en la URL del magic link
 * para no tener que tocar la lista de redirects permitidos de Supabase (el
 * link tiene que abrirse en el mismo navegador de todas formas, por PKCE).
 */
function recordarVueltaOauth(nextOauth: string | null) {
  const seguro = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = nextOauth
    ? `${COOKIE_NEXT_OAUTH}=${encodeURIComponent(nextOauth)}; Path=/; Max-Age=3600; SameSite=Lax${seguro}`
    : `${COOKIE_NEXT_OAUTH}=; Path=/; Max-Age=0; SameSite=Lax${seguro}`;
}

export default function LoginGate({
  initialTab,
  inviteToken = null,
  esInvitacionEmpresa = false,
  organizacionInvita = null,
  initialError = null,
  nextOauth = null,
}: {
  initialTab?: "login" | "register";
  redirectTo?: string;
  inviteToken?: string | null;
  esInvitacionEmpresa?: boolean;
  organizacionInvita?: string | null;
  initialError?: string | null;
  nextOauth?: string | null;
}) {
  // shouldCreateUser: false — esta acción es solo para "ya tengo cuenta". Si
  // el email no existe, Supabase devuelve error en vez de crear una cuenta
  // fantasma sin nombre ni tipo elegido.
  async function handleLogin(email: string): Promise<string | null> {
    recordarVueltaOauth(nextOauth);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: false,
        emailRedirectTo: urlCallback(),
      },
    });

    if (error) {
      if (error.message?.toLowerCase().includes("signups not allowed")) {
        return "No encontramos una cuenta con ese email.";
      }
      return error.message || "No se pudo enviar el link de acceso.";
    }
    return null;
  }

  // shouldCreateUser: true — si el email ya tenía cuenta, Supabase le manda
  // el magic link a ESA cuenta (no duplica). Lo que el usuario tipeó viaja en
  // el metadata y se aplica en procesarPrimerIngreso() al confirmar el link.
  async function handleRegister(data: {
    nombre: string;
    email: string;
    tipoCuenta: "individual" | "empresa";
    nombreEmpresa?: string | null;
    inviteToken?: string | null;
  }): Promise<{ error: string | null }> {
    // Validación de dominio en el servidor (DNS). No toca cookies, así que
    // no dispara el re-render de la página.
    // Una cuenta nueva sigue su onboarding (conectar WhatsApp): no se la
    // manda a una pantalla de consentimiento que dejó a medias antes.
    recordarVueltaOauth(null);
    const dominioValido = await validarDominioEmailAction(data.email);
    if (!dominioValido) {
      return {
        error:
          "Ese email no parece existir — revisá que el dominio esté bien escrito.",
      };
    }

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: data.email,
      options: {
        shouldCreateUser: true,
        emailRedirectTo: urlCallback(),
        data: {
          nombre: data.nombre,
          tipo_cuenta: data.tipoCuenta,
          nombre_empresa: data.nombreEmpresa ?? null,
          invite_token: data.inviteToken ?? null,
        },
      },
    });

    if (error) {
      return { error: error.message || "No se pudo enviar el link de acceso." };
    }
    return { error: null };
  }

  return (
    <LoginScreen
      onLogin={handleLogin}
      onRegister={handleRegister}
      initialTab={initialTab}
      inviteToken={inviteToken}
      esInvitacionEmpresa={esInvitacionEmpresa}
      organizacionInvita={organizacionInvita}
      initialError={initialError}
      onTabChange={(next) => {
        window.history.replaceState(null, "", `/${next}`);
      }}
    />
  );
}
