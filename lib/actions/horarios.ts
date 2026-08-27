"use server";

import { createClient } from "@/lib/supabase/server";
import type { SugerenciaHorario } from "@/lib/types";

/**
 * Mínimos para que la sugerencia se muestre. Son deliberadamente
 * conservadores: recomendar un horario en base a tres envíos afortunados es
 * peor que no recomendar nada, porque el usuario programa campañas reales
 * confiando en el dato.
 *
 * MUESTRAS_TOTALES es cuántos mensajes tiene que haber enviado la cuenta en
 * total; POR_HORA es cuántos tiene que tener la franja ganadora para poder
 * ganar. La RPC además rankea por límite inferior de Wilson, así que una
 * hora con pocos envíos no puede subir por suerte.
 */
const MUESTRAS_TOTALES = 20;
const MUESTRAS_POR_HORA = 5;

interface FilaHorario {
  minimo_alcanzado: boolean;
  total_mensajes_analizados: number;
  mejor_hora_inicio: number | null;
  mejor_hora_fin: number | null;
  mejor_hora_enviados: number | null;
  mejor_hora_tasa_respuesta: number | null;
}

/**
 * Devuelve la mejor franja horaria para enviar, o null si todavía no hay
 * datos suficientes. Nunca lanza: es una mejora opcional de la experiencia,
 * así que si falla el wizard tiene que seguir funcionando igual sin la
 * sugerencia.
 */
export async function getSugerenciaHorarioAction(): Promise<SugerenciaHorario | null> {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    const { data: cliente } = await supabase
      .from("yamas_inmo_clientes")
      .select("tenant_id")
      .eq("auth_user_id", user.id)
      .maybeSingle();

    const tenantId = cliente?.tenant_id;
    if (!tenantId) return null;

    const { data, error } = await supabase
      .rpc("analytics_mejor_horario_envio", {
        p_tenant_id: tenantId,
        p_minimo_muestras: MUESTRAS_TOTALES,
        p_minimo_por_hora: MUESTRAS_POR_HORA,
      })
      .maybeSingle();

    if (error) {
      console.error("[horarios] Error consultando mejor horario:", error.message);
      return null;
    }

    const fila = data as FilaHorario | null;
    if (!fila || !fila.minimo_alcanzado || fila.mejor_hora_inicio == null) {
      return null;
    }

    return {
      horaInicio: fila.mejor_hora_inicio,
      horaFin: fila.mejor_hora_fin ?? fila.mejor_hora_inicio + 1,
      enviados: fila.mejor_hora_enviados ?? 0,
      tasaRespuesta: Number(fila.mejor_hora_tasa_respuesta ?? 0),
      totalAnalizados: fila.total_mensajes_analizados ?? 0,
    };
  } catch (e) {
    console.error("[horarios] Falló getSugerenciaHorarioAction:", e);
    return null;
  }
}
