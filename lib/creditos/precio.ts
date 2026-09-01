import { createClient } from "@/lib/supabase/server";
import { createAdminClient, hayServiceRole } from "@/lib/supabase/admin";

/**
 * Precio de los créditos en pesos.
 *
 * La cadena es: costo en dólares que nos cobra Meta -> por el multiplicador ->
 * por la cotización del dólar -> menos el descuento del pack. Los tres primeros
 * factores viven en la base y nunca salen al cliente: la RPC
 * yamas_send_precios_creditos() devuelve solamente el resultado en pesos.
 *
 * Acá se resuelve la única pieza que Postgres no puede conseguir solo: la
 * cotización. Se busca en dolarapi.com, se valida, y se guarda en el caché con
 * service role para que el cálculo del precio siga siendo enteramente del
 * servidor.
 */

/**
 * Cada cuánto se vuelve a pedir la cotización. El dólar se mueve algunas veces
 * por día, así que media hora es de sobra y evita pegarle a dolarapi en cada
 * pantalla.
 */
const TTL_MINUTOS = 30;

/**
 * Variación máxima aceptada respecto de la última cotización conocida.
 *
 * Es una red de seguridad, no un límite de mercado. Si dolarapi devuelve
 * cualquier cosa —un cero, un valor en otra moneda, una respuesta corrupta—
 * y lo tomáramos como bueno, estaríamos vendiendo créditos a ese precio hasta
 * que alguien se dé cuenta. Ante un salto imposible se prefiere seguir con la
 * cotización vieja, que como mucho está desactualizada media hora.
 */
const VARIACION_MAX = 0.5;

/** Piso absoluto de plausibilidad, para el caso de que no haya valor previo. */
const COTIZACION_MINIMA_PLAUSIBLE = 100;

export interface PackPrecio {
  codigo: string;
  nombre: string;
  descripcion: string | null;
  creditos: number;
  destacado: boolean;
  descuentoPct: number;
  /** Precio final del pack en pesos, ya con descuento. */
  precioArs: number;
  /** Precio sin descuento, para poder tacharlo en la UI. */
  precioSinDescuentoArs: number;
  /** Precio por crédito de este pack. */
  precioUnitarioArs: number;
}

export interface PreciosCreditos {
  /** Precio de un crédito suelto, sin descuentos. */
  precioUnitarioArs: number;
  packs: PackPrecio[];
  /** Cotización usada, para poder mostrar "precio calculado al dólar de hoy". */
  cotizacion: number;
  cotizacionObtenidaAt: string | null;
  /** false mientras el cobro de créditos siga apagado globalmente. */
  habilitado: boolean;
}

export interface PreciosResult {
  ok: boolean;
  error: string | null;
  precios: PreciosCreditos | null;
}

interface DolarApiRespuesta {
  compra?: number;
  venta?: number;
  fechaActualizacion?: string;
}

/**
 * Trae la cotización de dolarapi.com y la guarda, pero solo si la que hay en
 * el caché ya venció.
 *
 * No tira error nunca: si algo falla, se sigue con la cotización guardada. Una
 * cotización de hace un rato es un problema chico; no poder mostrar precios
 * porque una API de terceros está caída es un problema grande.
 */
async function refrescarCotizacion(): Promise<void> {
  // Sin service role no se puede escribir el caché. Se sigue igual con lo que
  // haya guardado, así el entorno no queda roto por una variable faltante.
  if (!hayServiceRole()) return;

  try {
    const admin = createAdminClient();

    const { data: cfg } = await admin
      .from("yamas_send_config_creditos")
      .select("fuente_cotizacion")
      .eq("id", true)
      .maybeSingle();

    const fuente = cfg?.fuente_cotizacion ?? "blue";

    const { data: cache } = await admin
      .from("yamas_send_cotizacion_cache")
      .select("venta, obtenido_at")
      .eq("fuente", fuente)
      .maybeSingle();

    if (cache?.obtenido_at) {
      const edadMin = (Date.now() - new Date(cache.obtenido_at).getTime()) / 60000;
      if (edadMin < TTL_MINUTOS) return;
    }

    // no-store a propósito: el vencimiento lo maneja el TTL de arriba contra la
    // base, que es igual para todas las instancias serverless. Depender del
    // caché de fetch daría una ventana distinta por instancia.
    const res = await fetch(`https://dolarapi.com/v1/dolares/${fuente}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) return;

    const json = (await res.json()) as DolarApiRespuesta;
    const venta = Number(json?.venta);

    if (!Number.isFinite(venta) || venta < COTIZACION_MINIMA_PLAUSIBLE) return;

    // Freno ante un valor absurdo (ver VARIACION_MAX).
    const previa = cache?.venta ? Number(cache.venta) : null;
    if (previa && previa > 0) {
      const variacion = Math.abs(venta - previa) / previa;
      if (variacion > VARIACION_MAX) return;
    }

    await admin.from("yamas_send_cotizacion_cache").upsert(
      {
        fuente,
        compra: Number.isFinite(Number(json?.compra)) ? Number(json.compra) : null,
        venta,
        fecha_cotizacion: json?.fechaActualizacion ?? null,
        obtenido_at: new Date().toISOString(),
      },
      { onConflict: "fuente" },
    );
  } catch {
    // Timeout, red caída, JSON corrupto: se sigue con lo que haya en el caché.
  }
}

/**
 * Devuelve los packs con su precio en pesos, calculado íntegramente en el
 * servidor. El cliente nunca manda ni la cotización ni el precio.
 */
export async function getPreciosCreditos(): Promise<PreciosResult> {
  await refrescarCotizacion();

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("yamas_send_precios_creditos");

  if (error || !data) {
    return {
      ok: false,
      error: "No pudimos calcular el precio de los créditos en este momento.",
      precios: null,
    };
  }

  const r = data as {
    ok?: boolean;
    error?: string;
    habilitado?: boolean;
    cotizacion?: number;
    cotizacion_obtenida_at?: string | null;
    precio_unitario_ars?: number;
    packs?: Array<{
      codigo: string;
      nombre: string;
      descripcion: string | null;
      creditos: number;
      destacado: boolean;
      descuento_pct: number;
      precio_ars: number;
      precio_sin_descuento_ars: number;
      precio_unitario_ars: number;
    }>;
  };

  if (!r.ok) {
    return {
      ok: false,
      error:
        r.error === "sin_cotizacion"
          ? "No pudimos obtener la cotización del dólar. Probá de nuevo en unos minutos."
          : "No pudimos calcular el precio de los créditos en este momento.",
      precios: null,
    };
  }

  return {
    ok: true,
    error: null,
    precios: {
      precioUnitarioArs: Number(r.precio_unitario_ars ?? 0),
      cotizacion: Number(r.cotizacion ?? 0),
      cotizacionObtenidaAt: r.cotizacion_obtenida_at ?? null,
      habilitado: Boolean(r.habilitado),
      packs: (r.packs ?? []).map((p) => ({
        codigo: p.codigo,
        nombre: p.nombre,
        descripcion: p.descripcion,
        creditos: p.creditos,
        destacado: p.destacado,
        descuentoPct: Number(p.descuento_pct ?? 0),
        precioArs: Number(p.precio_ars ?? 0),
        precioSinDescuentoArs: Number(p.precio_sin_descuento_ars ?? 0),
        precioUnitarioArs: Number(p.precio_unitario_ars ?? 0),
      })),
    },
  };
}
