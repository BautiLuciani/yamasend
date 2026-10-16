/**
 * Pruebas del Asistente con datos FALSOS en memoria (no toca ninguna base).
 * Correr con: npx tsx scripts/test-asistente.ts
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buscarInactivosPorProducto,
  buscarReactivacion,
  parsearPesos,
  recomendarParaProducto,
} from "../lib/ia/inactivos";

const DIA = 24 * 60 * 60 * 1000;
const AHORA = Date.parse("2026-10-15T12:00:00Z");
const hace = (d: number) => new Date(AHORA - d * DIA).toISOString();

// ── Datos falsos ─────────────────────────────────────────────────────────
const leads = [
  { id: "l1", nombre: "Ana", telefono: "5491100000001", lid: null, ultima_campana_enviada_at: null },
  { id: "l2", nombre: "Beto", telefono: "5491100000002", lid: null, ultima_campana_enviada_at: null },
  { id: "l3", nombre: "Carla", telefono: "5491100000003", lid: null, ultima_campana_enviada_at: null },
  { id: "l4", nombre: "Dario", telefono: "5491100000004", lid: null, ultima_campana_enviada_at: hace(2) }, // campaña reciente
  { id: "l5", nombre: "Eva", telefono: "5491100000005", lid: null, ultima_campana_enviada_at: null },
  // Tope de marketing: Fede recibió campaña hace 3 días y CONTESTÓ después → no se bloquea.
  { id: "l6", nombre: "Fede", telefono: "5491100000006", lid: null, ultima_campana_enviada_at: hace(3) },
  // Gus recibió campaña hace 3 días y no contestó → bloqueado.
  { id: "l7", nombre: "Gus", telefono: "5491100000007", lid: null, ultima_campana_enviada_at: hace(3) },
  // Hugo recibió campaña hace 12 días y no contestó → ya pasaron los 10 días, se libera.
  { id: "l8", nombre: "Hugo", telefono: "5491100000008", lid: null, ultima_campana_enviada_at: hace(12) },
];

const compradores = [
  // Ana compró hace 40 días (2 veces), Beto hace 5 días, Carla hace 20.
  { lead_id: "l1", nombre: "Ana", telefono: "5491100000001", compras: 2, ultima_compra: hace(40), ultima_campana_enviada_at: null },
  { lead_id: "l2", nombre: "Beto", telefono: "5491100000002", compras: 1, ultima_compra: hace(5), ultima_campana_enviada_at: null },
  { lead_id: "l3", nombre: "Carla", telefono: "5491100000003", compras: 3, ultima_compra: hace(20), ultima_campana_enviada_at: null },
  { lead_id: "l4", nombre: "Dario", telefono: "5491100000004", compras: 1, ultima_compra: hace(60), ultima_campana_enviada_at: hace(2) },
];

const mensajes = [
  { telefono: "5491100000001", lid: null, contenido: "Hola, cuánto sale el Royal Canin Adulto?", fecha: hace(45), enviado_por_mi: false },
  { telefono: "5491100000002", lid: null, contenido: "Quiero el Royal Canin Adulto por favor", fecha: hace(6), enviado_por_mi: false },
  { telefono: "5491100000003", lid: null, contenido: "Me pasás el precio del Pro Plan Cachorro?", fecha: hace(25), enviado_por_mi: false },
  { telefono: "5491100000004", lid: null, contenido: "Busco Royal Canin Adulto", fecha: hace(65), enviado_por_mi: false },
  { telefono: "5491100000005", lid: null, contenido: "Hola! tienen Royal Canin Adulto?", fecha: hace(3), enviado_por_mi: false },
  { telefono: "5491100000005", lid: null, contenido: "Sí, tenemos Royal Canin Adulto", fecha: hace(3), enviado_por_mi: true },
  { telefono: "5491100000006", lid: null, contenido: "Che, precio del Royal Canin Adulto?", fecha: hace(1), enviado_por_mi: false },
  { telefono: "5491100000007", lid: null, contenido: "Quiero el Royal Canin Adulto", fecha: hace(8), enviado_por_mi: false },
  { telefono: "5491100000008", lid: null, contenido: "Busco Royal Canin Adulto", fecha: hace(20), enviado_por_mi: false },
];

// ── Supabase falso: encadenable y "await"-able ───────────────────────────
function tabla(rows: unknown[]) {
  const q: Record<string, unknown> = {};
  const chain = () => q;
  for (const m of ["select", "eq", "gte", "or", "order", "limit", "in", "neq"]) q[m] = chain;
  q.then = (res: (v: unknown) => unknown) => res({ data: rows, error: null });
  return q;
}
const fake = {
  from(t: string) {
    if (t === "yamas_send_leads") return tabla(leads);
    if (t === "yamas_send_mensajes_historico") return tabla(mensajes);
    return tabla([]);
  },
  rpc(n: string) {
    return tabla(n === "yamas_send_compradores_detectados" ? compradores : []);
  },
} as unknown as SupabaseClient;

// ── Mini runner ──────────────────────────────────────────────────────────
let fallos = 0;
function ok(nombre: string, cond: boolean, detalle?: unknown) {
  console.log(`${cond ? "✔" : "✘"} ${nombre}${cond ? "" : "  → " + JSON.stringify(detalle)}`);
  if (!cond) fallos++;
}

async function main() {
  // Pesos
  for (const [entrada, esperado] of [
    ["$ 50,000", 50000],
    ["50.000", 50000],
    ["50k", 50000],
    ["50 lucas", 50000],
    ["$50 mil", 50000],
    [50000, 50000],
  ] as const) {
    ok(`parsearPesos(${JSON.stringify(entrada)}) = ${esperado}`, parsearPesos(entrada) === esperado, parsearPesos(entrada));
  }
  ok("parsearPesos('abc') = null", parsearPesos("abc") === null);

  // Caso 1: no compran hace 15 días de Royal Canin Adulto y Pro Plan Cachorro
  const c1 = await buscarInactivosPorProducto({
    supabase: fake,
    tenantId: "t",
    productos: ["Royal Canin Adulto", "Pro Plan Cachorro"],
    dias: 15,
    ahora: AHORA,
  });
  const tels1 = c1.contactos.map((c) => c.telefono).sort();
  // Ana (40d) y Carla (20d) entran; Beto compró hace 5d (fuera); Dario recibió campaña (fuera);
  // Eva nunca compró y habló del producto (entra).
  ok(
    "caso 1: entran Ana, Carla, Eva, Fede y Hugo (Gus bloqueado por el tope)",
    JSON.stringify(tels1) === JSON.stringify(["5491100000001", "5491100000003", "5491100000005", "5491100000006", "5491100000008"]),
    tels1,
  );
  ok("caso 1: descarta a Beto por compra reciente", c1.conCompraReciente === 1, c1.conCompraReciente);
  ok("caso 1: descarta a Darío y Gus por el tope de marketing", c1.conCampanaReciente === 2, c1.conCampanaReciente);
  ok("caso 1: une varios productos (Carla por Pro Plan)", c1.contactos.some((c) => c.telefono === "5491100000003" && c.productos.includes("Pro Plan Cachorro")));
  ok("caso 1: ordena por compras (Carla 3 > Ana 2 > Eva 0)", c1.contactos[0]?.telefono === "5491100000003", c1.contactos.map((c) => c.nombre));

  const c1b = await buscarInactivosPorProducto({ supabase: fake, tenantId: "t", productos: ["Producto Inexistente Zeta"], dias: 15, ahora: AHORA });
  ok("caso 1: producto que nadie nombró → lista vacía", c1b.contactos.length === 0 && c1b.mencionaron === 0);

  // Caso 2: reactivación (presupuesto): quienes compraron y llevan > 15 días
  const r = await buscarReactivacion({ supabase: fake, tenantId: "t", dias: 15, ahora: AHORA });
  const tels2 = r.contactos.map((c) => c.telefono);
  ok("caso 2: reactivación = Carla y Ana (de más a menos compras)", JSON.stringify(tels2) === JSON.stringify(["5491100000003", "5491100000001"]), tels2);
  ok("caso 2: Darío excluido por campaña reciente", r.conCampanaReciente === 1, r.conCampanaReciente);

  // Caso 3: a quién recomendarle Royal Canin Adulto
  const c3 = await recomendarParaProducto({ supabase: fake, tenantId: "t", producto: "Royal Canin Adulto", ahora: AHORA });
  const tels3 = c3.contactos.map((c) => c.telefono);
  ok("caso 3: excluye a Beto (compró hace 5 días)", !tels3.includes("5491100000002"), tels3);
  ok("caso 3: excluye a Darío (campaña reciente)", !tels3.includes("5491100000004"), tels3);
  ok("caso 3: primero Fede (preguntó precio y es reciente), después Eva y Ana", tels3[0] === "5491100000006" && tels3.includes("5491100000005") && tels3.includes("5491100000001"), tels3);
  ok("caso 3: motivo = preguntó precio para Ana", c3.contactos.find((c) => c.telefono === "5491100000001")?.motivo.includes("precio") === true);

  // Campaña múltiple: sin "días sin comprar" no se filtra por compra (Beto entra).
  const cm = await buscarInactivosPorProducto({ supabase: fake, tenantId: "t", productos: ["Royal Canin Adulto"], dias: 0, ahora: AHORA });
  ok("múltiple: dias=0 incluye a Beto aunque compró hace 5 días", cm.contactos.some((c) => c.telefono === "5491100000002"), cm.contactos.map((c) => c.nombre));

  // Tope de marketing (10 días sin respuesta)
  ok("tope: Fede (contestó después de la campaña) sí entra", tels3.includes("5491100000006"), tels3);
  ok("tope: Gus (campaña hace 3 días, sin respuesta) queda bloqueado", !tels3.includes("5491100000007"), tels3);
  ok("tope: Hugo (campaña hace 12 días) se libera", tels3.includes("5491100000008"), tels3);

  console.log(fallos === 0 ? "\nTODO OK" : `\n${fallos} FALLO(S)`);
  process.exit(fallos === 0 ? 0 : 1);
}
main();
