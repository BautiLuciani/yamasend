"use server";

import OpenAI from "openai";
import { toFile } from "openai/uploads";
import { createClient } from "@/lib/supabase/server";

/**
 * Transcripción de audio para los chats de IA (cuenta individual, empleado
 * y empresa). Deliberadamente separada de ia.ts y empresa_ia.ts: no sabe
 * nada del agente ni de flujos, solo convierte voz a texto. El texto
 * resultante se manda a sendIAMessageAction / sendEmpresaIAMessageAction
 * exactamente igual que si el usuario lo hubiera tipeado — el agente no
 * distingue el origen.
 *
 * Gate de auth: alcanza con sesión válida (no hace falta assertPermiso acá,
 * porque esta acción no lee ni escribe nada del negocio — solo le pega a
 * OpenAI con el audio y devuelve texto). El gate real de qué puede hacer
 * ese texto ya lo hace sendIAMessageAction / sendEmpresaIAMessageAction
 * cuando se les pasa el resultado.
 */

function getOpenAI(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Falta configurar OPENAI_API_KEY en las variables de entorno del proyecto.",
    );
  }
  return new OpenAI({ apiKey });
}

// Tope de duración implícito vía tamaño: un audio de voz comprimido (opus/aac)
// de hasta ~3 minutos entra cómodo bajo este límite. Es más chico que el
// límite real de OpenAI (25MB) a propósito, para frenar el archivo antes de
// que salga del navegador si algo se rompe (ej: grabación que no cortó).
const MAX_AUDIO_BYTES = 8 * 1024 * 1024; // 8MB

export interface TranscribirAudioResult {
  texto: string | null;
  error: string | null;
}

export async function transcribirAudioIAAction(
  formData: FormData,
): Promise<TranscribirAudioResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { texto: null, error: "Tu sesión expiró. Recargá la página." };
  }

  const audio = formData.get("audio");
  if (!(audio instanceof Blob) || audio.size === 0) {
    return { texto: null, error: "No se recibió el audio." };
  }
  if (audio.size > MAX_AUDIO_BYTES) {
    return {
      texto: null,
      error: "El audio es muy largo. Probá con un mensaje más corto.",
    };
  }

  try {
    const openai = getOpenAI();
    // El navegador manda el blob con su propio mimeType (webm/opus en
    // Chrome y Firefox, mp4/aac en Safari e iOS) — toFile lo preserva para
    // que OpenAI sepa cómo decodificarlo, sin necesidad de convertir nada
    // del lado del servidor.
    const mimeType = audio.type || "audio/webm";
    const extension = mimeType.includes("mp4") ? "mp4" : "webm";
    const archivo = await toFile(audio, `audio.${extension}`, {
      type: mimeType,
    });

    const transcripcion = await openai.audio.transcriptions.create({
      file: archivo,
      model: "gpt-4o-transcribe",
      language: "es",
    });

    const texto = transcripcion.text?.trim();
    if (!texto) {
      return {
        texto: null,
        error: "No se entendió el audio. Probá de nuevo.",
      };
    }

    return { texto, error: null };
  } catch (e) {
    console.error("[IA Audio] Error transcribiendo:", e);
    return {
      texto: null,
      error: "No pude procesar el audio. Probá de nuevo.",
    };
  }
}
