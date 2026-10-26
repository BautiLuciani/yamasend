// Prueba de las sugerencias de etiquetas (comportamiento, texto y temas).
// Correr con: node --experimental-strip-types --import ./scripts/register-alias.mjs scripts/test-etiquetas-sugerencias.mts
import { ORIGEN_LABEL, sugerirEtiquetas, type ContactoParaSugerir } from "@/lib/etiquetas/etiquetas";
import assert from "node:assert/strict";

const ahora = new Date("2026-10-06T12:00:00Z").getTime();
const hace = (d: number) => new Date(ahora - d * 86400000).toISOString();

let n = 0;
const c = (extra: Partial<ContactoParaSugerir> = {}): ContactoParaSugerir => ({
  id: `c${n++}`, etiquetas: [], textoInteres: "", ...extra,
});
const sug = (contactos: ContactoParaSugerir[], extra = {}) =>
  sugerirEtiquetas({ contactos, productos: [], ignoradas: [], ahora, ...extra });
const por = (lista: ReturnType<typeof sug>, etiqueta: string) => lista.find((s) => s.etiqueta === etiqueta);

// ---- Comportamiento ----
const base = [
  ...Array.from({ length: 3 }, () => c({ temperatura: "caliente", compras: 0 })),              // interesado
  c({ temperatura: "caliente", compras: 2 }),                                                  // caliente pero ya compró: no es "interesado"
  c({ temperatura: "caliente", compras: 0, etiquetas: ["cliente"] }),                          // es cliente: no es "interesado"
  ...Array.from({ length: 3 }, () => c({ ultimoMensajeAt: hace(90) })),                        // dormido
  c({ ultimoMensajeAt: hace(10) }),                                                            // activo: no
  ...Array.from({ length: 2 }, () => c({ sentimiento: "negativo" })),                          // reclamo
  ...Array.from({ length: 3 }, () => c({ compras: 1, primeraCompraAt: hace(100) })),           // compró una vez
  ...Array.from({ length: 2 }, () => c({ compras: 1, primeraCompraAt: hace(5) })),             // cliente nuevo (+ compró una vez)
];
const r1 = sug(base);
assert.equal(por(r1, "interesado")!.cantidad, 3);
assert.equal(por(r1, "dormido")!.cantidad, 3);
assert.equal(por(r1, "reclamo")!.cantidad, 2);
assert.equal(por(r1, "compró una vez")!.cantidad, 5);
assert.equal(por(r1, "cliente nuevo")!.cantidad, 2);
assert.ok(r1.every((s) => ["comportamiento", "texto", "producto", "tema"].includes(s.origen)));
assert.equal(por(r1, "interesado")!.origen, "comportamiento");

// Con muy pocos contactos no se sugiere (mínimos)
assert.ok(!por(sug([c({ sentimiento: "negativo" })]), "reclamo"));

// ---- Por lo que preguntan ----
const texto = [
  ...Array.from({ length: 2 }, () => c({ textoInteres: "venta mayorista de alimento" })),
  ...Array.from({ length: 2 }, () => c({ textoInteres: "Oportunidades laborales en el local" })),
  c({ textoInteres: "Ropa de trabajo y elementos de seguridad" }),    // "trabajo" suelto NO es empleo
  ...Array.from({ length: 2 }, () => c({ textoInteres: "propuesta comercial de un proveedor" })),
];
const r2 = sug(texto);
assert.equal(por(r2, "mayorista")!.cantidad, 2);
assert.equal(por(r2, "busca empleo")!.cantidad, 2, "ropa de trabajo no cuenta como búsqueda de empleo");
assert.equal(por(r2, "proveedor")!.cantidad, 2);
assert.equal(por(r2, "mayorista")!.origen, "texto");

// ---- Temas (palabras clave) ----
const kw = (...k: string[]) => c({ keywords: k, textoInteres: "" });
const temas = [
  ...Array.from({ length: 4 }, () => kw("envío", "mascotas", "compra")),
  ...Array.from({ length: 2 }, () => kw("envíos", "descuento")),
  ...Array.from({ length: 3 }, () => kw("descuento")),
  kw("promociones"), kw("promoción"),
  ...Array.from({ length: 8 }, () => kw("otro tema raro")),
];
const r3 = sug(temas, { palabrasNegocio: ["Venta de productos para mascotas"] });
const nombresTema = r3.filter((s) => s.origen === "tema").map((s) => s.etiqueta);
assert.ok(nombresTema.some((e) => e.startsWith("envío")), "envío y envíos se unen en un solo tema");
assert.equal(por(r3, nombresTema.find((e) => e.startsWith("envío"))!)!.cantidad, 6);
assert.ok(nombresTema.includes("descuento"));
assert.ok(!nombresTema.includes("mascotas"), "palabras del rubro del negocio no son tema");
assert.ok(!nombresTema.includes("compra"), "palabras genéricas no son tema");
assert.ok(!nombresTema.includes("promociones") || por(r3, "promociones")!.cantidad >= 3);

// Un tema que cubre a casi todos no segmenta
const todos = Array.from({ length: 10 }, () => kw("transferencia"));
assert.equal(sug(todos).filter((s) => s.origen === "tema").length, 0);

// No repite lo que ya está en uso ni lo ignorado
const conUso = temas.map((t) => ({ ...t, etiquetas: t.keywords!.includes("descuento") ? ["descuento"] : [] }));
assert.ok(!sug(conUso, { palabrasNegocio: ["mascotas"] }).some((s) => s.etiqueta === "descuento"));
assert.ok(!sug(temas, { palabrasNegocio: ["mascotas"], ignoradas: ["descuento"] }).some((s) => s.etiqueta === "descuento"));

// Tope total y etiquetas legibles
assert.ok(sug(base.concat(texto, temas)).length <= 18);
assert.equal(ORIGEN_LABEL.tema, "Por tema");

console.log("sugerencias de etiquetas OK");
