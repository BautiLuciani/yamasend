"use server";

import { createClient } from "@/lib/supabase/server";
import { assertPermiso, getCurrentMembership } from "@/lib/auth/permisos";
import { getDatosNegocioAction } from "@/lib/actions/profile";
import { saveListAction } from "@/lib/actions/write";
import {
  armarSugeridas,
  nombreDeLista,
  type CampanaSugerida,
  type Comprador,
  type LeadParaProducto,
  type TipoSugerida,
} from "@/lib/campanas/sugeridas";
import type { ContactList } from "@/lib/types";

/**
 * Campañas sugeridas (ver lib/campanas/sugeridas.ts para las reglas).
 *
 * Nada de esto envía mensajes. getCampanasSugeridasAction solo calcula;
 * crearAudienciaSugeridaAction arma la audiencia (yamas_send_listas) y la UI
 * abre el asistente de campañas para que el usuario revise el template y
 * confirme el envío.
 */

const TIPOS: TipoSugerida[] = ["inactivos_2_semanas", "por_producto", "mejores_compradores"];
const MAX_LEADS = 1000;

/** Lo que baja al navegador: sin los ids, que pueden ser cientos y no se usan allá. */
export type CampanaSugeridaVista = Omit<CampanaSugerida, "leadIds">;

interface FilaComprador {
  lead_id: string;
  nombre: string | null;
  compras: number;
  ultima_compra: string;
  ultima_campana_enviada_at: string | null;
}

async function calcular(
  tenantId: string,
  productoElegido?: string | null,
): Promise<{ sugeridas: CampanaSugerida[]; error: string | null }> {
  const supabase = await createClient();

  const [rpc, leadsRes, negocio] = await Promise.all([
    supabase.rpc("yamas_send_compradores_detectados"),
    supabase
      .from("yamas_send_leads")
      .select("id, nombre, producto_servicio, necesidad, keywords_detectados, ultima_campana_enviada_at")
      .eq("tenant_id", tenantId)
      .eq("activo", true)
      .limit(MAX_LEADS),
    getDatosNegocioAction(),
  ]);

  if (rpc.error || leadsRes.error) {
    console.error("[campañas sugeridas]", rpc.error ?? leadsRes.error);
    return { sugeridas: [], error: "No se pudieron calcular las campañas sugeridas." };
  }

  const compradores: Comprador[] = ((rpc.data ?? []) as FilaComprador[]).map((r) => ({
    leadId: r.lead_id,
    nombre: r.nombre,
    compras: r.compras,
    ultimaCompra: r.ultima_compra,
    ultimaCampanaEnviadaAt: r.ultima_campana_enviada_at,
  }));

  const leads: LeadParaProducto[] = (leadsRes.data ?? []).map((l) => ({
    id: l.id,
    nombre: l.nombre,
    productoServicio: l.producto_servicio,
    necesidad: l.necesidad,
    keywords: Array.isArray(l.keywords_detectados) ? (l.keywords_detectados as string[]) : [],
    ultimaCampanaEnviadaAt: l.ultima_campana_enviada_at,
  }));

  return {
    sugeridas: armarSugeridas({
      compradores,
      leads,
      productos: negocio?.productos ?? [],
      negocio: negocio?.nombreEmpresa ?? "",
      ahora: Date.now(),
      productoElegido,
    }),
    error: null,
  };
}

export async function getCampanasSugeridasAction(
  productoElegido?: string | null,
): Promise<{ sugeridas: CampanaSugeridaVista[]; error: string | null }> {
  const membership = await getCurrentMembership();
  if (!membership?.tenantId) return { sugeridas: [], error: null };

  // Antes de calcular, pone al día la etiqueta "cliente": crea los contactos que
  // compraron pero nunca escribieron, para que entren en estas audiencias.
  // Idempotente; solo si la persona puede importar contactos.
  if (membership.permisos.importar_contactos) {
    const supabase = await createClient();
    await supabase.rpc("yamas_send_clientes_sincronizar");
  }

  const { sugeridas, error } = await calcular(membership.tenantId, productoElegido);
  return {
    sugeridas: sugeridas.map(({ leadIds: _ids, ...resto }) => {
      void _ids;
      return resto;
    }),
    error,
  };
}

export interface CrearAudienciaSugeridaResult {
  lista: ContactList | null;
  nombreCampana: string;
  mensajeSugerido: string;
  nombreTemplate: string;
  cantidad: number;
  error: string | null;
}

/**
 * Arma (o actualiza) la audiencia de una campaña sugerida. Los ids se
 * recalculan acá, en el servidor: el cliente solo dice QUÉ campaña quiere.
 * Si ya existe una audiencia "Sugerida: …" se actualiza en vez de crear otra
 * cada vez que se toca el botón.
 */
export async function crearAudienciaSugeridaAction(
  tipo: TipoSugerida,
  producto?: string | null,
): Promise<CrearAudienciaSugeridaResult> {
  const vacio = (error: string): CrearAudienciaSugeridaResult => ({
    lista: null,
    nombreCampana: "",
    mensajeSugerido: "",
    nombreTemplate: "",
    cantidad: 0,
    error,
  });

  if (!TIPOS.includes(tipo)) return vacio("Campaña inválida.");

  const gate = await assertPermiso("crear_audiencias");
  if (!gate.ok || !gate.tenantId) return vacio(gate.error ?? "No tenés permiso para crear audiencias.");

  const { sugeridas, error } = await calcular(gate.tenantId, producto);
  if (error) return vacio(error);

  const sug = sugeridas.find((s) => s.tipo === tipo);
  if (!sug || !sug.disponible || sug.leadIds.length === 0) {
    return vacio(sug?.motivoNoDisponible ?? "Esta campaña todavía no tiene clientes.");
  }

  const nombreLista = nombreDeLista(tipo, sug.producto);
  const supabase = await createClient();

  const { data: existente } = await supabase
    .from("yamas_send_listas")
    .select("id, created_at")
    .eq("tenant_id", gate.tenantId)
    .eq("nombre", nombreLista)
    .limit(1)
    .maybeSingle();

  const ahora = new Date().toISOString();
  let listaId: string;
  let creada: string | null = ahora;

  if (existente?.id) {
    const { error: errUpdate } = await supabase
      .from("yamas_send_listas")
      .update({ contactos_ids: sug.leadIds, updated_at: ahora })
      .eq("id", existente.id)
      .eq("tenant_id", gate.tenantId);
    if (errUpdate) return vacio("No se pudo actualizar la audiencia.");
    listaId = existente.id;
    creada = existente.created_at ?? null;
  } else {
    const res = await saveListAction(nombreLista, sug.leadIds);
    if (res.error || !res.id) return vacio(res.error ?? "No se pudo crear la audiencia.");
    listaId = res.id;
  }

  const dd = new Date();
  const fecha = `${String(dd.getDate()).padStart(2, "0")}/${String(dd.getMonth() + 1).padStart(2, "0")}`;

  return {
    lista: {
      id: listaId,
      nombre: nombreLista,
      contactosIds: sug.leadIds,
      createdAt: creada,
      updatedAt: ahora,
    },
    nombreCampana: `${sug.titulo}${sug.producto ? `: ${sug.producto}` : ""} · ${fecha}`.slice(0, 100),
    mensajeSugerido: sug.mensajeSugerido,
    nombreTemplate: sug.nombreTemplate,
    cantidad: sug.cantidad,
    error: null,
  };
}
