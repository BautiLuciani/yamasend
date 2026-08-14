import type { Metadata } from "next";
import { Manrope, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`${manrope.variable} ${ibmPlexMono.variable} h-full antialiased`}
      data-theme="yamasend"
    >
      <body className="h-full flex flex-col overflow-hidden bg-ys-bg text-ys-text">
        {children}
      </body>
    </html>
  );
}
