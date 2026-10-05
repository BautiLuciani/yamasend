import type { Producto, PropuestaPerfil } from "@/lib/types";

/**
 * Lógica pura (sin red ni base) para aplicar cambios del perfil inteligente
 * sobre "Datos de la empresa". Vive aparte de las server actions para poder
 * probarla sin levantar nada y para que las tres entradas (aplicar un campo
 * inferido, aplicar una propuesta del asistente, importar una lista de
 * precios) compartan exactamente la misma regla de fusión.
 */

export const MAX_PRODUCTOS = 200;
const MAX_TEXTO = 2000;

/** Clave de comparación: minúsculas, sin acentos ni espacios repetidos. */
export function claveProducto(nombre: string): string {
  return nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function limpiarProducto(p: Producto): Producto | null {
  const nombre = (p.nombre ?? "").toString().trim().slice(0, 200);
  if (!nombre) return null;
  const out: Producto = { nombre };
  const precio = (p.precio ?? "").toString().trim().slice(0, 60);
  const descripcion = (p.descripcion ?? "").toString().trim().slice(0, 500);
  if (precio) out.precio = precio;
  if (descripcion) out.descripcion = descripcion;
  return out;
}

export interface ResultadoFusion {
  productos: Producto[];
  agregados: number;
  actualizados: number;
  quitados: number;
}

/**
 * Fusiona `upsert` y `quitar` sobre la lista actual.
 * - Si el nombre ya existe, se actualizan precio y descripción solo cuando
 *   vienen con valor: un dato vacío nunca borra uno cargado.
 * - Lo que ya estaba conserva su orden; lo nuevo va al final.
 */
export function fusionarProductos(
  actuales: Producto[],
  upsert: Producto[] = [],
  quitar: string[] = [],
): ResultadoFusion {
  const lista: Producto[] = actuales.map((p) => ({ ...p }));
  const indice = new Map<string, number>();
  lista.forEach((p, i) => indice.set(claveProducto(p.nombre), i));

  let agregados = 0;
  let actualizados = 0;

  for (const bruto of upsert) {
    const p = limpiarProducto(bruto);
    if (!p) continue;
    const k = claveProducto(p.nombre);
    const i = indice.get(k);
    if (i === undefined) {
      if (lista.length >= MAX_PRODUCTOS) continue;
      indice.set(k, lista.length);
      lista.push(p);
      agregados++;
      continue;
    }
    const previo = lista[i];
    const nuevo: Producto = { ...previo };
    if (p.precio) nuevo.precio = p.precio;
    if (p.descripcion) nuevo.descripcion = p.descripcion;
    if (nuevo.precio !== previo.precio || nuevo.descripcion !== previo.descripcion) {
      lista[i] = nuevo;
      actualizados++;
    }
  }

  let quitados = 0;
  const aQuitar = new Set(quitar.map(claveProducto).filter(Boolean));
  const resultado = lista.filter((p) => {
    if (aQuitar.has(claveProducto(p.nombre))) {
      quitados++;
      return false;
    }
    return true;
  });

  return { productos: resultado, agregados, actualizados, quitados };
}

type CamposTexto = Pick<
  PropuestaPerfil,
  | "nombreEmpresa"
  | "rubro"
  | "descripcionNegocio"
  | "publicoObjetivo"
  | "tonoComunicacion"
  | "zonaCobertura"
  | "diferenciales"
  | "reglasEvitar"
>;

const CAMPOS_TEXTO: (keyof CamposTexto)[] = [
  "nombreEmpresa",
  "rubro",
  "descripcionNegocio",
  "publicoObjetivo",
  "tonoComunicacion",
  "zonaCobertura",
  "diferenciales",
  "reglasEvitar",
];

export interface DatosNegocioBase extends CamposTexto {
  nombreEmpresa: string;
  rubro: string;
  descripcionNegocio: string;
  publicoObjetivo: string;
  tonoComunicacion: string;
  zonaCobertura: string;
  diferenciales: string;
  reglasEvitar: string;
  productos: Producto[];
}

export interface ResultadoPropuesta<T extends DatosNegocioBase> {
  datos: T;
  camposCambiados: (keyof CamposTexto)[];
  agregados: number;
  actualizados: number;
  quitados: number;
  huboCambios: boolean;
}

/** Aplica una propuesta sobre los datos actuales sin mutarlos. */
export function aplicarPropuesta<T extends DatosNegocioBase>(
  datos: T,
  propuesta: PropuestaPerfil,
): ResultadoPropuesta<T> {
  const nuevos: T = { ...datos };
  const camposCambiados: (keyof CamposTexto)[] = [];

  for (const campo of CAMPOS_TEXTO) {
    const valor = propuesta[campo];
    if (typeof valor !== "string") continue;
    const limpio = valor.trim().slice(0, MAX_TEXTO);
    if (!limpio || limpio === datos[campo]) continue;
    nuevos[campo] = limpio;
    camposCambiados.push(campo);
  }

  const fusion = fusionarProductos(
    datos.productos,
    propuesta.productosUpsert,
    propuesta.productosQuitar,
  );
  nuevos.productos = fusion.productos;

  return {
    datos: nuevos,
    camposCambiados,
    agregados: fusion.agregados,
    actualizados: fusion.actualizados,
    quitados: fusion.quitados,
    huboCambios:
      camposCambiados.length > 0 ||
      fusion.agregados > 0 ||
      fusion.actualizados > 0 ||
      fusion.quitados > 0,
  };
}
