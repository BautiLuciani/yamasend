// Prueba de la lógica de novedades del perfil.
// Correr con: node --experimental-strip-types --import ./scripts/register-alias.mjs scripts/test-perfil-novedades.mts
// @ts-expect-error la extensión .ts es necesaria para correrlo con node --experimental-strip-types
import { calcularNovedades, juntarPropuestas, textosSimilares } from "../lib/perfil/novedades.ts";
import assert from "node:assert/strict";

const datos = {
  nombreEmpresa: "Pets Center", rubro: "Venta de productos para mascotas",
  descripcionNegocio: "Tienda de alimentos y accesorios para mascotas con sistema de puntos.",
  publicoObjetivo: "", tonoComunicacion: "Cercano, con emojis", zonaCobertura: "CABA y Castelar.",
  diferenciales: "", reglasEvitar: "",
  productos: [{ nombre: "Pro Plan Adulto", precio: "$100.000" }, { nombre: "Correa", precio: "" }],
};
const c = (valor: string, confianza = 0.9, extra = {}) => ({ valor, confianza, evidencia: [], ...extra });
const inferido = {
  nombre_empresa: c("PETS CENTER"),                                   // igual salvo mayúsculas: no es novedad
  rubro: c("Pet shop y veterinaria"),                                  // distinto: novedad
  descripcion_negocio: c("Pets Center ofrece alimentos y accesorios para mascotas, con sistema de puntos."), // reformulación: no
  publico_objetivo: c("Dueños de mascotas"),                           // celda vacía: no es novedad (se autocompleta)
  tono_comunicacion: c("cercano, uso de emojis", 0.3),                 // confianza baja: no
  zona_cobertura: c("CABA y GBA", 0.9, { ubicaciones: ["CABA", "Castelar", "Haedo"] }), // Haedo es nuevo
  productos: [
    { nombre: "pro plan adulto", precio: "$116.500", descripcion: "", confianza: 0.8, evidencia: [] }, // precio distinto
    { nombre: "Correa", precio: "", descripcion: "", confianza: 0.8, evidencia: [] },                  // sin precio: no
    { nombre: "Cucha exterior", precio: "$45.000", descripcion: "", confianza: 0.8, evidencia: [] },   // nuevo
    { nombre: "Jaula", precio: "", descripcion: "", confianza: 0.3, evidencia: [] },                   // confianza baja: no
  ],
};

let n = calcularNovedades(datos, inferido, []);
const tipos = n.map((x) => x.tipo).sort();
assert.deepEqual(tipos, ["campo", "precio", "producto_nuevo", "zona"], `tipos: ${tipos}`);
const campo = n.find((x) => x.tipo === "campo")!;
assert.equal(campo.titulo, "A qué se dedica");
assert.equal(n.find((x) => x.tipo === "zona")!.titulo, "Nueva zona: Haedo");
assert.equal(n.find((x) => x.tipo === "zona")!.propuesta.zonaCobertura, "CABA y Castelar, Haedo");

// Ignorar: no vuelve a aparecer; y si la IA cambia de opinión, sí.
const claves = n.flatMap((x) => x.claves);
assert.equal(calcularNovedades(datos, inferido, claves).length, 0);
const otro = { ...inferido, rubro: c("Veterinaria") };
assert.equal(calcularNovedades(datos, otro, claves).length, 1);

// Lista de productos vacía: los productos no son novedad (se cargan solos la primera vez)
assert.equal(calcularNovedades({ ...datos, productos: [] }, inferido, claves).length, 0);

// Mismo precio con otro formato: no es novedad
const mismoPrecio = { ...inferido, productos: [{ nombre: "Pro Plan Adulto", precio: "$ 100.000,00", descripcion: "", confianza: 0.9, evidencia: [] }] };
assert.equal(calcularNovedades(datos, { productos: mismoPrecio.productos }, []).length, 0);

assert.ok(textosSimilares("Cercano, con emojis", "cercano, uso de emojis"));
assert.ok(!textosSimilares("Veterinaria", "Pet shop"));
// Zonas nuevas se agrupan en una sola novedad
const dosZonas = { zona_cobertura: c("CABA", 0.9, { ubicaciones: ["CABA", "Haedo", "Morón"] }) };
const z = calcularNovedades(datos, dosZonas, []);
assert.equal(z.length, 1); assert.equal(z[0].claves.length, 2);
assert.equal(z[0].propuesta.zonaCobertura, "CABA y Castelar, Haedo, Morón");

// Aceptar todas: junta productos y campos sin pisarse
const junta = juntarPropuestas(n.map((x) => x.propuesta));
assert.equal(junta.rubro, "Pet shop y veterinaria");
assert.equal(junta.productosUpsert!.length, 2);
console.log("novedades OK");
