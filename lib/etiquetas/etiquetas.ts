import { normalizarTexto } from "@/lib/perfil/novedades";

/**
 * Etiquetas de contactos. Se acumulan: un contacto puede ser "cliente" +
 * "eukanuba" + "nuevo", y una audiencia por etiquetas es "todos los contactos
 * que tengan TODAS las etiquetas elegidas".
 *
 * Lógica pura (sin red ni base) para poder probarla. La normalización replica
 * a yamas_send_normalizar_etiquetas (ver docs/etiquetas.sql): lo que se valida
 * acá tiene que coincidir con lo que acepta la base.
 */

/** Etiqueta de sistema: la pone sola la sincronización a quien compró. No se edita a mano. */
export const ETIQUETA_CLIENTE = "cliente";
export const ETIQUETAS_DE_SISTEMA: readonly string[] = [ETIQUETA_CLIENTE];

export const MAX_LARGO_ETIQUETA = 30;
export const MAX_ETIQUETAS_POR_CONTACTO = 20;

/** Un "nuevo" es quien apareció por primera vez en los últimos N días. */
export const DIAS_NUEVO = 30;
/** Compras detectadas a partir de las cuales se sugiere "frecuente". */
export const COMPRAS_FRECUENTE = 3;
const MIN_CONTACTOS_SUGERENCIA = 2;
/** Una etiqueta que cubre a más de esta fracción de los contactos no segmenta nada ("mascotas" en una tienda de mascotas). */
const MAX_COBERTURA = 0.4;
const MAX_SUGERENCIAS_PRODUCTO = 8;
/** Un bigrama reemplaza a sus palabras sueltas si cubre al menos esta fracción de sus contactos. */
const FRACCION_BIGRAMA = 0.8;

const DIA_MS = 24 * 60 * 60 * 1000;

/** Palabras que no sirven como etiqueta aunque estén en el nombre de un producto. */
const PALABRAS_NO_ETIQUETA = new Set([
  "para", "con", "sin", "por", "los", "las", "una", "uno", "del", "que", "pack", "kilo", "kilos",
  "gramos", "unidad", "unidades", "adulto", "adultos", "cachorro", "cachorros", "pequeno", "pequena",
  "pequenos", "mediano", "mediana", "grande", "grandes", "gigante", "small", "medium", "maxi", "mini",
  "puppy", "junior", "senior", "premium", "super", "especial", "natural", "producto", "productos",
  "alimento", "alimentos", "comida", "articulo", "articulos", "accesorio", "accesorios",
]);

/** Igual que la base: minúsculas, espacios simples, hasta 30 caracteres, sin símbolos raros. */
export function normalizarEtiqueta(texto: string): string | null {
  const t = texto.trim().toLowerCase().replace(/\s+/g, " ").slice(0, MAX_LARGO_ETIQUETA).trim();
  if (!t) return null;
  return /^[\p{L}\p{N} +._-]+$/u.test(t) ? t : null;
}

/** Normaliza y deduplica una lista; descarta las inválidas. */
export function normalizarEtiquetas(textos: string[]): string[] {
  const out = new Set<string>();
  for (const x of textos) {
    const n = normalizarEtiqueta(x);
    if (n) out.add(n);
  }
  return [...out].sort();
}

export function esEtiquetaDeSistema(etiqueta: string): boolean {
  return ETIQUETAS_DE_SISTEMA.includes(etiqueta);
}

/** Primera letra en mayúscula, para mostrar. La etiqueta guardada sigue en minúsculas. */
export function mostrarEtiqueta(etiqueta: string): string {
  return etiqueta.charAt(0).toUpperCase() + etiqueta.slice(1);
}

const PALETA: { bg: string; text: string; borde: string }[] = [
  { bg: "#eef4ff", text: "#2e5aac", borde: "#cddcf7" },
  { bg: "#fff4e6", text: "#a35d00", borde: "#f2d9b3" },
  { bg: "#f5ecff", text: "#7a3fb3", borde: "#e1cdf5" },
  { bg: "#fdeef2", text: "#b23a5b", borde: "#f5cfda" },
  { bg: "#e9f7f6", text: "#1d7d78", borde: "#c2e6e3" },
  { bg: "#f2f4e6", text: "#6a7a1c", borde: "#dde3b8" },
];

/** Color estable por nombre (siempre el mismo para la misma etiqueta). "cliente" va en verde. */
export function colorDeEtiqueta(etiqueta: string): { bg: string; text: string; borde: string } {
  if (etiqueta === ETIQUETA_CLIENTE) return { bg: "#e7f7ef", text: "#067647", borde: "#b9e6cf" };
  let h = 0;
  for (const c of etiqueta) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PALETA[h % PALETA.length];
}

export interface ConEtiquetas {
  etiquetas: string[];
}

/** Contactos que tienen TODAS las etiquetas pedidas. Sin etiquetas pedidas, devuelve todos. */
export function contactosConEtiquetas<T extends ConEtiquetas>(contactos: T[], etiquetas: string[]): T[] {
  if (etiquetas.length === 0) return contactos;
  return contactos.filter((c) => etiquetas.every((e) => c.etiquetas.includes(e)));
}

export interface ConteoEtiqueta {
  nombre: string;
  cantidad: number;
  sistema: boolean;
}

/** Etiquetas en uso con su cantidad de contactos: las de sistema primero, luego por cantidad. */
export function contarEtiquetas(contactos: ConEtiquetas[]): ConteoEtiqueta[] {
  const conteo = new Map<string, number>();
  for (const c of contactos) {
    for (const e of c.etiquetas) conteo.set(e, (conteo.get(e) ?? 0) + 1);
  }
  return [...conteo.entries()]
    .map(([nombre, cantidad]) => ({ nombre, cantidad, sistema: esEtiquetaDeSistema(nombre) }))
    .sort(
      (a, b) =>
        Number(b.sistema) - Number(a.sistema) || b.cantidad - a.cantidad || a.nombre.localeCompare(b.nombre),
    );
}

export interface ContactoParaSugerir extends ConEtiquetas {
  id: string;
  /** Texto de interés detectado en el chat (producto, necesidad, palabras clave). Vacío si no se analizó. */
  textoInteres: string;
  /** Cuándo apareció por primera vez (ISO), si se conoce. */
  primerContactoAt?: string | null;
  /** Compras detectadas en los chats. */
  compras?: number;
}

export interface SugerenciaEtiqueta {
  etiqueta: string;
  descripcion: string;
  origen: "nuevo" | "frecuente" | "producto";
  /** Contactos a los que se les pondría. Se calculan en el servidor y no viajan al navegador. */
  contactoIds: string[];
  cantidad: number;
}

export interface EntradaSugerencias {
  contactos: ContactoParaSugerir[];
  /** Nombres de los productos del perfil. */
  productos: string[];
  /** Sugerencias que el usuario ya ignoró. */
  ignoradas: string[];
  ahora: number;
}

function palabrasUtiles(nombre: string): string[] {
  return normalizarTexto(nombre)
    .split(" ")
    .filter((w) => w.length >= 4 && !PALABRAS_NO_ETIQUETA.has(w));
}

/** Frases candidatas de un producto: palabras sueltas y pares de palabras consecutivas. */
function frasesDeProducto(nombre: string): { unigramas: string[]; bigramas: string[] } {
  const todas = normalizarTexto(nombre).split(" ").filter(Boolean);
  const unigramas = palabrasUtiles(nombre);
  const bigramas: string[] = [];
  for (let i = 0; i < todas.length - 1; i++) {
    const a = todas[i];
    const b = todas[i + 1];
    if (a.length >= 3 && b.length >= 3 && !PALABRAS_NO_ETIQUETA.has(a) && !PALABRAS_NO_ETIQUETA.has(b)) {
      bigramas.push(`${a} ${b}`);
    }
  }
  return { unigramas, bigramas };
}

function contieneFrase(textoNormalizado: string, frase: string): boolean {
  // Con espacios alrededor para no confundir "gato" con "gatos" ni con "magato".
  return ` ${textoNormalizado} `.includes(` ${frase} `) || ` ${textoNormalizado} `.includes(` ${frase}s `);
}

/**
 * Sugiere etiquetas a partir de lo que se sabe de los contactos:
 *  - "nuevo": aparecieron por primera vez en los últimos 30 días.
 *  - "frecuente": 3 o más compras detectadas.
 *  - una por marca o producto del catálogo que aparece en el interés de al menos
 *    2 contactos ("royal canin", "eukanuba"...).
 * Nunca sugiere una etiqueta que ya está en uso ni una que el usuario ignoró.
 */
export function sugerirEtiquetas(entrada: EntradaSugerencias): SugerenciaEtiqueta[] {
  const { contactos, ahora } = entrada;
  const enUso = new Set(contactos.flatMap((c) => c.etiquetas));
  const ignoradas = new Set(entrada.ignoradas);
  const permitida = (e: string) => !enUso.has(e) && !ignoradas.has(e);
  const out: SugerenciaEtiqueta[] = [];

  const nuevos = contactos.filter(
    (c) => c.primerContactoAt && ahora - new Date(c.primerContactoAt).getTime() <= DIAS_NUEVO * DIA_MS,
  );
  if (permitida("nuevo") && nuevos.length >= 2) {
    out.push({
      etiqueta: "nuevo",
      descripcion: `Escribieron por primera vez en los últimos ${DIAS_NUEVO} días.`,
      origen: "nuevo",
      contactoIds: nuevos.map((c) => c.id),
      cantidad: nuevos.length,
    });
  }

  const frecuentes = contactos.filter((c) => (c.compras ?? 0) >= COMPRAS_FRECUENTE);
  if (permitida("frecuente") && frecuentes.length >= 2) {
    out.push({
      etiqueta: "frecuente",
      descripcion: `Tienen ${COMPRAS_FRECUENTE} o más compras detectadas.`,
      origen: "frecuente",
      contactoIds: frecuentes.map((c) => c.id),
      cantidad: frecuentes.length,
    });
  }

  // Marcas y productos del catálogo que aparecen en el interés de los contactos.
  const textos = contactos.map((c) => ({ c, t: normalizarTexto(c.textoInteres) }));
  const conTexto = textos.filter(({ t }) => t).length;
  const candidatas = new Set<string>();
  const esBigrama = new Set<string>();
  for (const nombre of entrada.productos) {
    const { unigramas, bigramas } = frasesDeProducto(nombre);
    for (const u of unigramas) candidatas.add(u);
    for (const b of bigramas) {
      candidatas.add(b);
      esBigrama.add(b);
    }
  }

  const conteos = new Map<string, Set<string>>();
  for (const frase of candidatas) {
    if (!permitida(frase)) continue;
    const ids = new Set(textos.filter(({ t }) => t && contieneFrase(t, frase)).map(({ c }) => c.id));
    if (ids.size >= MIN_CONTACTOS_SUGERENCIA && ids.size <= MAX_COBERTURA * conTexto) conteos.set(frase, ids);
  }

  // Un par de palabras ("royal canin") reemplaza a sus palabras sueltas cuando casi
  // siempre aparecen juntas; así no se sugieren "royal" y "canin" por separado.
  for (const [frase, ids] of [...conteos]) {
    if (!esBigrama.has(frase)) continue;
    for (const palabra of frase.split(" ")) {
      const suelta = conteos.get(palabra);
      if (suelta && ids.size >= FRACCION_BIGRAMA * suelta.size) conteos.delete(palabra);
    }
  }

  const deProducto = [...conteos.entries()]
    .map(([etiqueta, ids]) => ({ etiqueta, ids: [...ids] }))
    .sort((a, b) => b.ids.length - a.ids.length || a.etiqueta.localeCompare(b.etiqueta))
    .slice(0, MAX_SUGERENCIAS_PRODUCTO);

  for (const { etiqueta, ids } of deProducto) {
    out.push({
      etiqueta,
      descripcion: `Aparece en el interés de ${ids.length} contactos y está en tu catálogo.`,
      origen: "producto",
      contactoIds: ids,
      cantidad: ids.length,
    });
  }

  return out;
}
