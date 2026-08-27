import OpenAI from "openai";
import type { SupabaseClient } from "@supabase/supabase-js";

// =======================================================================
// EMBEDDINGS DE CONTACTOS
//
// Capa semántica de la búsqueda de contactos. Lo que se convierte en vector
// NO son los mensajes crudos de WhatsApp sino el análisis de IA que ya corre
// hoy sobre cada lead (producto_servicio, necesidad, resumen, keywords).
//
// El motivo es concreto: los mensajes reales promedian 21 caracteres
// ("voyyy", "sii tranquii", "dale"). Un embedding de 21 caracteres no
// codifica ninguna intención comercial — es ruido. El análisis, en cambio,
// ya tiene destilado qué busca cada contacto, que es exactamente lo que hay
// que poder consultar en lenguaje natural.
//
// La generación es perezosa e incremental: no hay cron ni cola. Antes de
// cada búsqueda se pide a la base qué leads tienen el embedding faltante o
// desactualizado (comparación por hash del texto fuente) y se generan solo
// esos, en UNA sola llamada a OpenAI. Si el análisis vuelve a correr y no
// cambia nada, el hash coincide y no se paga nada.
// =======================================================================

/** 1536 dimensiones, el tamaño que declara la columna vector() en la base. */
export const MODELO_EMBEDDING = "text-embedding-3-small";
export const DIMENSIONES_EMBEDDING = 1536;

/**
 * Tope de leads a embeber por búsqueda. Existe para que una cuenta con
 * muchos contactos sin procesar no convierta la primera búsqueda en una
 * espera larga: se procesan de a tandas, y las búsquedas siguientes van
 * completando el resto. La búsqueda funciona igual mientras tanto, apoyada
 * en las ramas de texto.
 */
const MAX_LEADS_POR_TANDA = 60;

interface LeadPendiente {
  lead_id: string;
  texto_fuente: string;
  fuente_hash: string;
}

/** Formato que espera pgvector para castear texto a vector: "[0.1,0.2,...]". */
function aLiteralVector(valores: number[]): string {
  return `[${valores.join(",")}]`;
}

/**
 * Genera embeddings para varios textos en una sola llamada. La API devuelve
 * los resultados con su índice, pero no garantiza el orden, así que se
 * reordena explícitamente en vez de confiar en la posición del array.
 */
export async function generarEmbeddings(
  openai: OpenAI,
  textos: string[],
): Promise<number[][]> {
  if (textos.length === 0) return [];

  const respuesta = await openai.embeddings.create({
    model: MODELO_EMBEDDING,
    input: textos,
  });

  const ordenados: number[][] = new Array(textos.length);
  for (const item of respuesta.data) {
    ordenados[item.index] = item.embedding;
  }
  return ordenados;
}

/** Genera el embedding de una consulta suelta (la que escribe el usuario). */
export async function generarEmbeddingConsulta(
  openai: OpenAI,
  consulta: string,
): Promise<string | null> {
  const texto = consulta.trim();
  if (!texto) return null;

  const [vector] = await generarEmbeddings(openai, [texto]);
  if (!vector || vector.length !== DIMENSIONES_EMBEDDING) return null;

  return aLiteralVector(vector);
}

/**
 * Pone al día los embeddings de los leads del tenant. Devuelve cuántos
 * generó. Nunca lanza: si algo falla (falta la API key, se cae OpenAI, se
 * agota la cuota), la búsqueda tiene que seguir andando con las ramas de
 * texto en vez de romperse entera.
 */
export async function sincronizarEmbeddingsLeads(
  openai: OpenAI,
  supabase: SupabaseClient,
  tenantId: string,
  limite: number = MAX_LEADS_POR_TANDA,
): Promise<{ generados: number; pendientes: number; error?: string }> {
  try {
    const { data, error } = await supabase.rpc("yamas_send_leads_embeddings_pendientes", {
      p_tenant_id: tenantId,
      p_limite: limite,
    });

    if (error) {
      console.error("[embeddings] No se pudieron leer los pendientes:", error.message);
      return { generados: 0, pendientes: 0, error: error.message };
    }

    const pendientes = (data ?? []) as LeadPendiente[];
    if (pendientes.length === 0) return { generados: 0, pendientes: 0 };

    const vectores = await generarEmbeddings(
      openai,
      pendientes.map((p) => p.texto_fuente),
    );

    let generados = 0;

    // En serie y no en paralelo a propósito: son a lo sumo 60 escrituras
    // chicas, y disparar 60 requests simultáneas al pooler de Supabase es
    // peor negocio que esperar unos milisegundos de más.
    for (let i = 0; i < pendientes.length; i++) {
      const vector = vectores[i];
      if (!vector || vector.length !== DIMENSIONES_EMBEDDING) continue;

      const { error: errorGuardado } = await supabase.rpc("yamas_send_guardar_lead_embedding", {
        p_lead_id: pendientes[i].lead_id,
        p_tenant_id: tenantId,
        p_embedding: aLiteralVector(vector),
        p_texto_fuente: pendientes[i].texto_fuente,
        p_fuente_hash: pendientes[i].fuente_hash,
        p_modelo: MODELO_EMBEDDING,
      });

      if (errorGuardado) {
        console.error("[embeddings] Error guardando embedding:", errorGuardado.message);
        continue;
      }
      generados++;
    }

    return { generados, pendientes: pendientes.length };
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : "error desconocido";
    console.error("[embeddings] Falló la sincronización:", mensaje);
    return { generados: 0, pendientes: 0, error: mensaje };
  }
}
