/**
 * Reglas de producto para la CREACIÓN de templates, centralizadas en un solo
 * lugar para que el panel, el chat de IA, el panel de empresa y el conector
 * MCP se comporten igual.
 *
 * Decisión de Bauti y Pato (2026-10):
 *
 * 1. Categoría única: por ahora todos los templates nuevos son de Marketing.
 *    Se fuerza del lado del servidor (no alcanza con esconder el selector):
 *    cualquier valor que llegue — de un borrador viejo de "Utilidad", del
 *    conector MCP o de un request armado a mano — se reemplaza por este.
 *    Los templates que YA existen con otra categoría no se tocan y se siguen
 *    mostrando con su etiqueta original.
 *
 * 2. Variables ({{1}}, {{2}}…) deshabilitadas. Meta exige un ejemplo por cada
 *    variable al crear el template y el workflow de n8n que lo manda a
 *    aprobar no los envía, así que un template con variables termina en
 *    error o rechazado. Con el flag en false:
 *      - la UI no ofrece agregar variables ni las menciona;
 *      - el envío a Meta rechaza (con un mensaje claro) un texto que traiga
 *        variables escritas a mano, antes de llegar a n8n.
 *    El código que maneja variables NO se borró: para reactivarlas alcanza
 *    con poner VARIABLES_TEMPLATE_HABILITADAS en true (y, antes de hacerlo,
 *    resolver el envío de ejemplos en el workflow de aprobación).
 *
 * Archivo sin "use server" a propósito: lo importan tanto componentes de
 * cliente como server actions.
 */

export const CATEGORIA_TEMPLATE_UNICA = "marketing" as const;
export const CATEGORIA_TEMPLATE_UNICA_LABEL = "Marketing";

export const VARIABLES_TEMPLATE_HABILITADAS = false;

/**
 * Detecta variables estilo Meta: posicionales ({{1}}, {{ 2 }}) y también con
 * nombre ({{nombre}}), que Meta igual interpreta como parámetro.
 */
const REGEX_VARIABLE_TEMPLATE = /\{\{[^{}]*\}\}/;

export function contieneVariablesTemplate(texto: string): boolean {
  return REGEX_VARIABLE_TEMPLATE.test(texto);
}

export const ERROR_VARIABLES_DESHABILITADAS =
  "Por ahora los templates no pueden llevar variables como {{1}}. Escribí el mensaje completo, igual para todos los contactos.";

/**
 * Devuelve el error a mostrar si el contenido trae variables y están
 * deshabilitadas; null si se puede seguir.
 */
export function validarVariablesTemplate(contenido: string): string | null {
  if (VARIABLES_TEMPLATE_HABILITADAS) return null;
  return contieneVariablesTemplate(contenido) ? ERROR_VARIABLES_DESHABILITADAS : null;
}
