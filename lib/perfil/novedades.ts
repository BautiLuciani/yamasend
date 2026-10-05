import type {
  PerfilNegocioInferido,
  PropuestaPerfil,
} from "@/lib/types";
import { claveProducto, type DatosNegocioBase } from "@/lib/perfil/fusion";

/**
 * Novedades del perfil: diferencias entre lo que la IA detecta en los chats y
 * lo que el usuario ya tiene cargado. Se muestran para ACEPTAR o IGNORAR; nunca
 * se aplican solas (lo único automático es llenar celdas vacías, que hace la
 * base en yamas_send_perfil_negocio_autocompletar).
 *
 * Es lógica pura (sin red ni base) para poder probarla. Lo ignorado se guarda
 * como claves de texto en yamas_send_perfil_negocio.ignorados; una novedad
 * ignorada no vuelve a aparecer mientras la IA siga detectando lo mismo.
 */

/** Confianza mínima para sugerir algo. Igual que el autocompletado. */
export const MIN_CONFIANZA = 0.5;

/** Similitud (Jaccard de palabras) a partir de la cual dos textos son "lo mismo". */
const UMBRAL_SIMILITUD = 0.5;

export type CampoTextoDatos =
  | "nombreEmpresa"
  | "rubro"
  | "descripcionNegocio"
  | "publicoObjetivo"
  | "tonoComunicacion"
  | "zonaCobertura"
  | "diferenciales";

const CAMPOS: {
  datos: CampoTextoDatos;
  inferido: Exclude<keyof PerfilNegocioInferido, "productos">;
  etiqueta: string;
}[] = [
  { datos: "nombreEmpresa", inferido: "nombre_empresa", etiqueta: "Nombre del negocio" },
  { datos: "rubro", inferido: "rubro", etiqueta: "A qué se dedica" },
  { datos: "descripcionNegocio", inferido: "descripcion_negocio", etiqueta: "Descripción" },
  { datos: "publicoObjetivo", inferido: "publico_objetivo", etiqueta: "Público objetivo" },
  { datos: "tonoComunicacion", inferido: "tono_comunicacion", etiqueta: "Tono de comunicación" },
  { datos: "zonaCobertura", inferido: "zona_cobertura", etiqueta: "Zona de cobertura" },
  { datos: "diferenciales", inferido: "diferenciales", etiqueta: "Diferenciales" },
];

export type Novedad =
  | {
      tipo: "campo";
      claves: string[];
      titulo: string;
      detalle: string;
      /** Valor que hoy tiene el usuario (para mostrar "antes → ahora"). */
      actual: string;
      propuesta: PropuestaPerfil;
    }
  | {
      tipo: "producto_nuevo";
      claves: string[];
      titulo: string;
      detalle: string;
      propuesta: PropuestaPerfil;
    }
  | {
      tipo: "precio";
      claves: string[];
      titulo: string;
      detalle: string;
      actual: string;
      propuesta: PropuestaPerfil;
    }
  | {
      tipo: "zona";
      claves: string[];
      titulo: string;
      detalle: string;
      propuesta: PropuestaPerfil;
    };

/** Minúsculas, sin acentos ni signos, espacios simples. */
export function normalizarTexto(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9$ ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Monto de un precio sin formato ("$ 70.650" → "70650"). Los centavos se
 * descartan: un separador seguido de 1 o 2 dígitos al final ("100.000,00",
 * "1.250,5") son decimales, no miles. Si no, "$100.000,00" valdría 10.000.000.
 */
function montoDe(precio: string): string {
  const sinDecimales = precio.trim().replace(/[.,]\d{1,2}(?!\d)\s*$/, "");
  return sinDecimales.replace(/[^0-9]/g, "").replace(/^0+/, "");
}

/**
 * true si dos textos dicen "lo mismo": uno contiene al otro, o comparten la
 * mayoría de las palabras. Evita que cada reformulación de la IA se presente
 * como una novedad.
 */
export function textosSimilares(a: string, b: string): boolean {
  const na = normalizarTexto(a);
  const nb = normalizarTexto(b);
  if (!na || !nb) return false;
  if (na === nb || na.includes(nb) || nb.includes(na)) return true;
  const pa = new Set(na.split(" ").filter((w) => w.length > 2));
  const pb = new Set(nb.split(" ").filter((w) => w.length > 2));
  if (!pa.size || !pb.size) return false;
  let comunes = 0;
  for (const w of pa) if (pb.has(w)) comunes++;
  return comunes / (pa.size + pb.size - comunes) >= UMBRAL_SIMILITUD;
}

const claveCampo = (campo: string, valor: string) => `campo:${campo}:${normalizarTexto(valor)}`.slice(0, 300);
const claveZona = (lugar: string) => `zona:${normalizarTexto(lugar)}`.slice(0, 300);
const claveProductoNuevo = (nombre: string) => `producto:${claveProducto(nombre)}`.slice(0, 300);
const clavePrecio = (nombre: string, precio: string) =>
  `precio:${claveProducto(nombre)}:${montoDe(precio)}`.slice(0, 300);

/**
 * Calcula las novedades que hay que mostrar.
 *
 * - Campo de texto: la IA detectó algo que no se parece a lo cargado.
 *   Si el campo está vacío no es novedad (se completa solo).
 * - Zona de cobertura: lugares detectados que no aparecen en el texto cargado
 *   (se ofrece agregarlos, no reemplazar).
 * - Producto nuevo: no está en la lista. Si la lista está vacía no es novedad
 *   (se carga sola la primera vez).
 * - Precio: el producto existe con otro precio y la IA vio uno explícito.
 */
export function calcularNovedades(
  datos: DatosNegocioBase,
  inferido: PerfilNegocioInferido,
  ignorados: string[],
): Novedad[] {
  const ign = new Set(ignorados);
  const out: Novedad[] = [];

  for (const def of CAMPOS) {
    const c = inferido[def.inferido];
    const valor = c?.valor?.trim();
    if (!c || !valor || c.confianza < MIN_CONFIANZA) continue;
    const actual = (datos[def.datos] ?? "").trim();
    if (!actual) continue;

    if (def.datos === "zonaCobertura") {
      // Se compara lugar por lugar: el texto libre de la zona casi nunca coincide.
      const nuevos = (c.ubicaciones ?? [])
        .map((u) => u.trim())
        .filter((u) => u && !normalizarTexto(actual).includes(normalizarTexto(u)) && !ign.has(claveZona(u)));
      if (nuevos.length) {
        out.push({
          tipo: "zona",
          claves: nuevos.map(claveZona),
          titulo: nuevos.length === 1 ? `Nueva zona: ${nuevos[0]}` : `Nuevas zonas: ${nuevos.join(", ")}`,
          detalle: "Aparecen en tus chats y no están en tu zona de cobertura. Se agregan al final del texto.",
          propuesta: { zonaCobertura: `${actual.replace(/[.\s]+$/, "")}, ${nuevos.join(", ")}` },
        });
      }
      continue;
    }

    if (textosSimilares(actual, valor)) continue;
    const clave = claveCampo(def.inferido, valor);
    if (ign.has(clave)) continue;
    const propuesta: PropuestaPerfil = {};
    propuesta[def.datos] = valor;
    out.push({
      tipo: "campo",
      claves: [clave],
      titulo: def.etiqueta,
      detalle: valor,
      actual,
      propuesta,
    });
  }

  const actuales = new Map(datos.productos.map((p) => [claveProducto(p.nombre), p]));
  for (const p of inferido.productos ?? []) {
    const nombre = p.nombre?.trim();
    if (!nombre || p.confianza < MIN_CONFIANZA) continue;
    const existente = actuales.get(claveProducto(nombre));

    if (!existente) {
      if (datos.productos.length === 0) continue;
      const clave = claveProductoNuevo(nombre);
      if (ign.has(clave)) continue;
      out.push({
        tipo: "producto_nuevo",
        claves: [clave],
        titulo: `Producto nuevo: ${nombre}`,
        detalle: p.precio ? `Precio detectado: ${p.precio}` : "Sin precio detectado.",
        propuesta: { productosUpsert: [{ nombre, precio: p.precio, descripcion: p.descripcion }] },
      });
      continue;
    }

    const nuevoMonto = montoDe(p.precio ?? "");
    if (!nuevoMonto || nuevoMonto === montoDe(existente.precio ?? "")) continue;
    const clave = clavePrecio(nombre, p.precio);
    if (ign.has(clave)) continue;
    out.push({
      tipo: "precio",
      claves: [clave],
      titulo: `Precio de ${existente.nombre}`,
      detalle: `En tus chats aparece a ${p.precio}.`,
      actual: existente.precio || "sin precio",
      propuesta: { productosUpsert: [{ nombre: existente.nombre, precio: p.precio }] },
    });
  }

  return out;
}

/**
 * Junta varias propuestas en una sola, para "Aceptar todas". Los productos se
 * concatenan; los campos de texto no se pisan entre sí porque cada novedad
 * toca un campo distinto.
 */
export function juntarPropuestas(propuestas: PropuestaPerfil[]): PropuestaPerfil {
  const out: PropuestaPerfil = {};
  for (const p of propuestas) {
    const { productosUpsert, productosQuitar, ...texto } = p;
    Object.assign(out, texto);
    if (productosUpsert?.length) out.productosUpsert = [...(out.productosUpsert ?? []), ...productosUpsert];
    if (productosQuitar?.length) out.productosQuitar = [...(out.productosQuitar ?? []), ...productosQuitar];
  }
  return out;
}
