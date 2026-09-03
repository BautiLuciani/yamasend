import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Default es 1MB. Los audios de voz del chat de IA (webm/opus o mp4/aac,
    // hasta unos pocos minutos) pueden superarlo — se sube a 10MB, todavía
    // bien por debajo del límite de 25MB de la API de transcripción de OpenAI.
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
