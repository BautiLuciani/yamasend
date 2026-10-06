import { normalizarTexto } from "@/lib/perfil/novedades";
import type { Producto } from "@/lib/types";

/**
 * Campañas sugeridas: tres audiencias que se arman solas con lo que YamaSend
 * sabe del negocio (perfil + compras detectadas en los chats).
 *
 *   1. Clientes que no compran hace 2 semanas
 *   2. Clientes interesados en un producto
 *   3. Mejores compradores
 *
 * Es lógica pura (sin red ni base) para poder probarla. NUNCA envía nada: solo
 * calcula quién entra en cada audiencia. Crear la campaña y mandarla es un paso
 * posterior que el usuario revisa en el asistente de campañas.
 *
 * Límite conocido: YamaSend no tiene un registro de ventas. "Compró" se infiere
 * de mensajes del dueño que confirman una compra o un pago (ver
 * yamas_send_compradores_detectados). Si el negocio no manda ese tipo de
 * confirmaciones por WhatsApp, no hay compras detectadas.
 */

export const DIAS_INACTIVIDAD = 14;
/** No se sugiere a quien ya recibió una campaña en estos días: evita saturar. */
export const DIAS_SIN_CAMPANA = 7;
export const MIN_COMPRAS_MEJORES = 2;
export const FRACCION_MEJORES = 0.2;
const MIN_MEJORES = 5;
const MAX_MEJORES = 100;
/** Un producto necesita al menos tantos clientes asociados para sugerirse. */
const MIN_CLIENTES_PRODUCTO = 3;
const MAX_ALTERNATIVAS = 8;
/** Una palabra que está en más de esta fracción de los productos es "común" (marca, tipo de animal...). */
const FRACCION_PALABRA_COMUN = 0.25;

const DIA_MS = 24 * 60 * 60 * 1000;

export type TipoSugerida = "inactivos_2_semanas" | "por_producto" | "mejores_compradores";

export interface Comprador {
  leadId: string;
  nombre: string | null;
  compras: number;
  ultimaCompra: string;
  ultimaCampanaEnviadaAt: string | null;
}

export interface LeadParaProducto {
  id: string;
  nombre: string | null;
  productoServicio: string | null;
  necesidad: string | null;
  keywords: string[];
  ultimaCampanaEnviadaAt: string | null;
}

export interface CampanaSugerida {
  tipo: TipoSugerida;
  titulo: string;
  descripcion: string;
  /** Ids de yamas_send_leads: lo que guardan las audiencias. */
  leadIds: string[];
  cantidad: number;
  ejemplos: string[];
  mensajeSugerido: string;
  /** Nombre sugerido para el template (minúsculas y guiones bajos, como pide Meta). */
  nombreTemplate: string;
  disponible: boolean;
  motivoNoDisponible?: string;
  /** Solo por_producto: el producto elegido y las demás opciones. */
  producto?: string;
  productosAlternativos?: { nombre: string; cantidad: number }[];
  /** Cuántos clientes se dejaron afuera por haber recibido una campaña hace poco. */
  excluidosPorCampanaReciente: number;
}

export interface EntradaSugeridas {
  compradores: Comprador[];
  leads: LeadParaProducto[];
  productos: Producto[];
  /** Nombre del negocio (del perfil): se usa en los mensajes y para descartar números propios. */
  negocio: string;
  ahora: number;
  productoElegido?: string | null;
}

const TITULOS: Record<TipoSugerida, string> = {
  inactivos_2_semanas: "Clientes que no compran hace 2 semanas",
  por_producto: "Clientes por producto",
  mejores_compradores: "Mejores compradores",
};

const SIN_COMPRAS =
  "Todavía no detectamos compras en tus chats. Detectamos una compra cuando confirmás un pago o pedido por WhatsApp (por ejemplo «gracias por tu compra»).";

const PALABRAS_VACIAS = new Set([
  "para", "con", "sin", "por", "los", "las", "una", "uno", "del", "que", "pack", "kilo", "kilos",
  "gramos", "unidad", "unidades",
]);

export function nombreDeLista(tipo: TipoSugerida, producto?: string): string {
  if (tipo === "por_producto" && producto) return `Sugerida: Interesados en ${producto}`.slice(0, 90);
  return `Sugerida: ${TITULOS[tipo]}`;
}

function haceMenosDe(iso: string | null, dias: number, ahora: number): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return !Number.isNaN(t) && ahora - t < dias * DIA_MS;
}

/** true si el nombre del contacto parece ser un número del propio negocio. */
function esDelNegocio(nombre: string | null, negocio: string): boolean {
  const n = normalizarTexto(negocio);
  if (n.length < 4 || !nombre) return false;
  return normalizarTexto(nombre).includes(n);
}

function primerosNombres(nombres: (string | null)[]): string[] {
  return nombres.filter((n): n is string => !!n && n.trim().length > 0).slice(0, 3);
}

/** Palabras distintivas de un producto (sin acentos, mínimo 4 letras, sin vacías). */
export function palabrasDeProducto(nombre: string): string[] {
  const vistas = new Set<string>();
  for (const w of normalizarTexto(nombre).split(" ")) {
    if (w.length >= 4 && !PALABRAS_VACIAS.has(w)) vistas.add(w);
  }
  return [...vistas];
}

/**
 * true si son la misma palabra salvo singular/plural ("perro" / "perros").
 * NO se acepta un prefijo cualquiera: "canine" no es "canin" (la marca), y eso
 * hacía que todos los productos de Royal Canin coincidieran con cualquier
 * cliente de la marca.
 */
function mismaPalabra(a: string, b: string): boolean {
  if (a === b) return true;
  for (const plural of ["s", "es"]) {
    if (a === b + plural || b === a + plural) return true;
  }
  return false;
}

/**
 * Palabras distintivas de cada producto: las que NO se repiten en muchos
 * productos del catálogo. En "Royal Canin Early Renal" las distintivas son
 * "early" y "renal"; "royal" y "canin" son la marca y aparecen en decenas.
 * Sin esto, todos los productos de una misma marca daban la misma audiencia.
 */
export function palabrasDistintivas(productos: string[]): Map<string, string[]> {
  const porProducto = productos.map((n) => ({ n, palabras: palabrasDeProducto(n) }));
  const frecuencia = new Map<string, number>();
  for (const { palabras } of porProducto) {
    for (const w of palabras) frecuencia.set(w, (frecuencia.get(w) ?? 0) + 1);
  }
  const umbral = Math.max(1, Math.ceil(productos.length * FRACCION_PALABRA_COMUN));
  const out = new Map<string, string[]>();
  for (const { n, palabras } of porProducto) {
    out.set(n, palabras.filter((w) => (frecuencia.get(w) ?? 0) <= umbral));
  }
  return out;
}

/**
 * true si el texto del cliente habla de este producto: comparte al menos la
 * mitad de sus palabras (y al menos 2 cuando el nombre tiene 2 o más). Se
 * aceptan singular/plural comparando por prefijo.
 *
 * `distintivas`: si se pasa, además tiene que coincidir alguna palabra
 * distintiva. Si se pasa vacía (todas las palabras del producto son comunes a
 * otros), se exigen TODAS. Sin pasarla, solo rige la regla de la mitad.
 */
export function coincideConProducto(texto: string, palabras: string[], distintivas?: string[]): boolean {
  if (!palabras.length) return false;
  const enTexto = normalizarTexto(texto).split(" ").filter((w) => w.length >= 4);
  const acertadas = palabras.filter((p) => enTexto.some((w) => mismaPalabra(w, p)));
  if (acertadas.length < Math.min(2, palabras.length) || acertadas.length / palabras.length < 0.5) {
    return false;
  }
  if (distintivas === undefined) return true;
  if (distintivas.length === 0) return acertadas.length === palabras.length;
  return distintivas.some((d) => acertadas.includes(d));
}

function mensaje(tipo: TipoSugerida, negocio: string, producto?: string): string {
  const quien = negocio.trim() || "nuestro negocio";
  if (tipo === "inactivos_2_semanas") {
    return `Hola {{1}}! 👋 Pasó un tiempito desde tu última compra en ${quien}. ¿Te hace falta reponer algo? Escribinos y te ayudamos con tu pedido.`;
  }
  if (tipo === "por_producto") {
    return `Hola {{1}}! Tenemos ${producto ?? "productos que te pueden interesar"} disponible en ${quien}. ¿Querés que te pasemos precio y stock?`;
  }
  return `Hola {{1}}! Gracias por elegirnos siempre en ${quien} 💚 Por ser de nuestros mejores clientes, queremos contarte primero nuestras novedades. ¿Te cuento?`;
}

const NOMBRE_TEMPLATE: Record<TipoSugerida, string> = {
  inactivos_2_semanas: "recordatorio_reposicion",
  por_producto: "novedad_de_producto",
  mejores_compradores: "mejores_clientes",
};

function base(tipo: TipoSugerida, negocio: string, descripcion: string, producto?: string): CampanaSugerida {
  return {
    tipo,
    titulo: TITULOS[tipo],
    descripcion,
    leadIds: [],
    cantidad: 0,
    ejemplos: [],
    mensajeSugerido: mensaje(tipo, negocio, producto),
    nombreTemplate: NOMBRE_TEMPLATE[tipo],
    disponible: false,
    excluidosPorCampanaReciente: 0,
  };
}

/** Calcula las tres campañas sugeridas. Siempre devuelve las tres, en este orden. */
export function armarSugeridas(entrada: EntradaSugeridas): CampanaSugerida[] {
  const { negocio, ahora } = entrada;

  // Compradores válidos: sin números del propio negocio.
  const propios = entrada.compradores.filter((c) => !esDelNegocio(c.nombre, negocio));
  const aptos = propios.filter((c) => !haceMenosDe(c.ultimaCampanaEnviadaAt, DIAS_SIN_CAMPANA, ahora));
  const excluidosCompradores = propios.length - aptos.length;

  // 1. No compran hace 2 semanas
  const inactivos = base(
    "inactivos_2_semanas",
    negocio,
    `Compraron al menos una vez y su última compra fue hace más de ${DIAS_INACTIVIDAD} días. Ideal para un recordatorio de reposición.`,
  );
  inactivos.excluidosPorCampanaReciente = excluidosCompradores;
  if (entrada.compradores.length === 0) {
    inactivos.motivoNoDisponible = SIN_COMPRAS;
  } else {
    const lista = aptos
      .filter((c) => ahora - new Date(c.ultimaCompra).getTime() > DIAS_INACTIVIDAD * DIA_MS)
      .sort((a, b) => b.compras - a.compras || new Date(b.ultimaCompra).getTime() - new Date(a.ultimaCompra).getTime());
    inactivos.leadIds = lista.map((c) => c.leadId);
    inactivos.cantidad = lista.length;
    inactivos.ejemplos = primerosNombres(lista.map((c) => c.nombre));
    inactivos.disponible = lista.length > 0;
    if (!inactivos.disponible) {
      inactivos.motivoNoDisponible = `Todos tus compradores detectados compraron en los últimos ${DIAS_INACTIVIDAD} días.`;
    }
  }

  // 2. Por producto
  const porProducto = base(
    "por_producto",
    negocio,
    "Clientes cuyo interés detectado en los chats coincide con uno de tus productos. Elegí el producto.",
  );
  const productos = entrada.productos.filter((p) => p.nombre?.trim());
  if (productos.length === 0) {
    porProducto.motivoNoDisponible = "Cargá tus productos en Perfil para poder armar esta campaña.";
  } else {
    const leadsAptos = entrada.leads.filter(
      (l) => !esDelNegocio(l.nombre, negocio) && !haceMenosDe(l.ultimaCampanaEnviadaAt, DIAS_SIN_CAMPANA, ahora),
    );
    const distintivas = palabrasDistintivas(productos.map((p) => p.nombre.trim()));
    const ranking = productos
      .map((p) => {
        const nombre = p.nombre.trim();
        const palabras = palabrasDeProducto(nombre);
        const coinciden = leadsAptos.filter((l) =>
          coincideConProducto(
            [l.productoServicio, l.necesidad, l.keywords.join(" ")].filter(Boolean).join(" "),
            palabras,
            distintivas.get(nombre) ?? [],
          ),
        );
        return { nombre, leads: coinciden };
      })
      .filter((r) => r.leads.length >= MIN_CLIENTES_PRODUCTO)
      .sort((a, b) => b.leads.length - a.leads.length)
      // Productos de una misma línea ("Royal Canin Mini ...") pueden dar
      // exactamente los mismos clientes: se muestra solo el primero.
      .filter((r, i, todos) => {
        const clave = r.leads.map((l) => l.id).sort().join("|");
        return todos.findIndex((x) => x.leads.map((l) => l.id).sort().join("|") === clave) === i;
      });

    if (ranking.length === 0) {
      porProducto.motivoNoDisponible =
        "Todavía no encontramos clientes interesados en tus productos. Se arma con lo que detectamos en los chats.";
    } else {
      const elegido = ranking.find((r) => r.nombre === entrada.productoElegido) ?? ranking[0];
      porProducto.producto = elegido.nombre;
      porProducto.mensajeSugerido = mensaje("por_producto", negocio, elegido.nombre);
      porProducto.leadIds = elegido.leads.map((l) => l.id);
      porProducto.cantidad = elegido.leads.length;
      porProducto.ejemplos = primerosNombres(elegido.leads.map((l) => l.nombre));
      porProducto.productosAlternativos = ranking
        .slice(0, MAX_ALTERNATIVAS)
        .map((r) => ({ nombre: r.nombre, cantidad: r.leads.length }));
      porProducto.disponible = true;
      porProducto.excluidosPorCampanaReciente = entrada.leads.length - leadsAptos.length;
    }
  }

  // 3. Mejores compradores
  const mejores = base(
    "mejores_compradores",
    negocio,
    `El ${Math.round(FRACCION_MEJORES * 100)}% de tus clientes con más compras (mínimo ${MIN_COMPRAS_MEJORES}). Ideal para cuidarlos o avisarles primero las novedades.`,
  );
  mejores.excluidosPorCampanaReciente = excluidosCompradores;
  if (entrada.compradores.length === 0) {
    mejores.motivoNoDisponible = SIN_COMPRAS;
  } else {
    const recurrentes = aptos
      .filter((c) => c.compras >= MIN_COMPRAS_MEJORES)
      .sort((a, b) => b.compras - a.compras || new Date(b.ultimaCompra).getTime() - new Date(a.ultimaCompra).getTime());
    const tope = Math.min(MAX_MEJORES, Math.max(MIN_MEJORES, Math.ceil(FRACCION_MEJORES * aptos.length)));
    const lista = recurrentes.slice(0, tope);
    mejores.leadIds = lista.map((c) => c.leadId);
    mejores.cantidad = lista.length;
    mejores.ejemplos = primerosNombres(lista.map((c) => c.nombre));
    mejores.disponible = lista.length > 0;
    if (!mejores.disponible) {
      mejores.motivoNoDisponible = `Todavía no hay clientes con ${MIN_COMPRAS_MEJORES} o más compras detectadas.`;
    }
  }

  return [inactivos, porProducto, mejores];
}
