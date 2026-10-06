"use server";

import { assertPermiso } from "@/lib/auth/permisos";
import {
  deleteListAction,
  saveTemplateDraftAction,
  sendTemplateToMetaAction,
} from "@/lib/actions/write";
import { CATEGORIA_TEMPLATE_UNICA, validarVariablesTemplate } from "@/lib/templates/config";
import { IA_FLOW_IDLE } from "@/lib/types";
import type { IAFlowState } from "@/lib/types";
import type { IAResponse } from "@/lib/actions/ia";

/**
 * Acciones de las tarjetas del chat para audiencias automáticas y templates
 * por producto (oct 2026). La lógica de negocio es la de siempre
 * (deleteListAction, sendTemplateToMetaAction, saveTemplateDraftAction):
 * acá solo se valida y se orquesta.
 */

/** Memoria de la charla que hay que conservar al volver a idle. */
function memoriaQueSigue(draft: IAFlowState["draft"]): IAFlowState["draft"] {
  const { ultimaListaContactos, productosDetectados, audienciasProducto } = draft;
  return {
    ...(ultimaListaContactos ? { ultimaListaContactos } : {}),
    ...(productosDetectados ? { productosDetectados } : {}),
    ...(audienciasProducto ? { audienciasProducto } : {}),
  };
}

/**
 * "Deshacer" de una audiencia que la IA creó directo (o de varias, las de
 * producto). Usa deleteListAction, que valida permiso y tenant.
 */
export async function deshacerAudienciasIAAction(
  audienciaIds: string[],
): Promise<{ eliminadas: number; error: string | null }> {
  const ids = Array.from(new Set(audienciaIds.filter((v) => typeof v === "string" && v))).slice(0, 20);
  if (ids.length === 0) return { eliminadas: 0, error: "No hay audiencias para deshacer." };

  let eliminadas = 0;
  let ultimoError: string | null = null;
  for (const id of ids) {
    const r = await deleteListAction(id);
    if (r.error) ultimoError = r.error;
    else eliminadas++;
  }
  return { eliminadas, error: eliminadas === 0 ? ultimoError ?? "No se pudo deshacer." : null };
}

/**
 * Envía a Meta (o guarda como borradores) los templates por producto que
 * generó la IA, con las ediciones que haya hecho el usuario en la tarjeta.
 * Solo acepta templates que estén en el draft de la charla (los nombres no
 * los puede inventar el cliente), y cada contenido se revalida.
 */
export async function enviarTemplatesProductoAction(
  flowState: IAFlowState,
  ediciones: { nombre: string; contenido: string }[],
  modo: "meta" | "borrador",
  iaConversacionId?: string | null,
): Promise<IAResponse> {
  const memoria = memoriaQueSigue(flowState.draft);
  const propuestos = flowState.draft.templatesProducto ?? [];
  if (propuestos.length === 0) {
    return {
      text: "Se perdió el contexto de los templates que estabas armando. Pedímelos de nuevo y te los vuelvo a generar.",
      flowState: { ...IA_FLOW_IDLE, draft: memoria },
    };
  }

  const gate = await assertPermiso(modo === "meta" ? "enviar_templates_meta" : "crear_templates");
  if (!gate.ok) {
    return { text: gate.error ?? "No tenés permiso para hacer eso.", flowState: { ...IA_FLOW_IDLE, draft: memoria } };
  }

  const elegidos = ediciones
    .map((e) => {
      const base = propuestos.find((p) => p.nombre === e.nombre);
      return base ? { ...base, contenido: String(e.contenido ?? "").trim() } : null;
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  if (elegidos.length === 0) {
    return {
      text: "No quedó ningún template para enviar.",
      flowState: { ...IA_FLOW_IDLE, draft: { ...memoria, templatesProducto: propuestos } },
    };
  }

  const resultados: { producto: string; nombre: string; ok: boolean; error: string | null }[] = [];
  // Secuencial: el workflow de n8n es compartido y son pocos templates.
  for (const t of elegidos) {
    if (t.contenido.length < 10 || t.contenido.length > 1024) {
      resultados.push({ producto: t.producto, nombre: t.nombre, ok: false, error: "El mensaje tiene que tener entre 10 y 1024 caracteres." });
      continue;
    }
    const errVars = validarVariablesTemplate(t.contenido);
    if (errVars) {
      resultados.push({ producto: t.producto, nombre: t.nombre, ok: false, error: errVars });
      continue;
    }
    if (modo === "meta") {
      const r = await sendTemplateToMetaAction(t.nombre, t.contenido, CATEGORIA_TEMPLATE_UNICA, iaConversacionId ?? null);
      resultados.push({ producto: t.producto, nombre: t.nombre, ok: r.ok, error: r.ok ? null : r.error });
    } else {
      const r = await saveTemplateDraftAction(t.nombre, t.contenido, CATEGORIA_TEMPLATE_UNICA);
      resultados.push({ producto: t.producto, nombre: t.nombre, ok: !r.error, error: r.error });
    }
  }

  const ok = resultados.filter((r) => r.ok).length;
  const fallidos = resultados.length - ok;
  const texto =
    modo === "meta"
      ? ok > 0
        ? `Listo, mandé ${ok} template${ok === 1 ? "" : "s"} a aprobación de Meta${fallidos ? ` (${fallidos} no se pudo${fallidos === 1 ? "" : "ieron"} mandar, abajo te digo por qué)` : ""}. Quedan "En revisión": Meta suele tardar de minutos a unas horas y te aviso por acá apenas respondan. Después armamos la campaña de cada audiencia con su template.`
        : "No pude mandar los templates a Meta. Abajo te dejo el motivo de cada uno."
      : ok > 0
        ? `Listo, guardé ${ok} template${ok === 1 ? "" : "s"} como borrador${ok === 1 ? "" : "es"}. Los encontrás en Templates para mandarlos a Meta cuando quieras.${fallidos ? ` ${fallidos} no se pudo${fallidos === 1 ? "" : "ieron"} guardar.` : ""}`
        : "No pude guardar los templates. Abajo te dejo el motivo de cada uno.";

  // Los que fallaron quedan en el draft para poder reintentar.
  const pendientes = propuestos.filter((p) => resultados.some((r) => r.nombre === p.nombre && !r.ok));
  return {
    text: texto,
    payload: { kind: "templates_producto_resultado", resultado: modo === "meta" ? "enviado" : "borrador", items: resultados },
    flowState: {
      ...IA_FLOW_IDLE,
      draft: { ...memoria, ...(pendientes.length ? { templatesProducto: pendientes } : {}) },
    },
  };
}
