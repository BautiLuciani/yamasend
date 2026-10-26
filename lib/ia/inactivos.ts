import type { SupabaseClient } from "@supabase/supabase-js";
import { coincideConProducto, palabrasDeProducto } from "@/lib/campanas/sugeridas";
import { bloqueadoPorMarketing, cargarEntrantesRecientes, type EntrantesRecientes } from "@/lib/campanas/frecuencia";

/**
 * Inactivos por producto y alcance por presupuesto, para el Asistente.
 *
 * YamaSend no tiene registro de ventas: todo se infiere de los mensajes.
 *   - "Habló de un producto": un mensaje (del cliente o del dueño) lo nombra.
 *   - "Compró": el dueño confirmó una compra o un pago por WhatsApp
 *     (yamas_send_compradores_detectados).
 *   - "No compra hace N días": sin confirmación de compra en los últimos N días.
 *
 * Lógica de lectura: no envía ni escribe nada.
 */

const DIA_MS = 24 * 60 * 60 * 1000;
const VENTANA_MENSAJES_DIAS = 365;
const MAX_MENSAJES = 4000;
const MAX_LEADS = 5000;

export interface ContactoInactivo {
  telefono: string;
  nombre: string | null;
  /** Productos pedidos que aparecen en sus mensajes. */
  productos: string[];
  /** Última vez que se habló de alguno de ellos (ISO). */
  ultimaMencion: string;
  /** Última compra confirmada por el dueño (ISO) o null si nunca se detectó. */
  ultimaCompra: string | null;
  compras: number;
}

export interface ResultadoInactivos {
  contactos: ContactoInactivo[];
  /** Contactos que hablaron de esos productos, antes de filtrar por compra. */
  mencionaron: number;
  /** Se descartaron porque compraron dentro de la ventana. */
  conCompraReciente: number;
  /** Se descartaron por haber recibido una campaña hace pocos días. */
  conCampanaReciente: number;
  /** El negocio no tiene ninguna compra detectada en sus chats. */
  sinComprasDetectadas: boolean;
}

/**
 * Convierte un monto en pesos escrito de cualquier forma a número:
 * "$ 50,000", "50.000", "50000", "50k", "50 lucas", "$50 mil".
 */
export function parsearPesos(valor: unknown): number | null {
  if (typeof valor === "number") return Number.isFinite(valor) && valor > 0 ? Math.round(valor) : null;
  if (typeof valor !== "string") return null;
  let t = valor.toLowerCase().replace(/[$\s]|ars|pesos?/g, "");
  let mult = 1;
  if (/(k|lucas?|mil)$/.test(t)) {
    mult = 1000;
    t = t.replace(/(k|lucas?|mil)$/, "");
  }
  // "50.000" o "50,000" son miles; "1.500,50" es decimal argentino.
  if (/^\d{1,3}([.,]\d{3})+$/.test(t)) t = t.replace(/[.,]/g, "");
  else t = t.replace(/\./g, "").replace(",", ".");
  const n = Number(t) * mult;
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

interface FilaLead {
  id: string;
  nombre: string | null;
  telefono: string | null;
  lid: string | null;
  ultima_campana_enviada_at: string | null;
}

interface FilaMensaje {
  telefono: string | null;
  lid: string | null;
  contenido: string | null;
  fecha: string;
  enviado_por_mi?: boolean | null;
}

interface FilaComprador {
  lead_id: string;
  compras: number;
  ultima_compra: string;
}

export async function buscarInactivosPorProducto(opts: {
  supabase: SupabaseClient;
  tenantId: string;
  productos: string[];
  dias: number;
  ahora?: number;
}): Promise<ResultadoInactivos> {
  const { supabase, tenantId } = opts;
  const ahora = opts.ahora ?? Date.now();
  // dias = 0 → sin filtro de compra.
  const dias = opts.dias <= 0 ? 0 : Math.max(1, Math.round(opts.dias));
  const productos = opts.productos.map((p) => p.trim()).filter(Boolean);

  const desde = new Date(ahora - VENTANA_MENSAJES_DIAS * DIA_MS).toISOString();

  const [leadsRes, comprasRes, mensajes, entrantes] = await Promise.all([
    supabase
      .from("yamas_send_leads")
      .select("id, nombre, telefono, lid, ultima_campana_enviada_at")
      .eq("tenant_id", tenantId)
      .eq("activo", true)
      .limit(MAX_LEADS),
    supabase.rpc("yamas_send_compradores_detectados"),
    cargarMensajes(supabase, tenantId, productos, desde),
    cargarEntrantesRecientes(supabase, tenantId, ahora),
  ]);

  const leads = (leadsRes.data ?? []) as FilaLead[];
  const compras = new Map<string, FilaComprador>();
  for (const c of (comprasRes.data ?? []) as FilaComprador[]) compras.set(c.lead_id, c);

  const porTelefono = new Map<string, FilaLead>();
  const porLid = new Map<string, FilaLead>();
  for (const l of leads) {
    if (l.telefono) porTelefono.set(l.telefono, l);
    if (l.lid) porLid.set(l.lid, l);
  }

  // Palabras de cada producto pedido.
  const palabras = productos.map((p) => ({ nombre: p, palabras: palabrasDeProducto(p) }));

  // leadId -> productos mencionados y última mención.
  const menciones = new Map<string, { productos: Set<string>; ultima: string }>();
  for (const m of mensajes) {
    const lead = (m.telefono && porTelefono.get(m.telefono)) || (m.lid && porLid.get(m.lid)) || null;
    if (!lead || !m.contenido) continue;
    for (const p of palabras) {
      // Un producto de una sola palabra corta ("A") no se puede inferir de forma
      // segura: se compara por la cadena completa.
      const coincide =
        p.palabras.length > 0
          ? coincideConProducto(m.contenido, p.palabras)
          : m.contenido.toLowerCase().includes(p.nombre.toLowerCase());
      if (!coincide) continue;
      const e = menciones.get(lead.id) ?? { productos: new Set<string>(), ultima: m.fecha };
      e.productos.add(p.nombre);
      if (m.fecha > e.ultima) e.ultima = m.fecha;
      menciones.set(lead.id, e);
    }
  }

  const limiteCompra = ahora - dias * DIA_MS;
  let conCompraReciente = 0;
  let conCampanaReciente = 0;
  const contactos: ContactoInactivo[] = [];

  for (const [leadId, e] of menciones) {
    const lead = leads.find((l) => l.id === leadId);
    if (!lead?.telefono) continue;
    const compra = compras.get(leadId) ?? null;
    if (dias > 0 && compra && new Date(compra.ultima_compra).getTime() > limiteCompra) {
      conCompraReciente++;
      continue;
    }
    if (bloqueadoPorMarketing({ telefono: lead.telefono, lid: lead.lid, ultimaCampanaEnviadaAt: lead.ultima_campana_enviada_at }, entrantes, ahora)) {
      conCampanaReciente++;
      continue;
    }
    contactos.push({
      telefono: lead.telefono,
      nombre: lead.nombre,
      productos: [...e.productos],
      ultimaMencion: e.ultima,
      ultimaCompra: compra?.ultima_compra ?? null,
      compras: compra?.compras ?? 0,
    });
  }

  contactos.sort((a, b) => b.compras - a.compras || b.ultimaMencion.localeCompare(a.ultimaMencion));

  return {
    contactos,
    mencionaron: menciones.size,
    conCompraReciente,
    conCampanaReciente,
    sinComprasDetectadas: compras.size === 0,
  };
}

/** Mensajes que nombran alguna palabra de los productos pedidos. */
async function cargarMensajes(
  supabase: SupabaseClient,
  tenantId: string,
  productos: string[],
  desde: string,
): Promise<FilaMensaje[]> {
  const terminos = new Set<string>();
  for (const p of productos) {
    const ps = palabrasDeProducto(p);
    if (ps.length > 0) for (const w of ps) terminos.add(w);
    else terminos.add(p.toLowerCase());
  }
  if (terminos.size === 0) return [];
  // ilike con comodín; se escapan los caracteres que rompen el filtro.
  const filtro = [...terminos]
    .slice(0, 12)
    .map((t) => `contenido.ilike.%${t.replace(/[%,()*]/g, " ").trim()}%`)
    .join(",");
  const { data } = await supabase
    .from("yamas_send_mensajes_historico")
    .select("telefono, lid, contenido, fecha, enviado_por_mi")
    .eq("tenant_id", tenantId)
    .gte("fecha", desde)
    .or(filtro)
    .order("fecha", { ascending: false })
    .limit(MAX_MENSAJES);
  return (data ?? []) as FilaMensaje[];
}

/**
 * Reactivación sin producto: quienes compraron alguna vez (confirmación del
 * dueño) y no compran hace más de N días, los de más compras primero.
 */
export async function buscarReactivacion(opts: {
  supabase: SupabaseClient;
  tenantId: string;
  dias: number;
  ahora?: number;
}): Promise<{ contactos: ContactoInactivo[]; conCampanaReciente: number; sinComprasDetectadas: boolean }> {
  const { supabase, tenantId } = opts;
  const ahora = opts.ahora ?? Date.now();
  const limite = ahora - Math.max(1, Math.round(opts.dias)) * DIA_MS;

  const entrantes: EntrantesRecientes = await cargarEntrantesRecientes(supabase, tenantId, ahora);
  const { data } = await supabase.rpc("yamas_send_compradores_detectados");
  const filas = (data ?? []) as {
    lead_id: string;
    nombre: string | null;
    telefono?: string | null;
    compras: number;
    ultima_compra: string;
    ultima_campana_enviada_at: string | null;
  }[];

  // La RPC no siempre devuelve el teléfono: se completa desde los leads.
  const ids = filas.map((f) => f.lead_id);
  const telefonos = new Map<string, string>();
  if (ids.length > 0) {
    const { data: leads } = await supabase
      .from("yamas_send_leads")
      .select("id, telefono")
      .eq("tenant_id", tenantId)
      .in("id", ids.slice(0, 1000));
    for (const l of (leads ?? []) as { id: string; telefono: string | null }[]) {
      if (l.telefono) telefonos.set(l.id, l.telefono);
    }
  }

  let conCampanaReciente = 0;
  const contactos: ContactoInactivo[] = [];
  for (const f of filas) {
    if (new Date(f.ultima_compra).getTime() > limite) continue;
    const tel = f.telefono ?? telefonos.get(f.lead_id);
    if (!tel) continue;
    if (bloqueadoPorMarketing({ telefono: tel, ultimaCampanaEnviadaAt: f.ultima_campana_enviada_at }, entrantes, ahora)) {
      conCampanaReciente++;
      continue;
    }
    contactos.push({
      telefono: tel,
      nombre: f.nombre,
      productos: [],
      ultimaMencion: f.ultima_compra,
      ultimaCompra: f.ultima_compra,
      compras: f.compras,
    });
  }
  contactos.sort((a, b) => b.compras - a.compras || b.ultimaCompra!.localeCompare(a.ultimaCompra!));
  return { contactos, conCampanaReciente, sinComprasDetectadas: filas.length === 0 };
}

const PALABRAS_PRECIO = /\b(precio|precios|cu[aá]nto|cuanto|sale|cuesta|valor|descuento|oferta|promo|promoci[oó]n|cuotas)\b/i;

export interface ContactoAfin {
  telefono: string;
  nombre: string | null;
  puntaje: number;
  motivo: string;
  ultimaMencion: string;
}

/**
 * A quién recomendarle un producto: clientes que lo nombraron ellos mismos
 * (más fuerte si preguntaron precio o es reciente). Se excluye a quien
 * compró en los últimos `diasCompra` días (ya lo tiene) y a quien recibió una
 * campaña hace menos de DIAS_SIN_CAMPANA.
 */
export async function recomendarParaProducto(opts: {
  supabase: SupabaseClient;
  tenantId: string;
  producto: string;
  diasCompra?: number;
  ahora?: number;
}): Promise<{ contactos: ContactoAfin[]; mencionaron: number; yaCompraron: number; conCampanaReciente: number }> {
  const { supabase, tenantId } = opts;
  const ahora = opts.ahora ?? Date.now();
  const diasCompra = opts.diasCompra ?? 30;
  const producto = opts.producto.trim();
  if (!producto) return { contactos: [], mencionaron: 0, yaCompraron: 0, conCampanaReciente: 0 };

  const desde = new Date(ahora - VENTANA_MENSAJES_DIAS * DIA_MS).toISOString();
  const [leadsRes, comprasRes, mensajes, entrantes] = await Promise.all([
    supabase
      .from("yamas_send_leads")
      .select("id, nombre, telefono, lid, ultima_campana_enviada_at")
      .eq("tenant_id", tenantId)
      .eq("activo", true)
      .limit(MAX_LEADS),
    supabase.rpc("yamas_send_compradores_detectados"),
    cargarMensajes(supabase, tenantId, [producto], desde),
    cargarEntrantesRecientes(supabase, tenantId, ahora),
  ]);
  const leads = (leadsRes.data ?? []) as FilaLead[];
  const compras = new Map<string, FilaComprador>();
  for (const c of (comprasRes.data ?? []) as FilaComprador[]) compras.set(c.lead_id, c);
  const porTelefono = new Map<string, FilaLead>();
  const porLid = new Map<string, FilaLead>();
  for (const l of leads) {
    if (l.telefono) porTelefono.set(l.telefono, l);
    if (l.lid) porLid.set(l.lid, l);
  }

  const palabras = palabrasDeProducto(producto);
  const acum = new Map<string, { puntaje: number; precio: boolean; cliente: boolean; ultima: string }>();
  for (const m of mensajes) {
    const lead = (m.telefono && porTelefono.get(m.telefono)) || (m.lid && porLid.get(m.lid)) || null;
    if (!lead || !m.contenido) continue;
    const coincide =
      palabras.length > 0 ? coincideConProducto(m.contenido, palabras) : m.contenido.toLowerCase().includes(producto.toLowerCase());
    if (!coincide) continue;
    const delCliente = !m.enviado_por_mi;
    const e = acum.get(lead.id) ?? { puntaje: 0, precio: false, cliente: false, ultima: m.fecha };
    e.puntaje += delCliente ? 3 : 1;
    if (delCliente && PALABRAS_PRECIO.test(m.contenido)) {
      e.puntaje += 2;
      e.precio = true;
    }
    if (delCliente) e.cliente = true;
    if (m.fecha > e.ultima) e.ultima = m.fecha;
    acum.set(lead.id, e);
  }

  let yaCompraron = 0;
  let conCampanaReciente = 0;
  const contactos: ContactoAfin[] = [];
  for (const [leadId, e] of acum) {
    const lead = leads.find((l) => l.id === leadId);
    if (!lead?.telefono) continue;
    const compra = compras.get(leadId);
    if (compra && ahora - new Date(compra.ultima_compra).getTime() < diasCompra * DIA_MS) {
      yaCompraron++;
      continue;
    }
    if (bloqueadoPorMarketing({ telefono: lead.telefono, lid: lead.lid, ultimaCampanaEnviadaAt: lead.ultima_campana_enviada_at }, entrantes, ahora)) {
      conCampanaReciente++;
      continue;
    }
    const reciente = ahora - new Date(e.ultima).getTime() < 30 * DIA_MS;
    const puntaje = Math.min(10, e.puntaje + (reciente ? 1 : 0));
    contactos.push({
      telefono: lead.telefono,
      nombre: lead.nombre,
      puntaje,
      ultimaMencion: e.ultima,
      motivo: e.precio
        ? "Preguntó el precio de este producto"
        : e.cliente
          ? "Nombró este producto en sus mensajes"
          : "Se le habló de este producto",
    });
  }
  contactos.sort((a, b) => b.puntaje - a.puntaje || b.ultimaMencion.localeCompare(a.ultimaMencion));
  return { contactos, mencionaron: acum.size, yaCompraron, conCampanaReciente };
}
