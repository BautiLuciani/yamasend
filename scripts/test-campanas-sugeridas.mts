// Prueba de la lógica de campañas sugeridas.
// Correr con: node --experimental-strip-types --import ./scripts/register-alias.mjs scripts/test-campanas-sugeridas.mts
import { armarSugeridas, coincideConProducto, palabrasDeProducto, nombreDeLista } from "@/lib/campanas/sugeridas";
import assert from "node:assert/strict";

const ahora = new Date("2026-10-06T12:00:00Z").getTime();
const hace = (d: number) => new Date(ahora - d * 86400000).toISOString();
const compradores = [
  { leadId: "A", nombre: "Ana", compras: 5, ultimaCompra: hace(20), ultimaCampanaEnviadaAt: null },
  { leadId: "B", nombre: "Beto", compras: 1, ultimaCompra: hace(3), ultimaCampanaEnviadaAt: null },
  { leadId: "C", nombre: "Carla", compras: 3, ultimaCompra: hace(40), ultimaCampanaEnviadaAt: hace(2) }, // campaña reciente: afuera
  { leadId: "D", nombre: "PETS CENTER Castelar", compras: 9, ultimaCompra: hace(30), ultimaCampanaEnviadaAt: null }, // número propio: afuera
  { leadId: "E", nombre: null, compras: 2, ultimaCompra: hace(15), ultimaCampanaEnviadaAt: hace(30) },
];
const lead = (id: string, prod: string, extra = {}) => ({ id, nombre: id, productoServicio: prod, necesidad: null, keywords: [], ultimaCampanaEnviadaAt: null, ...extra });
const leads = [
  lead("L1", "alimento Pro Plan para perro adulto"), lead("L2", "pro plan perros adultos"), lead("L3", "Pro Plan adulto perro mediano"),
  lead("L4", "pro plan perro adulto", { ultimaCampanaEnviadaAt: hace(1) }), // campaña reciente: afuera
  lead("L5", "royal canin gato"), lead("L6", "piedras sanitarias"),
];
const productos = [{ nombre: "Pro Plan Perro Adulto" }, { nombre: "Royal Canin Gato Adulto" }];
const entrada = { compradores, leads, productos, negocio: "Pets Center", ahora };

const [inact, prod, mejores] = armarSugeridas(entrada);

// 1. No compran hace 2 semanas: A (20d) y E (15d). B compró hace 3d, C tuvo campaña, D es propio.
assert.deepEqual(inact.leadIds, ["A", "E"]);
assert.equal(inact.excluidosPorCampanaReciente, 1);
assert.ok(inact.disponible && inact.mensajeSugerido.includes("Pets Center"));

// 2. Por producto: Pro Plan tiene 3 clientes válidos (L1-L3; L4 con campaña reciente no cuenta); Royal Canin solo 1.
assert.equal(prod.producto, "Pro Plan Perro Adulto");
assert.deepEqual(prod.leadIds, ["L1", "L2", "L3"]);
assert.deepEqual(prod.productosAlternativos, [{ nombre: "Pro Plan Perro Adulto", cantidad: 3 }]);
assert.ok(prod.mensajeSugerido.includes("Pro Plan Perro Adulto"));
// Elegir un producto que no está en el ranking cae al primero
assert.equal(armarSugeridas({ ...entrada, productoElegido: "Royal Canin Gato Adulto" })[1].producto, "Pro Plan Perro Adulto");

// 3. Mejores: solo con 2+ compras entre los aptos (A=5, E=2); orden por compras
assert.deepEqual(mejores.leadIds, ["A", "E"]);
assert.equal(nombreDeLista("mejores_compradores"), "Sugerida: Mejores compradores");
assert.equal(nombreDeLista("por_producto", "Pro Plan"), "Sugerida: Interesados en Pro Plan");

// Sin compras detectadas: 1 y 3 no disponibles con motivo; 2 sigue funcionando
const sinCompras = armarSugeridas({ ...entrada, compradores: [] });
assert.equal(sinCompras[0].disponible, false);
assert.match(sinCompras[0].motivoNoDisponible!, /gracias por tu compra/);
assert.equal(sinCompras[2].disponible, false);
assert.equal(sinCompras[1].disponible, true);

// Sin productos cargados: no disponible, con motivo accionable
assert.match(armarSugeridas({ ...entrada, productos: [] })[1].motivoNoDisponible!, /Perfil/);

// Todos compraron hace poco
const recientes = armarSugeridas({ ...entrada, compradores: [{ leadId: "Z", nombre: "Zoe", compras: 1, ultimaCompra: hace(1), ultimaCampanaEnviadaAt: null }] });
assert.equal(recientes[0].disponible, false);
assert.match(recientes[0].motivoNoDisponible!, /últimos 14 días/);

// Coincidencia de producto: singular/plural y sin acentos
assert.ok(coincideConProducto("perros adultos, alimento", palabrasDeProducto("Alimento para Perro Adulto")));
assert.ok(!coincideConProducto("piedras sanitarias", palabrasDeProducto("Pro Plan Perro Adulto")));
// Con un solo dato en común de varios, no alcanza
assert.ok(!coincideConProducto("perro", palabrasDeProducto("Pro Plan Perro Adulto")));

// Tope de mejores: 20% de aptos, mínimo 5
const muchos = Array.from({ length: 60 }, (_, i) => ({ leadId: `M${i}`, nombre: `M${i}`, compras: 2 + (i % 5), ultimaCompra: hace(20), ultimaCampanaEnviadaAt: null }));
assert.equal(armarSugeridas({ ...entrada, compradores: muchos })[2].cantidad, 12);

// Regresión (datos reales): productos de una misma marca NO deben dar la misma audiencia.
const marca = ["Royal Canin Early Renal", "Royal Canin Maxi Adulto", "Royal Canin Mini Starter", "Royal Canin Medium Puppy", "Pro Plan Salmon"].map((nombre) => ({ nombre }));
const leadsMarca = [
  ...["R1", "R2", "R3"].map((id) => lead(id, "royal canin early renal")),
  ...["X1", "X2", "X3"].map((id) => lead(id, "royal canin maxi adulto")),
  lead("S1", "royal canin"), // solo la marca: no debe entrar en ningún producto
];
const m = armarSugeridas({ ...entrada, productos: marca, leads: leadsMarca })[1];
assert.deepEqual(m.productosAlternativos!.map((a) => a.cantidad), [3, 3]);
assert.deepEqual(m.leadIds.sort(), ["R1", "R2", "R3"]);
const m2 = armarSugeridas({ ...entrada, productos: marca, leads: leadsMarca, productoElegido: "Royal Canin Maxi Adulto" })[1];
assert.deepEqual(m2.leadIds.sort(), ["X1", "X2", "X3"]);

// Regresión (datos reales): "canine" NO coincide con "canin" por prefijo.
const renal = armarSugeridas({
  ...entrada,
  productos: ["Royal Canin Renal Canine", "Royal Canin Mini Adulto", "Pro Plan Salmon", "Fawna Gato"].map((nombre) => ({ nombre })),
  leads: ["R1", "R2", "R3", "R4"].map((id) => lead(id, "Royal Canin Fit 32 de 3 kg")),
})[1];
assert.equal(renal.disponible, false, "clientes de la marca sola no deben asociarse a un producto puntual");

// Productos de la misma línea con idéntica audiencia no se repiten en las alternativas.
const linea = armarSugeridas({
  ...entrada,
  // Con un catálogo chico "mini" sería palabra común; hace falta uno más grande para que sea distintiva.
  productos: ["Royal Canin Mini Starter", "Royal Canin Mini Adulto", "Fawna Gato", "Alfa Uno", "Bravo Dos", "Charlie Tres", "Delta Cuatro", "Eco Cinco", "Foxtrot Seis", "Golf Siete", "Hotel Ocho"].map((nombre) => ({ nombre })),
  leads: ["Q1", "Q2", "Q3"].map((id) => lead(id, "royal canin mini")),
})[1];
assert.equal(linea.productosAlternativos!.length, 1);

console.log("campañas sugeridas OK");
