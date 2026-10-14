import type { Metadata } from "next";
import { Manrope, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/yamasend/ThemeContext";
import { LangProvider } from "@/components/yamasend/LangContext";
import { TEMA_OSCURO_HABILITADO } from "@/lib/tema";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-ibm-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "YamaSend — Mensajería masiva por IA",
  description: "YamaSend — AI mass messaging para WhatsApp Business",
};

// Se ejecuta antes del primer paint para evitar el flash de tema claro
// cuando el usuario ya tenía guardada la preferencia oscura. Con el tema
// oscuro deshabilitado (lib/tema.ts) no se inyecta: la app queda en claro.
const THEME_INIT_SCRIPT = `
(function () {
  try {
    var stored = localStorage.getItem('yamasend-theme');
    var theme = stored === 'dark' || stored === 'light'
      ? stored
      : (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    if (theme === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
    }
  } catch (e) {}
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`${manrope.variable} ${ibmPlexMono.variable} h-full antialiased`}
    >
      <head>
        {TEMA_OSCURO_HABILITADO && (
          <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        )}
      </head>
      <body className="h-full flex flex-col overflow-hidden bg-ys-bg text-ys-text">
        <ThemeProvider>
          <LangProvider>{children}</LangProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
