// Verificación punta a punta de los detectores deterministas del chat.
// Replica exactamente la lógica de lib/actions/ia.ts para poder probarla
// sin levantar Next ni pegarle a Supabase. Si se cambia el regex allá,
// este archivo tiene que actualizarse — es un chequeo de comportamiento,
// no un import.

function norm(texto) {
  return texto.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function detectarPedidoEdicion(texto) {
  const t = norm(texto);
  const verboEdicion = /\b(cambi|modific|edit|renombr|actualiz|pon|reprogram|reagend)/.test(t);
  if (!verboEdicion) return null;
  if (/temperatura/.test(t)) return "contacto";

  const mencionaNombre = /nombre|titulo|llamar|llama/.test(t) || /\brenombr/.test(t);
  const pideReprogramar = /\b(reprogram|reagend)/.test(t);
  const mencionaCampoCampana =
    /template|plantilla|audiencia|lista|grupo|fecha|horario|programacion|programada/.test(t) ||
    pideReprogramar;

  if (/campan/.test(t)) {
    if (mencionaNombre || mencionaCampoCampana) return "campana";
    return null;
  }
  if (pideReprogramar && /fecha|envio|horario/.test(t)) return "campana";
  if (mencionaNombre && /audiencia|lista|grupo/.test(t)) return "audiencia";
  return null;
}

function detectarPedidoCreacionSimple(texto) {
  const t = norm(texto).trim();
  if (/^(que|como|cuando|cuanto|cuantos|cuantas|donde|por que|porque|para que|cual)\b/.test(t)) {
    return null;
  }
  const verboCrear = /\b(cre(a|ar|ame|emos|o)|arm(a|ar|ame|emos|o)|hac(e|er|eme|emos|go)|gener(a|ar)|nuev[ao])\b/;
  if (!verboCrear.test(t)) return null;
  const tieneCriterio =
    /\bcon\b|\bde los\b|\bque hablaron\b|\bque hablo\b|\bpara los\b|\bcalient|\btibi|\bfrio|\binteresad|\bese\b|\besos\b|\bestos\b|\beste\b|\besa\b|\besas\b|\bmostrast|\bencontrast/.test(t);
  if (tieneCriterio) return null;
  if (/\b(audiencia|lista|grupo)\b/.test(t)) return "audiencia";
  if (/\b(template|plantilla)\b/.test(t)) return "template";
  if (/\bcampanas?\b|\bcampanias?\b/.test(t)) return "campana";
  return null;
}

function detectarPedidoImportacion(texto) {
  const t = norm(texto);
  if (/^(que|como|cuando|cuanto|cuantos|donde|por que|porque|para que)\b/.test(t.trim())) {
    return false;
  }
  const verbo = /\b(import|sincroniz|traer|trae|traeme|cargar|carga|cargame|analiz)/.test(t);
  if (!verbo) return false;
  return /\bcontactos?\b|\bleads?\b|\bchats?\b|\bconversaciones?\b|\bwhatsapp\b|\bagenda\b/.test(t);
}

const casos = [
  // --- Edición de campaña: los que ANTES fallaban ---
  ["cambiá el template de la campaña Primera Campaña", "edicion", "campana"],
  ["quiero cambiar el template de una campaña", "edicion", "campana"],
  ["cambiale la audiencia a la campaña de agosto", "edicion", "campana"],
  ["modificá la audiencia de la campaña", "edicion", "campana"],
  ["cambiar la fecha de la campaña", "edicion", "campana"],
  ["reprogramar la campaña para mañana", "edicion", "campana"],
  ["reprogramá el envío", "edicion", "campana"],
  ["cambiá el horario de envío de la campaña", "edicion", "campana"],
  ["editá la plantilla de la campaña", "edicion", "campana"],

  // --- Edición: lo que ya funcionaba, no debe romperse ---
  ["cambiale el nombre a la campaña", "edicion", "campana"],
  ["renombrá la audiencia", "edicion", "audiencia"],
  ["cambiar el nombre de la lista", "edicion", "audiencia"],
  ["cambiale la temperatura a Juan", "edicion", "contacto"],
  ["poné a Marcos como caliente", "edicion", null],

  // --- Creación: NO debe caer en edición ---
  ["creá una campaña", "edicion", null],
  ["armá una audiencia", "edicion", null],
  ["quiero crear un template", "edicion", null],

  // --- Preguntas: NO deben caer en edición ---
  ["cuántas campañas tengo", "edicion", null],
  ["qué templates tengo aprobados", "edicion", null],
  ["cómo cambio el nombre de una campaña", "edicion", "campana"],

  // --- Creación simple ---
  ["creá una audiencia", "creacion", "audiencia"],
  ["armá un template nuevo", "creacion", "template"],
  ["quiero hacer una campaña", "creacion", "campana"],
  ["creá una audiencia con los calientes", "creacion", null],
  ["armá una audiencia con esos", "creacion", null],
  ["cuántas audiencias tengo", "creacion", null],

  // --- Importación ---
  ["importá mis contactos", "importacion", true],
  ["sincronizá los chats de whatsapp", "importacion", true],
  ["cuántos contactos tengo", "importacion", false],
  ["cómo importo contactos", "importacion", false],
];

let ok = 0;
let fallos = 0;

for (const [frase, tipo, esperado] of casos) {
  let real;
  if (tipo === "edicion") real = detectarPedidoEdicion(frase);
  else if (tipo === "creacion") real = detectarPedidoCreacionSimple(frase);
  else real = detectarPedidoImportacion(frase);

  const pasa = real === esperado;
  if (pasa) {
    ok++;
  } else {
    fallos++;
    console.log(`FALLA [${tipo}] "${frase}"`);
    console.log(`   esperado: ${JSON.stringify(esperado)}  |  real: ${JSON.stringify(real)}`);
  }
}

console.log(`\n${ok} OK, ${fallos} fallas de ${casos.length} casos`);
process.exit(fallos > 0 ? 1 : 0);
