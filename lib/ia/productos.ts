// Solo servidor: usa el cliente de Supabase con cookies y la API de OpenAI.
import { createHash } from "node:crypto";
import type OpenAI from "openai";
import type { createClient } from "@/lib/supabase/server";
import type { GrupoProductoIA } from "@/lib/types";
import { contieneVariablesTemplate } from "@/lib/templates/config";

/**
 * Productos que piden los clientes, agrupados por IA (pedido de Pato,
 * 2026-10): base para armar una audiencia y un template por producto.
 *
 * Fuente: lo que el Motor ya extrajo de las conversaciones (chat_demanda,
 * atributo "producto": qué pidió cada contacto, con cita). Esos textos vienen
 * escritos de mil formas ("royal canin fit 32", "pipeta bravecto", "cuchas"),
 * así que acá la IA los agrupa en productos o categorías útiles para una
 * campaña. Los contactos de cada grupo NO los decide la IA: salen de qué
 * contacto escribió cada texto, así que ningún contacto puede ser inventado.
 */

type Supabase = Awaited<ReturnType<typeof createClient>>;

const MAX_VALORES_PARA_IA = 220;
const MAX_GRUPOS = 12;

interface FilaDemanda {
  valor: string;
  telefono: string;
  contacto_nombre: string;
}

function normalizar(v: string): string {
  return (v || "").toLowerCase().replace(/\s+/g, " ").trim();
}

/** Slug para nombres de template de Meta: minúsculas, números y _ . */
export function slugProducto(nombre: string): string {
  const s = nombre
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40)
    .replace(/_+$/g, "");
  return s || "producto";
}

export interface ResultadoAgrupacion {
  firma: string;
  grupos: GrupoProductoIA[];
  /** Cuántos contactos pidieron algún producto (antes de agrupar). */
  contactosConPedidos: number;
}

/**
 * Agrupa los productos pedidos por los clientes del tenant. Si `cache` tiene
 * la misma firma (mismos pedidos, mismos excluidos), lo reutiliza: así la
 * agrupación no cambia de un mensaje a otro dentro de la misma charla.
 */
export async function agruparProductosClientes(opciones: {
  openai: OpenAI;
  supabase: Supabase;
  tenantId: string;
  /** Nombres del catálogo de "Datos de la empresa", como pista de nombres. */
  catalogo: string[];
  cache?: { firma: string; grupos: GrupoProductoIA[] } | null;
}): Promise<ResultadoAgrupacion> {
  const { openai, supabase, tenantId, catalogo, cache } = opciones;

  const { data, error } = await supabase.rpc("chat_demanda", {
    p_tenant_id: tenantId,
    p_atributo: "producto",
    p_texto: null,
    p_limite: 500,
  });
  if (error) throw new Error(error.message);

  // Sin los excluidos del motor (sucursales, proveedores: no son clientes).
  const { data: excl } = await supabase.rpc("yamas_send_motor_excluidos");
  const excluidos = new Set(
    (Array.isArray(excl) ? (excl as { telefono: string }[]) : []).map((r) => r.telefono.replace(/\D/g, "")),
  );

  const filas = ((data ?? []) as FilaDemanda[]).filter(
    (f) => f.valor && f.telefono && !excluidos.has(f.telefono.replace(/\D/g, "")),
  );
  const contactosConPedidos = new Set(filas.map((f) => f.telefono)).size;

  // Valores distintos, los más pedidos primero (por cantidad de contactos).
  const porValor = new Map<string, Set<string>>();
  for (const f of filas) {
    const v = normalizar(f.valor).slice(0, 120);
    if (!v) continue;
    if (!porValor.has(v)) porValor.set(v, new Set());
    porValor.get(v)!.add(f.telefono);
  }
  const valores = Array.from(porValor.entries())
    .sort((a, b) => b[1].size - a[1].size || a[0].localeCompare(b[0]))
    .slice(0, MAX_VALORES_PARA_IA);

  const firma = createHash("sha256")
    .update(JSON.stringify([valores.map(([v, t]) => [v, [...t].sort()]), [...excluidos].sort()]))
    .digest("hex")
    .slice(0, 24);

  if (cache && cache.firma === firma && Array.isArray(cache.grupos)) {
    return { firma, grupos: cache.grupos, contactosConPedidos };
  }
  if (valores.length === 0) return { firma, grupos: [], contactosConPedidos };

  const listado = valores.map(([v, t], i) => `${i + 1}. ${v} (${t.size} contacto${t.size === 1 ? "" : "s"})`).join("\n");
  const pistaCatalogo = catalogo.length
    ? `\n\nProductos que el negocio cargó en su catálogo (usá estos nombres cuando coincidan):\n${catalogo.slice(0, 60).map((c) => `- ${c}`).join("\n")}`
    : "";

  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    temperature: 0,
    max_tokens: 3000,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "grupos_productos",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            grupos: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  nombre: { type: "string" },
                  descripcion: { type: "string" },
                  valores: { type: "array", items: { type: "integer" } },
                },
                required: ["nombre", "descripcion", "valores"],
              },
            },
          },
          required: ["grupos"],
        },
      },
    },
    messages: [
      {
        role: "system",
        content: `Agrupás lo que piden los clientes de un negocio en PRODUCTOS o CATEGORÍAS de producto, para armar una campaña de WhatsApp distinta por cada grupo.

Reglas:
- Entre 3 y ${MAX_GRUPOS} grupos. Cada grupo tiene que ser un producto o categoría que se pueda promocionar con UN mensaje (ej. "Alimento Royal Canin", "Antipulgas y antiparasitarios", "Camas y cuchas", "Alimento para gatos").
- Si una marca concentra muchos pedidos, merece su propio grupo. Si una marca tiene pocos pedidos, sumala a la categoría que corresponda.
- Nombre del grupo: corto (máximo 40 caracteres), en español, claro para el dueño del negocio. Sin la palabra "clientes".
- descripcion: una frase corta que diga qué incluye.
- valores: los NÚMEROS de la lista que entran en ese grupo. Cada número va en UN solo grupo como máximo.
- Dejá AFUERA lo que no es un producto concreto (ej. "precio", "catálogo", "stock", consultas genéricas, "bolsa grande" sin saber de qué). Mejor dejar algo afuera que meterlo en un grupo equivocado.
- No inventes productos: solo agrupás lo que está en la lista.${pistaCatalogo}`,
      },
      { role: "user", content: `Pedidos de los clientes:\n${listado}` },
    ],
  });

  let crudo: { grupos?: { nombre: string; descripcion: string; valores: number[] }[] } = {};
  try {
    crudo = JSON.parse(completion.choices[0]?.message?.content ?? "{}");
  } catch {
    crudo = {};
  }

  // Nombres de contacto por teléfono (el primero que aparezca).
  const nombrePorTelefono = new Map<string, string>();
  for (const f of filas) if (!nombrePorTelefono.has(f.telefono)) nombrePorTelefono.set(f.telefono, f.contacto_nombre || f.telefono);

  const usados = new Set<number>();
  const slugsUsados = new Set<string>();
  const grupos: GrupoProductoIA[] = [];
  for (const g of crudo.grupos ?? []) {
    const nombre = String(g.nombre ?? "").replace(/\s+/g, " ").trim().slice(0, 40);
    if (!nombre) continue;
    const indices = (Array.isArray(g.valores) ? g.valores : [])
      .map((n) => Math.round(Number(n)) - 1)
      .filter((i) => i >= 0 && i < valores.length && !usados.has(i));
    if (indices.length === 0) continue;
    indices.forEach((i) => usados.add(i));

    const telefonos = new Set<string>();
    for (const i of indices) for (const t of valores[i][1]) telefonos.add(t);
    if (telefonos.size === 0) continue;

    let slug = slugProducto(nombre);
    for (let n = 2; slugsUsados.has(slug); n++) slug = `${slugProducto(nombre).slice(0, 36)}_${n}`;
    slugsUsados.add(slug);

    grupos.push({
      nombre,
      slug,
      descripcion: String(g.descripcion ?? "").trim().slice(0, 160),
      contactos: [...telefonos].map((t) => ({ telefono: t, nombre: nombrePorTelefono.get(t) ?? t })),
      ejemplos: indices.slice(0, 6).map((i) => valores[i][0]),
    });
  }

  grupos.sort((a, b) => b.contactos.length - a.contactos.length);
  return { firma, grupos: grupos.slice(0, MAX_GRUPOS), contactosConPedidos };
}

export interface ContextoTemplates {
  nombreEmpresa: string | null;
  rubro: string;
  descripcionNegocio: string;
  tonoComunicacion: string;
  diferenciales: string;
  catalogo: string;
}

/**
 * Genera un texto de template de marketing por producto, en una sola
 * llamada (así los mensajes salen coherentes entre sí). Mismas reglas que el
 * generador de templates de siempre: sin variables, sin inventar precios,
 * stock ni promociones que el usuario no haya pedido.
 */
export async function generarTextosTemplatesPorProducto(opciones: {
  openai: OpenAI;
  contexto: ContextoTemplates;
  productos: { producto: string; descripcion: string; ejemplos: string[] }[];
  /** Lo que pidió el usuario (ej. "con 10% off", "más informal"). */
  indicaciones: string | null;
}): Promise<{ producto: string; contenido: string }[]> {
  const { openai, contexto, productos, indicaciones } = opciones;
  if (productos.length === 0) return [];

  const negocio = [
    contexto.nombreEmpresa && `Empresa: ${contexto.nombreEmpresa}`,
    contexto.rubro && `Rubro: ${contexto.rubro}`,
    contexto.descripcionNegocio && `Descripción: ${contexto.descripcionNegocio}`,
    contexto.tonoComunicacion && `Tono de la marca: ${contexto.tonoComunicacion}`,
    contexto.diferenciales && `Diferenciales: ${contexto.diferenciales}`,
    contexto.catalogo && `Catálogo (único lugar del que se pueden sacar precios):\n${contexto.catalogo}`,
  ]
    .filter(Boolean)
    .join("\n");

  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    temperature: 0.4,
    max_tokens: 3500,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "templates_por_producto",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            templates: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  producto: { type: "string" },
                  contenido: { type: "string" },
                },
                required: ["producto", "contenido"],
              },
            },
          },
          required: ["templates"],
        },
      },
    },
    messages: [
      {
        role: "system",
        content: `Redactás mensajes de template de WhatsApp Business (categoría MARKETING) para un negocio que usa YamaSend. Vas a escribir UN mensaje por cada producto de la lista, para mandárselo a los clientes que preguntaron por ese producto.

${negocio || "No hay datos del negocio cargados: escribí mensajes genéricos pero concretos."}

Reglas estrictas (Meta las exige):
- Español rioplatense, natural, con el tono de la marca (o profesional y cercano si no hay uno definido). Que suene escrito por una persona del negocio, no a aviso genérico.
- Entre 150 y 500 caracteres cada uno.
- NO uses variables ni llaves: nada de {{1}}, {{nombre}} ni corchetes para completar. El mensaje es igual para todos los contactos.
- Arrancá con contexto real (ej. "Hola, te escribimos de ${contexto.nombreEmpresa || "[negocio]"}..." solo si se conoce el nombre de la empresa; si no, "Hola, ¿cómo estás?").
- Hablá concretamente del producto o la categoría del mensaje. Podés mencionar marcas o variantes de los ejemplos de cómo lo pidieron.
- NO inventes precios, descuentos, promociones, stock, plazos ni condiciones. Solo podés mencionar una promo o condición si está en las indicaciones del usuario, o un precio si está en el catálogo.
- Nada de lenguaje de spam ("gratis", "urgente", muchos signos de exclamación) y como mucho un emoji.
- Cerrá invitando a responder el mensaje (ej. "Si te interesa, respondenos y te pasamos opciones").
- Devolvé cada mensaje con el nombre del producto EXACTO como te lo pasaron.`,
      },
      {
        role: "user",
        content: `${indicaciones ? `Indicaciones del usuario para estos mensajes: ${indicaciones}\n\n` : ""}Productos:\n${productos
          .map((p, i) => `${i + 1}. ${p.producto} — ${p.descripcion || "sin descripción"}. Cómo lo pidieron los clientes: ${p.ejemplos.slice(0, 4).join("; ")}`)
          .join("\n")}`,
      },
    ],
  });

  let crudo: { templates?: { producto: string; contenido: string }[] } = {};
  try {
    crudo = JSON.parse(completion.choices[0]?.message?.content ?? "{}");
  } catch {
    crudo = {};
  }

  const generados = crudo.templates ?? [];
  const porNombre = new Map(generados.map((t) => [normalizar(t.producto), t.contenido]));
  return productos
    .map((p, i) => {
      // Por nombre; si el modelo lo reescribió distinto, por posición.
      let contenido = String(
        porNombre.get(normalizar(p.producto)) ??
          (generados.length === productos.length ? generados[i]?.contenido : "") ??
          "",
      ).trim();
      // Red de seguridad: si igual se coló una variable, se saca (el envío a
      // Meta la rechazaría con variables deshabilitadas).
      if (contieneVariablesTemplate(contenido)) contenido = contenido.replace(/\{\{[^{}]*\}\}/g, "").replace(/\s{2,}/g, " ").trim();
      return { producto: p.producto, contenido: contenido.slice(0, 1000) };
    })
    .filter((t) => t.contenido.length >= 20);
}

/** Nombre de template para Meta ("slug_ddmmaa"), sin chocar con los existentes. */
export function nombreTemplateProducto(slug: string, existentes: Set<string>, fecha = new Date()): string {
  const d = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Argentina/Buenos_Aires",
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  })
    .format(fecha)
    .replace(/\//g, "");
  const base = `${slug}_${d}`.slice(0, 60);
  if (!existentes.has(base)) return base;
  for (let n = 2; n < 100; n++) {
    const c = `${base}_${n}`;
    if (!existentes.has(c)) return c;
  }
  return `${base}_${Date.now() % 10000}`;
}
