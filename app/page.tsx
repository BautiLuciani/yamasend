import type { Metadata } from "next";
import Landing from "@/components/yamasend/Landing";

export const metadata: Metadata = {
  title: "YamaSend — Mensajería masiva por WhatsApp con IA",
  description:
    "Creá campañas, organizá tus contactos y aprovechá la inteligencia artificial para comunicarte mejor por WhatsApp, todo desde un solo lugar.",
  openGraph: {
    title: "YamaSend — Mensajería masiva por WhatsApp con IA",
    description:
      "Creá campañas, organizá tus contactos y aprovechá la inteligencia artificial para comunicarte mejor por WhatsApp, todo desde un solo lugar.",
    url: "/",
    siteName: "YamaSend",
    locale: "es_AR",
    type: "website",
  },
  alternates: {
    canonical: "/",
  },
};

export default function Home() {
  return <Landing />;
}
