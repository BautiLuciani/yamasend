"use server";

import OpenAI from "openai";
import { getCurrentMembership } from "@/lib/auth/permisos";
import {
  getEmpresaAudienciasAction,
  getEmpresaCampanasAction,
  getEmpresaDashboardAction,
  getEmpresaEmpleadosAction,
  getEmpresaTemplatesAction,
} from "./empresa";

/**
 * Agente de IA de la consola de empresa.
 *
 * Deliberadamente separado del agente del empleado (lib/actions/ia.ts, ~3800
 * líneas). Ese es una máquina de estados para CREAR recursos; la empresa no
 * crea nada, solo consulta. Reusarlo sería darle capacidad de escritura por
 * la puerta de atrás.
 *
 * Este agente no tiene herramientas ni ejecuta acciones: recibe un snapshot
 * de datos ya filtrados por las funciones yamas_send_empresa_* y responde
 * sobre eso. No puede tocar nada aunque el modelo lo intente.
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

// Topes al armar el snapshot. Sin esto, una empresa con 40 empleados y años
// de historial armaría un prompt gigante, caro y peor: el modelo se pierde
// entre tanto dato y responde peor que con un recorte reciente.
const MAX_CAMPANAS = 60;
const MAX_TEMPLATES = 40;
const MAX_AUDIENCIAS = 40;

export interface EmpresaIAMensaje {
  rol: "user" | "assistant";
  texto: string;
}

export interface EmpresaIAResponse {
  texto: string;
  error: string | null;
}

/**
 * Arma el contexto que ve el modelo.
 *
 * Todo sale de las mismas funciones que alimentan la UI, así que hereda sus
 * límites de privacidad: NO hay resúmenes de conversaciones, ni temperatura,
 * ni keywords. Y los contactos entran solo como conteos — la empresa puede
 * ver nombre y teléfono en su sección, pero volcarle miles de contactos al
 * prompt no aporta al análisis y multiplicaría la exposición de datos.
 */
async function armarSnapshot(): Promise<string> {
  const [stats, empleados, campanas, templates, audiencias] = await Promise.all([
    getEmpresaDashboardAction(),
    getEmpresaEmpleadosAction(),
    getEmpresaCampanasAction(null),
    getEmpresaTemplatesAction(null),
    getEmpresaAudienciasAction(null),
  ]);

  const partes: string[] = [];

  if (stats) {
    partes.push(
      `RESUMEN DEL EQUIPO
- Empleados: ${stats.empleadosActivos} activos de ${stats.empleadosTotal} (${stats.empleadosPendientes} esperando aprobación)
- Contactos totales: ${stats.contactosTotal}
- Audiencias: ${stats.audienciasTotal}
- Templates: ${stats.templatesTotal} (${stats.templatesAprobados} aprobados por Meta)
- Campañas: ${stats.campanasTotal} (${stats.campanasEnviadas} enviadas)
- Mensajes enviados: ${stats.mensajesEnviados}, leídos: ${stats.mensajesLeidos}
- Créditos: ${stats.creditosPool} en el pool, ${stats.creditosAsignados} repartidos entre empleados`,
    );
  }

  if (empleados.length > 0) {
    partes.push(
      "EMPLEADOS\n" +
        empleados
          .map((e) => {
            const restringidos = Object.entries(e.permisos)
              .filter(([, v]) => !v)
              .map(([k]) => k);
            return `- ${e.nombre} | estado: ${e.estado} | WhatsApp: ${
              e.whatsappConfigurado ? "configurado" : "SIN CONFIGURAR (no puede enviar)"
            } | contactos: ${e.contactosCount} | audiencias: ${e.audienciasCount} | templates: ${e.templatesCount} | campañas enviadas: ${e.campanasEnviadas} | mensajes ok: ${e.mensajesOk}, con error: ${e.mensajesError}, leídos: ${e.mensajesLeidos} | créditos disponibles: ${e.creditosSaldo} (usados: ${e.creditosUsados})${
              restringidos.length > 0
                ? ` | permisos SIN habilitar: ${restringidos.join(", ")}`
                : " | todos los permisos habilitados"
            }`;
          })
          .join("\n"),
    );
  }

  if (campanas.length > 0) {
    partes.push(
      `CAMPAÑAS (últimas ${Math.min(campanas.length, MAX_CAMPANAS)})\n` +
        campanas
          .slice(0, MAX_CAMPANAS)
          .map(
            (c) =>
              `- "${c.nombre}" | de: ${c.empleadoNombre} | estado: ${c.status} | destinatarios: ${c.contactosCount} | enviados: ${c.mensajesOk} | leídos: ${c.mensajesLeidos} | errores: ${c.mensajesError} | audiencia: ${c.listaNombre ?? "—"} | template: ${c.templateNombre ?? "—"} | fecha: ${c.enviadoAt ?? c.fechaProgramada ?? c.createdAt ?? "—"}`,
          )
          .join("\n"),
    );
  }

  if (templates.length > 0) {
    partes.push(
      `TEMPLATES (últimos ${Math.min(templates.length, MAX_TEMPLATES)})\n` +
        templates
          .slice(0, MAX_TEMPLATES)
          .map(
            (t) =>
              `- "${t.nombre}" | de: ${t.empleadoNombre} | estado: ${t.status}${
                t.rechazoMotivo ? ` | motivo de rechazo: ${t.rechazoMotivo}` : ""
              }`,
          )
          .join("\n"),
    );
  }

  if (audiencias.length > 0) {
    partes.push(
      `AUDIENCIAS (últimas ${Math.min(audiencias.length, MAX_AUDIENCIAS)})\n` +
        audiencias
          .slice(0, MAX_AUDIENCIAS)
          .map(
            (a) =>
              `- "${a.nombre}" | de: ${a.empleadoNombre} | contactos: ${a.contactosCount}`,
          )
          .join("\n"),
    );
  }

  return partes.join("\n\n");
}

const SYSTEM_PROMPT = `Sos el asistente de análisis de YamaSend para una cuenta de EMPRESA.

Quien te habla es el dueño o gerente de una empresa que tiene varios vendedores usando YamaSend, cada uno con su propio WhatsApp Business. Tu trabajo es ayudarlo a entender qué está pasando con su equipo.

QUÉ PODÉS HACER
- Comparar el rendimiento entre empleados.
- Analizar campañas: alcance, tasa de lectura, errores.
- Detectar problemas: empleados sin WhatsApp configurado, templates rechazados por Meta, gente sin créditos, campañas con muchos errores.
- Sugerir en qué enfocarse y explicar el porqué.

REGLAS
- Respondé SIEMPRE en español rioplatense, informal pero profesional. Usá "vos".
- Basate ÚNICAMENTE en los datos que te paso abajo. Si algo no está, decí que no tenés ese dato. NUNCA inventes números, nombres ni fechas.
- Cuando cites una métrica, usá el número exacto del contexto.
- Sé breve y concreto. Nada de párrafos largos ni relleno. Si una tabla o lista corta se entiende mejor, usala.
- No tenés acceso a las conversaciones de WhatsApp ni al análisis de los contactos: eso es privado de cada vendedor. Si te lo piden, explicá que por privacidad no está disponible.
- No podés crear, editar ni enviar nada. Si te piden una acción, aclarale que la cuenta de empresa es de solo lectura y que la acción la tiene que hacer el vendedor desde su cuenta.
- Si el equipo todavía no tiene datos suficientes, decilo con franqueza en vez de forzar un análisis.`;

export async function sendEmpresaIAMessageAction(
  mensaje: string,
  historial: EmpresaIAMensaje[],
): Promise<EmpresaIAResponse> {
  const membership = await getCurrentMembership();
  if (
    !membership ||
    membership.estado !== "activo" ||
    (membership.rol !== "empresa" && membership.rol !== "admin")
  ) {
    return { texto: "", error: "No tenés permiso para usar esta sección." };
  }

  if (!mensaje.trim()) {
    return { texto: "", error: "Escribí una consulta." };
  }

  try {
    const snapshot = await armarSnapshot();

    if (!snapshot.trim()) {
      return {
        texto:
          "Todavía no tengo datos de tu equipo para analizar. En cuanto tus empleados empiecen a cargar contactos y mandar campañas, vas a poder consultarme acá.",
        error: null,
      };
    }

    const openai = getOpenAI();

    // Solo los últimos turnos: el snapshot ya ocupa bastante y el historial
    // viejo aporta poco en consultas analíticas, que suelen ser autocontenidas.
    const recientes = historial.slice(-8);

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.3,
      max_tokens: 700,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "system",
          content: `DATOS ACTUALES DE LA EMPRESA\n\n${snapshot}`,
        },
        ...recientes.map((m) => ({
          role: m.rol,
          content: m.texto,
        })),
        { role: "user" as const, content: mensaje },
      ],
    });

    const texto = completion.choices[0]?.message?.content?.trim();
    if (!texto) {
      return { texto: "", error: "No pude generar una respuesta. Probá de nuevo." };
    }

    return { texto, error: null };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error desconocido";
    return {
      texto: "",
      error: msg.includes("OPENAI_API_KEY")
        ? "El asistente no está configurado. Avisale al equipo de YamaSend."
        : "No pude procesar la consulta. Probá de nuevo en un momento.",
    };
  }
}
