// Prueba de la lógica de fusión de productos del perfil inteligente.
// Correr con: node --experimental-strip-types --import ./scripts/register-alias.mjs scripts/test-perfil-fusion.mts
// @ts-expect-error la extensión .ts es necesaria para correrlo con node --experimental-strip-types
import { fusionarProductos, aplicarPropuesta, claveProducto } from "../lib/perfil/fusion.ts";
import assert from "node:assert/strict";
const act = [{ nombre: "Pro Plan Adulto", precio: "$100", descripcion: "15 kg" }, { nombre: "Correa", precio: "" }];
// existente: precio nuevo pisa, descripción vacía NO borra; acentos/mayúsculas matchean
let r = fusionarProductos(act, [{ nombre: "  pro plan  ADULTO ", precio: "$120", descripcion: "" }, { nombre: "Cucha", precio: "$5000" }]);
assert.equal(r.agregados, 1); assert.equal(r.actualizados, 1);
assert.equal(r.productos[0].precio, "$120"); assert.equal(r.productos[0].descripcion, "15 kg");
assert.equal(r.productos[2].nombre, "Cucha");
// quitar
r = fusionarProductos(act, [], ["CORREA"]); assert.equal(r.quitados, 1); assert.equal(r.productos.length, 1);
// nombre vacío se ignora y no muta el original
r = fusionarProductos(act, [{ nombre: "  " }]); assert.equal(r.agregados, 0); assert.equal(act.length, 2);
assert.equal(claveProducto("Café  Ñandú"), "cafe nandu");
// aplicarPropuesta: texto vacío no pisa; sin cambios => huboCambios false
const base = { nombreEmpresa: "A", rubro: "x", descripcionNegocio: "", publicoObjetivo: "", tonoComunicacion: "", zonaCobertura: "", diferenciales: "", reglasEvitar: "", productos: act };
let p = aplicarPropuesta(base, { rubro: "  ", nombreEmpresa: "A" }); assert.equal(p.huboCambios, false);
p = aplicarPropuesta(base, { rubro: "Mascotas", productosUpsert: [{ nombre: "Cucha" }] });
assert.deepEqual(p.camposCambiados, ["rubro"]); assert.equal(p.datos.rubro, "Mascotas"); assert.equal(base.rubro, "x"); assert.equal(p.agregados, 1);
console.log("fusion OK");
