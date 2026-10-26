import { normalizarTexto } from "@/lib/perfil/novedades";

/**
 * Etiquetas de contactos. Se acumulan: un contacto puede ser "cliente" +
 * "producto" + "nuevo", y una audiencia por etiquetas es "todos los contactos
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
const MAX_SUGERENCIAS_TEMA = 6;
const MAX_SUGERENCIAS = 18;
/** Días sin hablar a partir de los cuales un contacto está "dormido". */
const DIAS_DORMIDO = 60;
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
  /** Fecha de su primera compra detectada (ISO). */
  primeraCompraAt?: string | null;
  /** Temperatura del análisis: caliente, tibio o frio. */
  temperatura?: string | null;
  sentimiento?: string | null;
  /** Último mensaje (ISO). */
  ultimoMensajeAt?: string | null;
  /** Palabras clave detectadas en el análisis. */
  keywords?: string[];
}

export type OrigenSugerencia = "comportamiento" | "texto" | "producto" | "tema";

export const ORIGEN_LABEL: Record<OrigenSugerencia, string> = {
  comportamiento: "Por comportamiento",
  texto: "Por lo que preguntan",
  producto: "Por producto",
  tema: "Por tema",
};

export interface SugerenciaEtiqueta {
  etiqueta: string;
  descripcion: string;
  origen: OrigenSugerencia;
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
  /**
   * Palabras del rubro, la descripción y el nombre del negocio. No sirven como tema:
   * "mascotas" en una tienda de mascotas está en casi todos los chats.
   */
  palabrasNegocio?: string[];
}

/** Palabras comerciales demasiado genéricas para ser un tema. */
const PALABRAS_TEMA_GENERICAS = new Set([
  "compra", "comprar", "pedido", "producto", "consulta", "interes", "informacion", "cliente", "venta",
  "vender", "quiero", "necesito", "servicio", "atencion", "hola", "gracias", "saludo", "mensaje", "chat",
  "contacto", "persona", "negocio", "tienda", "empresa", "cosa", "tema", "pregunta", "duda", "ayuda",
]);

/** Singular simple: "gatos" -> "gato", "promociones" -> "promocion". Une las dos formas en una sola. */
function singular(palabra: string): string {
  if (palabra.length < 5) return palabra;
  if (palabra.endsWith("ones")) return palabra.slice(0, -2);
  if (palabra.endsWith("s") && !palabra.endsWith("ss")) return palabra.slice(0, -1);
  return palabra;
}

function dias(iso: string | null | undefined, ahora: number): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? null : (ahora - t) / DIA_MS;
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
  // Con espacios alrededor para no confundir "gato" con "magato"; acepta el plural simple.
  return ` ${textoNormalizado} `.includes(` ${frase} `) || ` ${textoNormalizado} `.includes(` ${frase}s `);
}

interface ReglaComportamiento {
  etiqueta: string;
  descripcion: string;
  minimo: number;
  cumple: (c: ContactoParaSugerir, ahora: number) => boolean;
}

/** Reglas que dependen de cómo se comportó el contacto (no del negocio). */
const REGLAS_COMPORTAMIENTO: ReglaComportamiento[] = [
  {
    etiqueta: "nuevo",
    descripcion: `Escribieron por primera vez en los últimos ${DIAS_NUEVO} días.`,
    minimo: 2,
    cumple: (c, ahora) => (dias(c.primerContactoAt, ahora) ?? Infinity) <= DIAS_NUEVO,
  },
  {
    etiqueta: "cliente nuevo",
    descripcion: `Hicieron su primera compra en los últimos ${DIAS_NUEVO} días.`,
    minimo: 2,
    cumple: (c, ahora) => (dias(c.primeraCompraAt, ahora) ?? Infinity) <= DIAS_NUEVO,
  },
  {
    etiqueta: "frecuente",
    descripcion: `Tienen ${COMPRAS_FRECUENTE} o más compras detectadas.`,
    minimo: 2,
    cumple: (c) => (c.compras ?? 0) >= COMPRAS_FRECUENTE,
  },
  {
    etiqueta: "compró una vez",
    descripcion: "Tienen una sola compra detectada: buenos candidatos para volver a contactar.",
    minimo: 3,
    cumple: (c) => (c.compras ?? 0) === 1,
  },
  {
    etiqueta: "interesado",
    descripcion: "Muestran mucho interés en la conversación y todavía no compraron.",
    minimo: 3,
    cumple: (c) => c.temperatura === "caliente" && (c.compras ?? 0) === 0 && !c.etiquetas.includes(ETIQUETA_CLIENTE),
  },
  {
    etiqueta: "dormido",
    descripcion: `No hablan con vos hace más de ${DIAS_DORMIDO} días.`,
    minimo: 3,
    cumple: (c, ahora) => (dias(c.ultimoMensajeAt, ahora) ?? 0) > DIAS_DORMIDO,
  },
  {
    etiqueta: "reclamo",
    descripcion: "Mostraron una actitud negativa en la conversación: conviene atenderlos primero.",
    minimo: 2,
    cumple: (c) => c.sentimiento === "negativo",
  },
];

interface ReglaTexto {
  etiqueta: string;
  descripcion: string;
  minimo: number;
  patron: RegExp;
}

/** Reglas por lo que el contacto pregunta o dice (sobre el texto ya normalizado: sin acentos). */
const REGLAS_TEXTO: ReglaTexto[] = [
  {
    etiqueta: "mayorista",
    descripcion: "Preguntan por compras al por mayor o reventa.",
    minimo: 2,
    patron: /\b(mayorist\w*|por mayor|reventa|revendedor\w*)\b/,
  },
  {
    etiqueta: "busca empleo",
    descripcion: "Consultan por trabajo o mandan su currículum: conviene dejarlos afuera de las campañas de venta.",
    minimo: 2,
    patron: /\b(oportunidad\w* laboral\w*|busqueda laboral|busco trabajo|empleo|curriculum|cv)\b/,
  },
  {
    etiqueta: "proveedor",
    descripcion: "Te ofrecen productos o servicios: no son clientes.",
    minimo: 2,
    patron: /\b(proveedor\w*|distribuidor\w*|propuesta (comercial|de trabajo))\b/,
  },
];

/**
 * Sugiere etiquetas a partir de lo que se sabe de los contactos, en cuatro grupos:
 *  - Por comportamiento: nuevo, cliente nuevo, frecuente, compró una vez, interesado,
 *    dormido y reclamo.
 *  - Por lo que preguntan: mayorista, busca empleo y proveedor.
 *  - Por producto: una por marca o producto del catálogo que aparece en el interés
 *    de al menos 2 contactos ("royal canin", "eukanuba").
 *  - Por tema: las palabras clave que más se repiten en los chats ("envío", "descuento"),
 *    sin las genéricas ni las del propio rubro.
 * Nunca sugiere una etiqueta que ya está en uso, que el usuario ignoró, ni que no
 * segmenta (cubre a más del 40% de los contactos).
 */
export function sugerirEtiquetas(entrada: EntradaSugerencias): SugerenciaEtiqueta[] {
  const { contactos, ahora } = entrada;
  const enUso = new Set(contactos.flatMap((c) => c.etiquetas));
  const ignoradas = new Set(entrada.ignoradas);
  const usadas = new Set<string>();
  const permitida = (e: string) => !enUso.has(e) && !ignoradas.has(e) && !usadas.has(e);
  const out: SugerenciaEtiqueta[] = [];
  const agregar = (s: SugerenciaEtiqueta) => {
    usadas.add(s.etiqueta);
    out.push(s);
  };

  // 1. Comportamiento
  for (const r of REGLAS_COMPORTAMIENTO) {
    if (!permitida(r.etiqueta)) continue;
    const ids = contactos.filter((c) => r.cumple(c, ahora)).map((c) => c.id);
    if (ids.length >= r.minimo) {
      agregar({ etiqueta: r.etiqueta, descripcion: r.descripcion, origen: "comportamiento", contactoIds: ids, cantidad: ids.length });
    }
  }

  const textos = contactos.map((c) => ({
    c,
    t: normalizarTexto([c.textoInteres, ...(c.keywords ?? [])].join(" ")),
  }));

  // 2. Por lo que preguntan
  for (const r of REGLAS_TEXTO) {
    if (!permitida(r.etiqueta)) continue;
    const ids = textos.filter(({ t }) => t && r.patron.test(t)).map(({ c }) => c.id);
    if (ids.length >= r.minimo) {
      agregar({ etiqueta: r.etiqueta, descripcion: r.descripcion, origen: "texto", contactoIds: ids, cantidad: ids.length });
    }
  }

  // 3. Marcas y productos del catálogo que aparecen en el interés de los contactos.
  const interes = contactos.map((c) => ({ c, t: normalizarTexto(c.textoInteres) }));
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
  const conInteres = interes.filter(({ t }) => t).length;
  for (const frase of candidatas) {
    if (!permitida(frase)) continue;
    const ids = new Set(interes.filter(({ t }) => t && contieneFrase(t, frase)).map(({ c }) => c.id));
    if (ids.size >= MIN_CONTACTOS_SUGERENCIA && ids.size <= MAX_COBERTURA * conInteres) conteos.set(frase, ids);
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
    agregar({
      etiqueta,
      descripcion: `Aparece en el interés de ${ids.length} contactos y está en tu catálogo.`,
      origen: "producto",
      contactoIds: ids,
      cantidad: ids.length,
    });
  }

  // 4. Temas: palabras clave que se repiten en los chats.
  const delNegocio = new Set((entrada.palabrasNegocio ?? []).flatMap((p) => normalizarTexto(p).split(" ")).map(singular));
  const enCatalogo = new Set([...candidatas].flatMap((f) => f.split(" ")).map(singular));
  const temas = new Map<string, { ids: Set<string>; formas: Map<string, number> }>();
  let conKeywords = 0;
  for (const c of contactos) {
    const claves = new Set<string>();
    for (const bruta of c.keywords ?? []) {
      const k = normalizarTexto(bruta);
      if (k.length < 4 || k.length > MAX_LARGO_ETIQUETA) continue;
      // Para MOSTRAR se conserva la palabra original (con tildes); para AGRUPAR, la normalizada.
      const forma = bruta.trim().toLowerCase().replace(/\s+/g, " ");
      const clave = singular(k);
      const partes = clave.split(" ");
      if (partes.some((w) => PALABRAS_TEMA_GENERICAS.has(w) || PALABRAS_NO_ETIQUETA.has(w) || delNegocio.has(w))) continue;
      if (partes.some((w) => enCatalogo.has(w))) continue;
      claves.add(clave);
      const t = temas.get(clave) ?? { ids: new Set<string>(), formas: new Map<string, number>() };
      t.formas.set(forma, (t.formas.get(forma) ?? 0) + 1);
      temas.set(clave, t);
    }
    if ((c.keywords ?? []).length > 0) conKeywords++;
    for (const clave of claves) temas.get(clave)!.ids.add(c.id);
  }

  const deTema = [...temas.values()]
    .map((t) => ({
      etiqueta: [...t.formas.entries()].sort((a, b) => b[1] - a[1])[0][0],
      ids: [...t.ids],
    }))
    .filter((t) => permitida(t.etiqueta) && t.ids.length >= 3 && t.ids.length <= MAX_COBERTURA * conKeywords)
    .sort((a, b) => b.ids.length - a.ids.length || a.etiqueta.localeCompare(b.etiqueta))
    .slice(0, MAX_SUGERENCIAS_TEMA);

  for (const { etiqueta, ids } of deTema) {
    agregar({
      etiqueta,
      descripcion: `Es un tema que se repite en ${ids.length} conversaciones.`,
      origen: "tema",
      contactoIds: ids,
      cantidad: ids.length,
    });
  }

  return out.slice(0, MAX_SUGERENCIAS);
}
