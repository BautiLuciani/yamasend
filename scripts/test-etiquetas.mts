// Prueba de la lógica de etiquetas.
// Correr con: node --experimental-strip-types --import ./scripts/register-alias.mjs scripts/test-etiquetas.mts
import {
  colorDeEtiqueta, contactosConEtiquetas, contarEtiquetas, esEtiquetaDeSistema, mostrarEtiqueta,
  normalizarEtiqueta, normalizarEtiquetas, sugerirEtiquetas,
} from "@/lib/etiquetas/etiquetas";
import assert from "node:assert/strict";

// Normalización (igual que la base)
assert.equal(normalizarEtiqueta("  Eukanuba  "), "eukanuba");
assert.equal(normalizarEtiqueta("Royal   Canin"), "royal canin");
assert.equal(normalizarEtiqueta("bad!tag"), null);
assert.equal(normalizarEtiqueta("   "), null);
assert.equal(normalizarEtiqueta("Mayorista Núñez"), "mayorista núñez");
assert.equal(normalizarEtiqueta("x".repeat(40))!.length, 30);
assert.deepEqual(normalizarEtiquetas(["Nuevo", "nuevo ", "bad!", "Cliente"]), ["cliente", "nuevo"]);
assert.ok(esEtiquetaDeSistema("cliente") && !esEtiquetaDeSistema("nuevo"));
assert.equal(mostrarEtiqueta("royal canin"), "Royal canin");

// Colores estables y "cliente" en verde
assert.deepEqual(colorDeEtiqueta("eukanuba"), colorDeEtiqueta("eukanuba"));
assert.equal(colorDeEtiqueta("cliente").text, "#067647");

// Etiquetas acumulables: cliente + eukanuba + nuevo
const c = (id: string, etiquetas: string[], extra = {}) => ({ id, etiquetas, textoInteres: "", ...extra });
const contactos = [
  c("1", ["cliente", "eukanuba", "nuevo"]),
  c("2", ["cliente", "eukanuba"]),
  c("3", ["cliente"]),
  c("4", ["eukanuba", "nuevo"]),
  c("5", []),
];
assert.deepEqual(contactosConEtiquetas(contactos, ["cliente", "eukanuba", "nuevo"]).map((x) => x.id), ["1"]);
assert.deepEqual(contactosConEtiquetas(contactos, ["cliente", "eukanuba"]).map((x) => x.id), ["1", "2"]);
assert.equal(contactosConEtiquetas(contactos, []).length, 5);
assert.equal(contactosConEtiquetas(contactos, ["inexistente"]).length, 0);

// Conteo: sistema primero, después por cantidad
assert.deepEqual(contarEtiquetas(contactos).map((x) => `${x.nombre}:${x.cantidad}`), ["cliente:3", "eukanuba:3", "nuevo:2"]);

// ---- Sugerencias ----
const ahora = new Date("2026-10-06T12:00:00Z").getTime();
const hace = (d: number) => new Date(ahora - d * 86400000).toISOString();
const productos = ["Royal Canin Mini Starter", "Royal Canin Maxi Adulto", "Eukanuba Top Condition", "Pro Plan Adulto Perro", "Correa Soft"];
const leads = [
  ...["a", "b", "c", "d"].map((id) => ({ id, etiquetas: ["cliente"], textoInteres: "alimento Royal Canin para perro", primerContactoAt: hace(100), compras: 1 })),
  ...["e", "f", "g"].map((id) => ({ id, etiquetas: [], textoInteres: "Eukanuba adulto", primerContactoAt: hace(5), compras: 4 })),
  { id: "h", etiquetas: [], textoInteres: "correa", primerContactoAt: hace(2), compras: 0 },
  // Contactos con otros intereses: sin ellos, "royal canin" cubriría a la mitad y no segmentaría.
  ...Array.from({ length: 8 }, (_, i) => ({ id: `o${i}`, etiquetas: [], textoInteres: "consulta general", primerContactoAt: hace(200), compras: 0 })),
];
const sug = sugerirEtiquetas({ contactos: leads, productos, ignoradas: [], ahora });
const por = (n: string) => sug.find((s) => s.etiqueta === n);

assert.deepEqual(por("nuevo")!.contactoIds.sort(), ["e", "f", "g", "h"]);          // primer contacto hace <= 30 días
assert.deepEqual(por("frecuente")!.contactoIds.sort(), ["e", "f", "g"]);            // 3+ compras
assert.deepEqual(por("royal canin")!.contactoIds.sort(), ["a", "b", "c", "d"]);     // la marca como UNA etiqueta
assert.ok(!por("royal") && !por("canin"), "no se sugieren las palabras sueltas de la marca");
assert.deepEqual(por("eukanuba")!.contactoIds.sort(), ["e", "f", "g"]);
assert.ok(!por("adulto") && !por("mini"), "palabras genéricas no son etiqueta");
assert.ok(!por("correa"), "menos de 3 contactos: no se sugiere");
assert.equal(por("eukanuba")!.origen, "producto");

// No sugiere lo que ya está en uso ni lo que se ignoró
const conTag = leads.map((l) => (["e", "f", "g"].includes(l.id) ? { ...l, etiquetas: ["eukanuba"] } : l));
assert.ok(!sugerirEtiquetas({ contactos: conTag, productos, ignoradas: [], ahora }).some((s) => s.etiqueta === "eukanuba"));
assert.ok(!sugerirEtiquetas({ contactos: leads, productos, ignoradas: ["nuevo", "royal canin"], ahora }).some((s) => ["nuevo", "royal canin"].includes(s.etiqueta)));

// Singular/plural: "gatos" cuenta para "gato"
const gatos = [
  ...["x", "y", "z"].map((id) => ({ id, etiquetas: [], textoInteres: "comida para gatos", primerContactoAt: null, compras: 0 })),
  ...Array.from({ length: 6 }, (_, i) => ({ id: `n${i}`, etiquetas: [], textoInteres: "consulta general", primerContactoAt: null, compras: 0 })),
];
assert.deepEqual(sugerirEtiquetas({ contactos: gatos, productos: ["Alimento Gato Adulto"], ignoradas: [], ahora }).map((s) => s.etiqueta), ["gato"]);

// Una etiqueta que cubre a casi todos no segmenta: "mascotas" en una tienda de mascotas.
const todos = Array.from({ length: 10 }, (_, i) => ({ id: `T${i}`, etiquetas: [], textoInteres: i < 8 ? "productos para mascotas" : "Eukanuba para mascotas", primerContactoAt: null, compras: 0 }));
const sugTodos = sugerirEtiquetas({ contactos: todos, productos: ["Alimento Mascotas Eukanuba"], ignoradas: [], ahora }).map((s) => s.etiqueta);
assert.ok(!sugTodos.includes("mascotas"), "mascotas cubre al 100%: no segmenta");
assert.ok(sugTodos.includes("eukanuba"), "con 2 contactos alcanza para una marca");

console.log("etiquetas OK");
