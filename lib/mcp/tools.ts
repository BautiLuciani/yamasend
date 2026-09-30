import { createHash } from "node:crypto";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import { createClient } from "@/lib/supabase/server";
import { getRequestAccessToken, runWithAccessToken } from "@/lib/supabase/request-auth";
import { assertPermiso, getCurrentMembership } from "@/lib/auth/permisos";
import { getCurrentAppUser, getContactsForTenant } from "@/lib/actions/user";
import {
  getCampaignDetailAction,
  getCampaignsForTenant,
  getListsForTenant,
  getTemplatesForTenant,
} from "@/lib/actions/campaigns";
import {
  addContactsToListAction,
  deleteTemplateDraftAction,
  removeContactsFromListAction,
  renameListAction,
  saveCampaignAction,
  saveListAction,
  saveTemplateDraftAction,
  sendCampaignAction,
  sendTemplateToMetaAction,
} from "@/lib/actions/write";
import { getDashboardStatsAction } from "@/lib/actions/stats";
import { getSugerenciaHorarioAction } from "@/lib/actions/horarios";
import type { Contact, Membership, Template } from "@/lib/types";
import {
  crearCodigoConfirmacion,
  verificarCodigoConfirmacion,
} from "@/lib/mcp/confirmacion";

/**
 * Tools del conector MCP de YamaSend.
 *
 * Regla de diseño: NINGUNA tool reimplementa lógica de negocio. Todas llaman
 * a los mismos server actions que usa el panel (permisos con assertPermiso,
 * reserva atómica de créditos, guard del Motor, log de actividad). El MCP es
 * solo otra puerta de entrada a lo mismo.
 *
 * Anotaciones (las usan Claude y ChatGPT para decidir cuándo pedir permiso):
 *   - Lectura:              readOnlyHint  → corren sin preguntar.
 *   - Escritura reversible:  destructiveHint false.
 *   - Envíos a Meta / a personas reales: destructiveHint + openWorldHint →
 *     Claude y ChatGPT le piden aprobación al usuario (salvo que el usuario
 *     haya elegido "permitir siempre" para esa tool). Encima de eso, el
 *     servidor exige el código de una vista previa (lib/mcp/confirmacion.ts)
 *     y lo consume una sola vez, así que no hay doble envío posible.
 */

// ---------------------------------------------------------------------------
// Infraestructura común
// ---------------------------------------------------------------------------

type Resultado = { ok: true; data: unknown } | { ok: false; error: string };

interface ContextoTool {
  http?: { authInfo?: { token?: string; extra?: Record<string, unknown> } };
}

function exito(data: unknown): Resultado {
  return { ok: true, data };
}

function falla(error: string): Resultado {
  return { ok: false, error };
}

/**
 * Corre la tool como el usuario dueño del token. El token lo valida
 * withMcpAuth antes de llegar acá; si por algún motivo no está, se corta.
 */
async function ejecutar(ctx: ContextoTool, fn: () => Promise<Resultado>) {
  const token = ctx.http?.authInfo?.token ?? getRequestAccessToken();

  let resultado: Resultado;
  if (!token) {
    resultado = falla("No hay una sesión de YamaSend conectada. Volvé a conectar el conector.");
  } else {
    try {
      resultado = await runWithAccessToken(token, fn);
    } catch (e) {
      console.error("[mcp] Error inesperado en tool:", e);
      resultado = falla(
        "Ocurrió un error inesperado en YamaSend. Probá de nuevo en unos segundos; si sigue pasando, avisá a soporte.",
      );
    }
  }

  if (resultado.ok) {
    return {
      content: [{ type: "text" as const, text: JSON.stringify(resultado.data, null, 2) }],
    };
  }
  return {
    content: [{ type: "text" as const, text: resultado.error }],
    isError: true,
  };
}

type ContextoEmpleado =
  | { ok: true; membership: Membership; tenantId: string; userId: string }
  | { ok: false; error: string };

/**
 * Casi todo en YamaSend vive en la cuenta de un "empleado" (quien tiene el
 * WhatsApp conectado). Resuelve esa cuenta con mensajes claros para los casos
 * en los que el conector no puede operar.
 */
async function contextoEmpleado(): Promise<ContextoEmpleado> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "La sesión de YamaSend venció. Volvé a conectar el conector." };

  const membership = await getCurrentMembership();
  if (!membership) {
    return {
      ok: false,
      error:
        "Tu cuenta de YamaSend todavía no está lista (por ejemplo, falta conectar WhatsApp). Entrá a YamaSend desde el navegador para terminar la configuración.",
    };
  }
  if (membership.rol === "empresa") {
    return {
      ok: false,
      error:
        "Esta es una cuenta de empresa. Por ahora el conector trabaja con las cuentas que tienen un WhatsApp conectado (las de cada vendedor).",
    };
  }
  if (membership.estado === "pendiente") {
    return { ok: false, error: "Tu cuenta todavía está esperando aprobación." };
  }
  if (membership.estado === "suspendido") {
    return { ok: false, error: "Tu cuenta está suspendida. Contactá al administrador." };
  }
  if (!membership.tenantId) {
    return { ok: false, error: "No pudimos identificar tu cuenta de WhatsApp en YamaSend." };
  }
  return { ok: true, membership, tenantId: membership.tenantId, userId: user.id };
}

function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

function recortar(texto: string | undefined | null, max: number): string | undefined {
  if (!texto) return undefined;
  return texto.length > max ? `${texto.slice(0, max - 1)}…` : texto;
}

const ETIQUETA_ESTADO_TEMPLATE: Record<Template["status"], string> = {
  borrador: "borrador",
  enviado: "en revisión de Meta",
  verificado: "aprobado por Meta",
  rechazado: "rechazado por Meta",
  error: "error al enviar a Meta",
};

/** Estado de la integración de WhatsApp sin exponer nunca credenciales. */
async function estadoWhatsapp(): Promise<{ listo: boolean; numero: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { listo: false, numero: null };

  const { data } = await supabase
    .from("yamas_inmo_clientes")
    .select("ycloud_api, wabaid, ventas_tel")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  return {
    listo: Boolean(data?.ycloud_api && data?.wabaid && data?.ventas_tel),
    numero: data?.ventas_tel ?? null,
  };
}

interface Saldo {
  aplica: boolean;
  disponible: number;
  reservados: number;
}

async function leerSaldo(): Promise<Saldo | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("yamas_send_mi_saldo");
  if (error || !data) return null;
  const s = data as { aplica?: boolean; saldo?: number; reservados?: number };
  return {
    aplica: Boolean(s.aplica),
    disponible: s.saldo ?? 0,
    reservados: s.reservados ?? 0,
  };
}

/**
 * Busca UNA audiencia por id directo en la base. getListsForTenant (el del
 * panel) trae solo las 50 más recientes: una audiencia más vieja no aparecería.
 */
async function buscarAudiencia(
  tenantId: string,
  audienciaId: string,
): Promise<{ id: string; nombre: string; contactosIds: string[] } | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("yamas_send_listas")
    .select("id, nombre, contactos_ids")
    .eq("tenant_id", tenantId)
    .eq("id", audienciaId)
    .maybeSingle();
  if (!data) return null;
  return { id: data.id, nombre: data.nombre, contactosIds: (data.contactos_ids ?? []) as string[] };
}

/**
 * Devuelve solo los IDs que son contactos activos del propio usuario. Consulta
 * directa (no la lista de 500 del panel) para no descartar contactos reales
 * más viejos. Un ID ajeno o inventado nunca termina en una audiencia.
 */
async function filtrarContactosPropios(tenantId: string, ids: string[]): Promise<string[]> {
  const unicos = Array.from(new Set(ids.filter((x) => typeof x === "string" && x.length > 0)));
  if (unicos.length === 0) return [];

  const supabase = await createClient();
  const validos = new Set<string>();
  for (let i = 0; i < unicos.length; i += 200) {
    const lote = unicos.slice(i, i + 200);
    const { data, error } = await supabase
      .from("yamas_send_leads")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("activo", true)
      .in("id", lote);
    if (error) throw new Error(`No se pudieron validar los contactos: ${error.message}`);
    for (const r of data ?? []) validos.add(String(r.id));
  }
  return unicos.filter((id) => validos.has(id));
}

/** Tope de contactos que carga el panel (getContactsForTenant). */
const TOPE_CONTACTOS_PANEL = 500;

function notaTopeContactos(totalCargados: number): string | undefined {
  return totalCargados >= TOPE_CONTACTOS_PANEL
    ? `La búsqueda por filtro considera los ${TOPE_CONTACTOS_PANEL} contactos con actividad más reciente.`
    : undefined;
}

/**
 * Marca un código de confirmación como usado ANTES de ejecutar la acción. La
 * PK de yamas_send_mcp_confirmaciones hace que dos requests con el mismo
 * código (reintento del cliente, doble click) no puedan pasar los dos, ni
 * siquiera en simultáneo. Fail-closed: si no se puede registrar, no se envía.
 */
async function consumirCodigo(
  codigo: string,
  tipo: "template" | "campana",
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const codigoHash = createHash("sha256").update(codigo.trim()).digest("hex");
  const { error } = await supabase
    .from("yamas_send_mcp_confirmaciones")
    .insert({ codigo_hash: codigoHash, tipo });

  if (!error) return { ok: true };
  if (error.code === "23505") {
    return {
      ok: false,
      error:
        "Este código de confirmación ya se usó, así que no repito el envío. Revisá el estado con listar_campanas o listar_templates.",
    };
  }
  console.error("[mcp] No se pudo registrar el código de confirmación:", error.message);
  return {
    ok: false,
    error: "No pudimos registrar la confirmación, así que no se envió nada. Probá de nuevo en unos segundos.",
  };
}

/** Huella del contenido exacto de una audiencia (no solo su tamaño). */
function huellaContactos(ids: string[]): string {
  return createHash("sha256").update([...ids].sort().join(",")).digest("base64url").slice(0, 16);
}

// ---------------------------------------------------------------------------
// Contactos: filtros compartidos por buscar_contactos y crear_audiencia
// ---------------------------------------------------------------------------

const filtroContactosSchema = z.object({
  texto: z
    .string()
    .max(200)
    .optional()
    .describe(
      "Texto a buscar en nombre, teléfono, producto de interés, necesidad, resumen de la conversación o palabras clave. Ej: 'departamento 2 ambientes', 'Juan', 'presupuesto'.",
    ),
  temperatura: z
    .enum(["caliente", "tibio", "frio"])
    .optional()
    .describe("Nivel de interés del contacto calculado por la IA de YamaSend."),
  solo_ventana_24h: z
    .boolean()
    .optional()
    .describe("true = solo contactos que escribieron en las últimas 24 horas."),
  min_dias_inactivo: z
    .number()
    .int()
    .min(0)
    .max(3650)
    .optional()
    .describe("Solo contactos que no escriben hace al menos esta cantidad de días (para reactivar)."),
});

type FiltroContactos = z.infer<typeof filtroContactosSchema>;

function filtrarContactos(contactos: Contact[], f: FiltroContactos): Contact[] {
  const texto = f.texto ? normalizar(f.texto) : "";
  const terminos = texto.split(/\s+/).filter(Boolean);

  return contactos.filter((c) => {
    if (f.temperatura && c.score !== f.temperatura) return false;
    if (f.solo_ventana_24h && !c.en24h) return false;
    if (f.min_dias_inactivo !== undefined) {
      if (c.diasInactivo === null || c.diasInactivo === undefined) return false;
      if (c.diasInactivo < f.min_dias_inactivo) return false;
    }
    if (terminos.length > 0) {
      const pajar = normalizar(
        [
          c.nombre,
          c.tel,
          c.productoServicio,
          c.necesidad,
          c.resumen,
          ...(c.keywords ?? []),
        ]
          .filter(Boolean)
          .join(" "),
      );
      if (!terminos.every((t) => pajar.includes(t))) return false;
    }
    return true;
  });
}

function contactoResumido(c: Contact) {
  return {
    id: c.id,
    nombre: c.nombre || "(sin nombre)",
    telefono: c.tel,
    temperatura: c.score || "sin calcular",
    en_ventana_24h: c.en24h,
    dias_inactivo: c.diasInactivo ?? null,
    interes: recortar(c.productoServicio, 80),
    necesidad: recortar(c.necesidad, 120),
    resumen: recortar(c.resumen, 160),
  };
}

// ---------------------------------------------------------------------------
// Validaciones compartidas entre "preparar" y "confirmar"
// ---------------------------------------------------------------------------

const CATEGORIAS_TEMPLATE = ["marketing", "utility", "authentication"] as const;

const ETIQUETA_CATEGORIA: Record<(typeof CATEGORIAS_TEMPLATE)[number], string> = {
  marketing: "Marketing",
  utility: "Utilidad",
  authentication: "Autenticación",
};

interface DatosTemplate {
  nombre: string;
  contenido: string;
  categoria: (typeof CATEGORIAS_TEMPLATE)[number];
  borrador_id: string | null;
}

async function validarEnvioTemplate(
  datos: DatosTemplate,
): Promise<{ ok: true; ctx: Extract<ContextoEmpleado, { ok: true }> } | { ok: false; error: string }> {
  const ctx = await contextoEmpleado();
  if (!ctx.ok) return ctx;

  const gate = await assertPermiso("enviar_templates_meta");
  if (!gate.ok) return { ok: false, error: gate.error ?? "No tenés permiso para enviar templates a Meta." };

  if (!datos.nombre.trim()) return { ok: false, error: "El template necesita un nombre." };
  if (datos.contenido.trim().length < 10) {
    return { ok: false, error: "El mensaje del template tiene que tener al menos 10 caracteres." };
  }

  const wa = await estadoWhatsapp();
  if (!wa.listo) {
    return {
      ok: false,
      error:
        "Tu cuenta todavía no tiene WhatsApp Business conectado, así que no se pueden mandar templates a Meta. Conectalo desde YamaSend en el navegador.",
    };
  }

  const templates = await getTemplatesForTenant(ctx.tenantId);
  const mismoNombre = templates.find(
    (t) => normalizar(t.nombre) === normalizar(datos.nombre) && t.status !== "borrador",
  );
  if (mismoNombre) {
    return {
      ok: false,
      error: `Ya existe un template llamado "${mismoNombre.nombre}" (${ETIQUETA_ESTADO_TEMPLATE[mismoNombre.status]}). Elegí otro nombre.`,
    };
  }

  if (datos.borrador_id) {
    const borrador = templates.find((t) => t.id === datos.borrador_id);
    if (!borrador || borrador.status !== "borrador") {
      return { ok: false, error: "No encontré ese borrador de template." };
    }
  }

  return { ok: true, ctx };
}

interface DatosCampana {
  nombre: string;
  audiencia_id: string;
  template_id: string;
  fecha_programada: string | null;
}

interface CampanaValidada {
  ctx: Extract<ContextoEmpleado, { ok: true }>;
  template: Template;
  audienciaNombre: string;
  contactosIds: string[];
  fechaISO: string | null;
  saldo: Saldo | null;
}

/** ISO 8601 con zona horaria explícita: sin eso "10:00" es ambiguo. */
const FECHA_CON_ZONA = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;
const MARGEN_MINIMO_PROGRAMACION_MS = 5 * 60 * 1000;

async function validarCampana(
  datos: DatosCampana,
): Promise<{ ok: true; v: CampanaValidada } | { ok: false; error: string }> {
  const ctx = await contextoEmpleado();
  if (!ctx.ok) return ctx;

  const gateCrear = await assertPermiso("crear_campanas");
  if (!gateCrear.ok) return { ok: false, error: gateCrear.error ?? "No tenés permiso para crear campañas." };

  if (!datos.fecha_programada) {
    const gateEnviar = await assertPermiso("enviar_campanas");
    if (!gateEnviar.ok) {
      return { ok: false, error: gateEnviar.error ?? "No tenés permiso para enviar campañas." };
    }
  }

  if (!datos.nombre.trim()) return { ok: false, error: "La campaña necesita un nombre." };

  let fechaISO: string | null = null;
  if (datos.fecha_programada) {
    if (!FECHA_CON_ZONA.test(datos.fecha_programada)) {
      return {
        ok: false,
        error:
          "La fecha tiene que incluir la zona horaria del usuario, por ejemplo 2026-10-02T10:00:00-03:00. Preguntale al usuario su zona horaria si no la sabés.",
      };
    }
    const fecha = new Date(datos.fecha_programada);
    if (Number.isNaN(fecha.getTime())) return { ok: false, error: "Esa fecha no es válida." };
    if (fecha.getTime() < Date.now() + MARGEN_MINIMO_PROGRAMACION_MS) {
      return {
        ok: false,
        error: "La fecha tiene que ser al menos 5 minutos en el futuro. Para mandarla ya, no indiques fecha.",
      };
    }
    fechaISO = fecha.toISOString();
  }

  const wa = await estadoWhatsapp();
  if (!wa.listo) {
    return {
      ok: false,
      error:
        "Tu cuenta todavía no tiene WhatsApp Business conectado, así que no se pueden enviar campañas. Conectalo desde YamaSend en el navegador.",
    };
  }

  const [templates, audiencia] = await Promise.all([
    getTemplatesForTenant(ctx.tenantId),
    buscarAudiencia(ctx.tenantId, datos.audiencia_id),
  ]);

  const template = templates.find((t) => t.id === datos.template_id);
  if (!template) return { ok: false, error: "No encontré ese template. Usá listar_templates para ver los disponibles." };
  if (template.status !== "verificado") {
    return {
      ok: false,
      error: `El template "${template.nombre}" está ${ETIQUETA_ESTADO_TEMPLATE[template.status]}. Solo se pueden usar templates aprobados por Meta.`,
    };
  }

  if (!audiencia) return { ok: false, error: "No encontré esa audiencia. Usá listar_audiencias para ver las disponibles." };
  const contactosIds = audiencia.contactosIds ?? [];
  if (contactosIds.length === 0) {
    return { ok: false, error: `La audiencia "${audiencia.nombre}" no tiene contactos.` };
  }

  const saldo = await leerSaldo();
  if (saldo?.aplica && saldo.disponible < contactosIds.length) {
    const donde = ctx.membership.orgId
      ? "Pedile más créditos a tu empresa o achicá la audiencia."
      : "Comprá más créditos desde YamaSend o achicá la audiencia.";
    return {
      ok: false,
      error: `Te quedan ${saldo.disponible} créditos disponibles y esta campaña necesita ${contactosIds.length}. ${donde}`,
    };
  }

  return {
    ok: true,
    v: { ctx, template, audienciaNombre: audiencia.nombre, contactosIds, fechaISO, saldo },
  };
}

function errorDeCodigo(r: "vencido" | "invalido" | "sin_configurar"): string {
  if (r === "vencido") {
    return "El código de confirmación venció (duran 15 minutos). Volvé a preparar la vista previa y pedile confirmación al usuario.";
  }
  if (r === "sin_configurar") {
    return "El servidor de YamaSend no tiene configuradas las confirmaciones. Avisá a soporte.";
  }
  return "El código de confirmación no corresponde a estos datos (o la audiencia cambió desde la vista previa). Volvé a preparar la vista previa con los datos exactos y pedile confirmación al usuario.";
}

// ---------------------------------------------------------------------------
// Registro de tools
// ---------------------------------------------------------------------------

const LECTURA = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const ESCRITURA = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false };
const IRREVERSIBLE = { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true };

export const INSTRUCCIONES_SERVIDOR = `YamaSend es una plataforma de marketing por WhatsApp Business. Con estas herramientas el usuario maneja su cuenta desde el chat: contactos, audiencias (listas de contactos), templates (mensajes que Meta tiene que aprobar) y campañas (envío de un template aprobado a una audiencia).

Cómo trabajar:
- Hablale al usuario en su idioma, simple y sin tecnicismos. Nunca muestres IDs salvo que los pida.
- Antes de crear una campaña, asegurate de tener una audiencia y un template aprobado. Si falta algo, ayudá a crearlo.
- Cada mensaje de una campaña consume 1 crédito.
- Mandar un template a Meta y enviar/programar campañas NO se puede deshacer. Siempre: 1) llamá a la herramienta "preparar_…", 2) mostrale al usuario el resumen completo, 3) esperá que diga explícitamente que sí, 4) recién ahí llamá a "confirmar_…" con los mismos datos y el código. Nunca confirmes por tu cuenta.
- Para programar, usá fechas con la zona horaria del usuario (ej. 2026-10-02T10:00:00-03:00). Si no la sabés, preguntá.`;

export function registrarToolsYamasend(server: McpServer): void {
  // ------------------------------------------------------------------ cuenta
  server.registerTool(
    "ver_mi_cuenta",
    {
      title: "Ver mi cuenta",
      description:
        "Muestra el estado de la cuenta de YamaSend del usuario: nombre, si WhatsApp está conectado, créditos disponibles y reservados, y qué acciones tiene permitidas. Útil como primer paso.",
      annotations: LECTURA,
    },
    async (ctx) =>
      ejecutar(ctx, async () => {
        const membership = await getCurrentMembership();
        if (!membership) {
          return falla(
            "Tu cuenta de YamaSend todavía no está lista (por ejemplo, falta conectar WhatsApp). Entrá a YamaSend desde el navegador para terminar la configuración.",
          );
        }

        const permitido = Object.entries(membership.permisos)
          .filter(([, v]) => v)
          .map(([k]) => k);

        if (membership.rol === "empresa") {
          return exito({
            tipo_cuenta: "empresa",
            organizacion: membership.orgNombre,
            nota: "Las cuentas de empresa administran vendedores. El conector trabaja con las cuentas que tienen un WhatsApp conectado.",
          });
        }

        const [usuario, wa, saldo] = await Promise.all([
          getCurrentAppUser(),
          estadoWhatsapp(),
          leerSaldo(),
        ]);

        return exito({
          nombre: usuario?.contactoNombre ?? membership.nombreDisplay,
          email: usuario?.contactoEmail,
          tipo_cuenta: membership.orgId ? `vendedor de ${membership.orgNombre}` : "individual",
          estado: membership.estado,
          whatsapp_conectado: wa.listo,
          numero_whatsapp: wa.numero,
          creditos: saldo?.aplica
            ? { disponibles: saldo.disponible, reservados_para_campanas: saldo.reservados }
            : { disponibles: usuario?.credito ?? 0 },
          permisos: permitido,
        });
      }),
  );

  // --------------------------------------------------------------- contactos
  server.registerTool(
    "buscar_contactos",
    {
      title: "Buscar contactos",
      description:
        "Busca entre los contactos de WhatsApp del usuario (analizados por la IA de YamaSend). Filtra por texto, temperatura de interés, ventana de 24 horas o inactividad. Devuelve los IDs que después se usan para armar audiencias.",
      inputSchema: filtroContactosSchema.extend({
        limite: z
          .number()
          .int()
          .min(1)
          .max(200)
          .optional()
          .describe("Máximo de contactos a devolver (por defecto 25)."),
      }),
      annotations: LECTURA,
    },
    async (args, ctx) =>
      ejecutar(ctx, async () => {
        const c = await contextoEmpleado();
        if (!c.ok) return falla(c.error);

        const todos = await getContactsForTenant(c.tenantId);
        const encontrados = filtrarContactos(todos, args);
        const limite = args.limite ?? 25;

        return exito({
          total_encontrados: encontrados.length,
          mostrando: Math.min(limite, encontrados.length),
          contactos: encontrados.slice(0, limite).map(contactoResumido),
          nota:
            [
              encontrados.length > limite
                ? "Hay más resultados. Para armar una audiencia con todos, usá crear_audiencia con el mismo filtro."
                : null,
              notaTopeContactos(todos.length) ?? null,
            ]
              .filter(Boolean)
              .join(" ") || undefined,
        });
      }),
  );

  // --------------------------------------------------------------- audiencias
  server.registerTool(
    "listar_audiencias",
    {
      title: "Listar audiencias",
      description: "Lista las audiencias (listas de contactos) del usuario con su cantidad de contactos.",
      annotations: LECTURA,
    },
    async (ctx) =>
      ejecutar(ctx, async () => {
        const c = await contextoEmpleado();
        if (!c.ok) return falla(c.error);

        const listas = await getListsForTenant(c.tenantId);
        return exito({
          total: listas.length,
          nota:
            listas.length >= 50
              ? "Se muestran las 50 audiencias más recientes. Las más viejas se pueden usar igual si tenés su ID."
              : undefined,
          audiencias: listas.map((l) => ({
            id: l.id,
            nombre: l.nombre,
            contactos: l.contactosIds.length,
            creada: l.createdAt,
          })),
        });
      }),
  );

  server.registerTool(
    "ver_audiencia",
    {
      title: "Ver audiencia",
      description: "Muestra los contactos que forman parte de una audiencia.",
      inputSchema: z.object({
        audiencia_id: z.string().describe("ID de la audiencia (de listar_audiencias)."),
      }),
      annotations: LECTURA,
    },
    async ({ audiencia_id }, ctx) =>
      ejecutar(ctx, async () => {
        const c = await contextoEmpleado();
        if (!c.ok) return falla(c.error);

        const lista = await buscarAudiencia(c.tenantId, audiencia_id);
        if (!lista) return falla("No encontré esa audiencia.");

        const contactos = await getContactsForTenant(c.tenantId);
        const ids = new Set(lista.contactosIds);
        const miembros = contactos.filter((x) => ids.has(x.id));
        const sinDetalle = lista.contactosIds.length - miembros.length;

        return exito({
          id: lista.id,
          nombre: lista.nombre,
          total_contactos: lista.contactosIds.length,
          contactos: miembros.slice(0, 200).map(contactoResumido),
          nota:
            sinDetalle > 0
              ? `${sinDetalle} contacto(s) de la audiencia no se muestran porque están inactivos o no tienen actividad reciente. Igual siguen en la audiencia.`
              : undefined,
        });
      }),
  );

  server.registerTool(
    "crear_audiencia",
    {
      title: "Crear audiencia",
      description:
        "Crea una audiencia nueva. Se puede armar con una lista de IDs de contactos (de buscar_contactos) o directamente con un filtro (por ejemplo, todos los contactos calientes). No envía nada.",
      inputSchema: z.object({
        nombre: z.string().min(1).max(120).describe("Nombre de la audiencia."),
        contacto_ids: z
          .array(z.string())
          .max(5000)
          .optional()
          .describe("IDs de contactos a incluir. Usar esto O filtro."),
        filtro: filtroContactosSchema
          .optional()
          .describe("Filtro para incluir todos los contactos que coincidan. Usar esto O contacto_ids."),
      }),
      annotations: ESCRITURA,
    },
    async ({ nombre, contacto_ids, filtro }, ctx) =>
      ejecutar(ctx, async () => {
        const c = await contextoEmpleado();
        if (!c.ok) return falla(c.error);

        if (!contacto_ids?.length && !filtro) {
          return falla("Indicá los contactos (contacto_ids) o un filtro para armar la audiencia.");
        }
        if (contacto_ids?.length && filtro) {
          return falla("Usá contacto_ids o filtro, no los dos a la vez.");
        }

        // Solo se aceptan contactos del propio usuario: un ID ajeno o
        // inventado no puede terminar en una audiencia.
        let ids: string[];
        let ignorados = 0;
        let nota: string | undefined;
        if (filtro) {
          const contactos = await getContactsForTenant(c.tenantId);
          ids = filtrarContactos(contactos, filtro).map((x) => x.id);
          nota = notaTopeContactos(contactos.length);
        } else {
          const pedidos = Array.from(new Set(contacto_ids));
          ids = await filtrarContactosPropios(c.tenantId, pedidos);
          ignorados = pedidos.length - ids.length;
        }

        if (ids.length === 0) return falla("Ningún contacto coincide, así que no creé la audiencia.");

        const r = await saveListAction(nombre.trim(), ids);
        if (r.error || !r.id) return falla(r.error ?? "No se pudo crear la audiencia.");

        return exito({
          audiencia_id: r.id,
          nombre: nombre.trim(),
          contactos: ids.length,
          ignorados_por_no_existir: ignorados || undefined,
          nota,
        });
      }),
  );

  server.registerTool(
    "editar_audiencia",
    {
      title: "Editar audiencia",
      description: "Renombra una audiencia y/o le agrega o quita contactos. No envía nada.",
      inputSchema: z.object({
        audiencia_id: z.string().describe("ID de la audiencia."),
        nuevo_nombre: z.string().min(1).max(120).optional(),
        agregar_contacto_ids: z.array(z.string()).max(5000).optional(),
        quitar_contacto_ids: z.array(z.string()).max(5000).optional(),
      }),
      // Quitar contactos modifica datos existentes: se marca destructiva para
      // que el cliente pida aprobación.
      annotations: { ...ESCRITURA, destructiveHint: true },
    },
    async ({ audiencia_id, nuevo_nombre, agregar_contacto_ids, quitar_contacto_ids }, ctx) =>
      ejecutar(ctx, async () => {
        const c = await contextoEmpleado();
        if (!c.ok) return falla(c.error);

        if (!nuevo_nombre && !agregar_contacto_ids?.length && !quitar_contacto_ids?.length) {
          return falla("No indicaste ningún cambio.");
        }

        const original = await buscarAudiencia(c.tenantId, audiencia_id);
        if (!original) return falla("No encontré esa audiencia.");

        const cambios: string[] = [];

        if (nuevo_nombre) {
          const r = await renameListAction(audiencia_id, nuevo_nombre.trim());
          if (r.error) return falla(r.error);
          cambios.push(`renombrada a "${nuevo_nombre.trim()}"`);
        }

        if (agregar_contacto_ids?.length) {
          const ids = await filtrarContactosPropios(c.tenantId, agregar_contacto_ids);
          if (ids.length > 0) {
            const r = await addContactsToListAction(audiencia_id, ids);
            if (r.error) return falla(r.error);
          }
          cambios.push(`${ids.length} contacto(s) agregados`);
        }

        if (quitar_contacto_ids?.length) {
          const antes = new Set((await buscarAudiencia(c.tenantId, audiencia_id))?.contactosIds ?? []);
          const quitables = Array.from(new Set(quitar_contacto_ids)).filter((id) => antes.has(id));
          if (quitables.length > 0) {
            const r = await removeContactsFromListAction(audiencia_id, quitables);
            if (r.error) return falla(r.error);
          }
          cambios.push(`${quitables.length} contacto(s) quitados`);
        }

        const actualizada = await buscarAudiencia(c.tenantId, audiencia_id);
        return exito({
          audiencia_id,
          cambios,
          contactos_ahora: actualizada?.contactosIds.length ?? null,
        });
      }),
  );

  // ---------------------------------------------------------------- templates
  server.registerTool(
    "listar_templates",
    {
      title: "Listar templates",
      description:
        "Lista los templates (mensajes de WhatsApp) del usuario con su estado en Meta: borrador, en revisión, aprobado o rechazado (con el motivo). Solo los aprobados se pueden usar en campañas.",
      inputSchema: z.object({
        estado: z
          .enum(["borrador", "en_revision", "aprobado", "rechazado"])
          .optional()
          .describe("Filtrar por estado."),
      }),
      annotations: LECTURA,
    },
    async ({ estado }, ctx) =>
      ejecutar(ctx, async () => {
        const c = await contextoEmpleado();
        if (!c.ok) return falla(c.error);

        const mapa: Record<string, Template["status"][]> = {
          borrador: ["borrador"],
          en_revision: ["enviado"],
          aprobado: ["verificado"],
          rechazado: ["rechazado", "error"],
        };

        const templates = (await getTemplatesForTenant(c.tenantId)).filter(
          (t) => !estado || mapa[estado].includes(t.status),
        );

        return exito({
          total: templates.length,
          templates: templates.map((t) => ({
            id: t.id,
            nombre: t.nombre,
            estado: ETIQUETA_ESTADO_TEMPLATE[t.status],
            categoria: t.tipo,
            idioma: t.templateLang,
            contenido: t.contenido,
            motivo_rechazo: t.rechazoMotivo ?? undefined,
            de_la_empresa: t.esDeEmpresa || undefined,
          })),
        });
      }),
  );

  const categoriaSchema = z
    .enum(CATEGORIAS_TEMPLATE)
    .describe(
      "Categoría de Meta: 'marketing' (promociones, novedades), 'utility' (avisos de un trámite o compra), 'authentication' (códigos de verificación).",
    );

  server.registerTool(
    "guardar_template_borrador",
    {
      title: "Guardar template como borrador",
      description:
        "Guarda un template como borrador en YamaSend, sin mandarlo a Meta. Si se pasa borrador_id, actualiza ese borrador.",
      inputSchema: z.object({
        nombre: z.string().min(1).max(120),
        contenido: z.string().max(1024).describe("Texto del mensaje."),
        categoria: categoriaSchema,
        borrador_id: z.string().optional().describe("ID de un borrador existente para actualizarlo."),
      }),
      annotations: ESCRITURA,
    },
    async ({ nombre, contenido, categoria, borrador_id }, ctx) =>
      ejecutar(ctx, async () => {
        const c = await contextoEmpleado();
        if (!c.ok) return falla(c.error);

        const r = await saveTemplateDraftAction(nombre, contenido, categoria, borrador_id ?? null);
        if (r.error || !r.id) return falla(r.error ?? "No se pudo guardar el borrador.");
        return exito({ borrador_id: r.id, nombre: nombre.trim(), estado: "borrador" });
      }),
  );

  const datosTemplateSchema = z.object({
    nombre: z.string().min(1).max(120).describe("Nombre del template."),
    contenido: z.string().min(10).max(1024).describe("Texto del mensaje, exactamente como va a salir."),
    categoria: categoriaSchema,
    borrador_id: z
      .string()
      .optional()
      .describe("Si sale de un borrador guardado, su ID (el borrador se elimina al enviarlo)."),
  });

  server.registerTool(
    "preparar_envio_template",
    {
      title: "Preparar envío de template a Meta",
      description:
        "Paso 1 de 2 para mandar un template a aprobación de Meta. Valida todo pero NO envía nada: devuelve un resumen para mostrarle al usuario y un código. Solo si el usuario confirma explícitamente, llamá a confirmar_envio_template con los mismos datos y el código.",
      inputSchema: datosTemplateSchema,
      annotations: LECTURA,
    },
    async (args, ctx) =>
      ejecutar(ctx, async () => {
        const datos: DatosTemplate = {
          nombre: args.nombre.trim(),
          contenido: args.contenido.trim(),
          categoria: args.categoria,
          borrador_id: args.borrador_id ?? null,
        };
        const v = await validarEnvioTemplate(datos);
        if (!v.ok) return falla(v.error);

        const codigo = crearCodigoConfirmacion("template", v.ctx.userId, datos);
        if (!codigo) return falla(errorDeCodigo("sin_configurar"));

        return exito({
          resumen_para_el_usuario: {
            nombre: datos.nombre,
            categoria: ETIQUETA_CATEGORIA[datos.categoria],
            mensaje: datos.contenido,
            que_pasa_despues:
              "Meta lo revisa (suele tardar de minutos a 24 horas). Una vez enviado no se puede editar: si hace falta un cambio, hay que crear otro template.",
          },
          codigo_confirmacion: codigo,
          siguiente_paso:
            "Mostrale este resumen al usuario y preguntale si lo mandamos a Meta. Solo si dice que sí, llamá a confirmar_envio_template con exactamente los mismos datos y este código.",
        });
      }),
  );

  server.registerTool(
    "confirmar_envio_template",
    {
      title: "Enviar template a Meta",
      description:
        "Paso 2 de 2: manda el template a aprobación de Meta. Requiere el código de preparar_envio_template y los mismos datos. Usar SOLO después de que el usuario confirmó explícitamente.",
      inputSchema: datosTemplateSchema.extend({
        codigo_confirmacion: z.string().describe("Código devuelto por preparar_envio_template."),
      }),
      annotations: IRREVERSIBLE,
    },
    async (args, ctx) =>
      ejecutar(ctx, async () => {
        const datos: DatosTemplate = {
          nombre: args.nombre.trim(),
          contenido: args.contenido.trim(),
          categoria: args.categoria,
          borrador_id: args.borrador_id ?? null,
        };

        // Se revalida todo: entre la vista previa y la confirmación pudo
        // cambiar algo (por ejemplo, otro template con el mismo nombre). Esto
        // además impide mandar dos veces el mismo template.
        const v = await validarEnvioTemplate(datos);
        if (!v.ok) return falla(v.error);

        const cod = verificarCodigoConfirmacion(args.codigo_confirmacion, "template", v.ctx.userId, datos);
        if (cod !== "ok") return falla(errorDeCodigo(cod));

        // Un código = un envío, aunque lleguen dos requests a la vez.
        const consumo = await consumirCodigo(args.codigo_confirmacion, "template");
        if (!consumo.ok) return falla(consumo.error);

        const r = await sendTemplateToMetaAction(datos.nombre, datos.contenido, datos.categoria, null);
        if (!r.ok) return falla(r.error ?? "No se pudo enviar el template a Meta.");

        // Mismo comportamiento que el panel al mandar un borrador: no dejar la
        // fila "borrador" duplicada junto a la nueva que crea el envío.
        if (datos.borrador_id) await deleteTemplateDraftAction(datos.borrador_id);

        return exito({
          enviado: true,
          nombre: datos.nombre,
          mensaje: r.mensaje,
          como_seguir: "Podés consultar el estado más tarde con listar_templates.",
        });
      }),
  );

  // ---------------------------------------------------------------- campañas
  server.registerTool(
    "listar_campanas",
    {
      title: "Listar campañas",
      description: "Lista las últimas campañas del usuario con su estado (borrador, programada, enviando, enviada, error, cancelada).",
      inputSchema: z.object({
        estado: z
          .enum(["borrador", "programada", "enviando", "enviado", "error", "cancelado"])
          .optional()
          .describe("Filtrar por estado."),
      }),
      annotations: LECTURA,
    },
    async ({ estado }, ctx) =>
      ejecutar(ctx, async () => {
        const c = await contextoEmpleado();
        if (!c.ok) return falla(c.error);

        const campanas = (await getCampaignsForTenant(c.tenantId)).filter(
          (x) => !estado || x.status === estado,
        );

        return exito({
          total: campanas.length,
          campanas: campanas.map((x) => ({
            id: x.id,
            nombre: x.nombre,
            estado: x.status,
            audiencia: x.listaNombre,
            template: x.templateNombre,
            destinatarios: x.contactosCount,
            programada_para: x.fechaProgramada,
            enviada: x.enviadoAt,
            creada: x.createdAt,
          })),
        });
      }),
  );

  server.registerTool(
    "ver_campana",
    {
      title: "Ver resultados de una campaña",
      description: "Muestra el detalle y los resultados de una campaña: mensajes enviados, con error, leídos y duración del envío.",
      inputSchema: z.object({
        campana_id: z.string().describe("ID de la campaña (de listar_campanas)."),
      }),
      annotations: LECTURA,
    },
    async ({ campana_id }, ctx) =>
      ejecutar(ctx, async () => {
        const c = await contextoEmpleado();
        if (!c.ok) return falla(c.error);

        const d = await getCampaignDetailAction(c.tenantId, campana_id);
        if (!d) return falla("No encontré esa campaña.");

        // Nunca se expone costo_usd: es el costo interno de Meta.
        const pctLeidos = d.mensajesOk > 0 ? Math.round((d.mensajesLeidos / d.mensajesOk) * 100) : null;
        return exito({
          id: d.id,
          nombre: d.nombre,
          estado: d.status,
          audiencia: d.listaNombre,
          template: d.templateNombre,
          destinatarios: d.contactosCount,
          programada_para: d.fechaProgramada,
          enviada: d.enviadoAt,
          resultados: {
            enviados_ok: d.mensajesOk,
            con_error: d.mensajesError,
            leidos: d.mensajesLeidos,
            porcentaje_leidos: pctLeidos,
            duracion_minutos: d.duracionMin,
          },
        });
      }),
  );

  server.registerTool(
    "ver_metricas",
    {
      title: "Ver métricas",
      description:
        "Métricas generales de la cuenta en un período: mensajes enviados y leídos, contactos calificados por la IA y comparación con el período anterior.",
      inputSchema: z.object({
        periodo: z.enum(["7d", "30d", "ano"]).describe("'7d' = últimos 7 días, '30d' = últimos 30 días, 'ano' = último año."),
      }),
      annotations: LECTURA,
    },
    async ({ periodo }, ctx) =>
      ejecutar(ctx, async () => {
        const c = await contextoEmpleado();
        if (!c.ok) return falla(c.error);

        const s = await getDashboardStatsAction(c.tenantId, periodo);
        return exito({
          periodo,
          mensajes_enviados: s.mensajesEnviados,
          variacion_enviados_pct: s.mensajesEnviadosDeltaPct,
          mensajes_leidos: s.mensajesLeidos,
          porcentaje_leidos: s.mensajesLeidosPct !== null ? Math.round(s.mensajesLeidosPct) : null,
          variacion_leidos_pct: s.mensajesLeidosDeltaPct,
          contactos_calificados: s.leadsCalificados,
          variacion_contactos_calificados: s.leadsCalificadosDelta,
          detalle: s.barras,
        });
      }),
  );

  server.registerTool(
    "mejor_horario_envio",
    {
      title: "Mejor horario para enviar",
      description:
        "Sugiere la franja horaria con mejor tasa de respuesta según los envíos anteriores del usuario (horas en hora de Argentina, UTC-3). Si todavía no hay suficientes datos, lo avisa.",
      annotations: LECTURA,
    },
    async (ctx) =>
      ejecutar(ctx, async () => {
        const c = await contextoEmpleado();
        if (!c.ok) return falla(c.error);

        const s = await getSugerenciaHorarioAction();
        if (!s) {
          return exito({
            hay_sugerencia: false,
            motivo: "Todavía no hay suficientes envíos para recomendar un horario con confianza.",
          });
        }
        // tasaRespuesta viene como fracción 0–1 (el wizard del panel la
        // multiplica por 100 igual que acá).
        return exito({
          hay_sugerencia: true,
          zona_horaria: "America/Argentina/Buenos_Aires (UTC-3)",
          desde_hora: s.horaInicio,
          hasta_hora: s.horaFin,
          tasa_respuesta_pct: Math.round(s.tasaRespuesta * 1000) / 10,
          mensajes_analizados: s.totalAnalizados,
        });
      }),
  );

  const datosCampanaSchema = z.object({
    nombre: z.string().min(1).max(120).describe("Nombre de la campaña."),
    audiencia_id: z.string().describe("ID de la audiencia a la que se envía."),
    template_id: z.string().describe("ID de un template APROBADO por Meta."),
    fecha_programada: z
      .string()
      .optional()
      .describe(
        "Para programarla: fecha y hora ISO 8601 con zona horaria, ej. 2026-10-02T10:00:00-03:00. Sin fecha, se envía apenas se confirma.",
      ),
  });

  server.registerTool(
    "preparar_campana",
    {
      title: "Preparar campaña",
      description:
        "Paso 1 de 2 para enviar o programar una campaña de WhatsApp. Valida audiencia, template, créditos y WhatsApp, pero NO envía nada: devuelve un resumen para mostrarle al usuario y un código. Solo si el usuario confirma explícitamente, llamá a confirmar_campana con los mismos datos, la cantidad de destinatarios y el código.",
      inputSchema: datosCampanaSchema,
      annotations: LECTURA,
    },
    async (args, ctx) =>
      ejecutar(ctx, async () => {
        const datos: DatosCampana = {
          nombre: args.nombre.trim(),
          audiencia_id: args.audiencia_id,
          template_id: args.template_id,
          fecha_programada: args.fecha_programada ?? null,
        };
        const r = await validarCampana(datos);
        if (!r.ok) return falla(r.error);
        const { v } = r;

        const destinatarios = v.contactosIds.length;
        const codigo = crearCodigoConfirmacion("campana", v.ctx.userId, {
          ...datos,
          destinatarios,
          huella: huellaContactos(v.contactosIds),
        });
        if (!codigo) return falla(errorDeCodigo("sin_configurar"));

        return exito({
          resumen_para_el_usuario: {
            campana: datos.nombre,
            audiencia: v.audienciaNombre,
            destinatarios,
            template: v.template.nombre,
            mensaje: v.template.contenido,
            cuando: datos.fecha_programada
              ? `Programada para ${datos.fecha_programada}`
              : "Se envía apenas confirmes",
            creditos_que_usa: destinatarios,
            creditos_disponibles: v.saldo?.aplica ? v.saldo.disponible : undefined,
            aviso: "Una vez enviada no se puede deshacer: los mensajes les llegan a personas reales.",
          },
          destinatarios,
          codigo_confirmacion: codigo,
          siguiente_paso:
            "Mostrale este resumen al usuario y preguntale si confirma. Solo si dice que sí, llamá a confirmar_campana con exactamente los mismos datos, destinatarios y este código.",
        });
      }),
  );

  server.registerTool(
    "confirmar_campana",
    {
      title: "Enviar o programar campaña",
      description:
        "Paso 2 de 2: crea la campaña y la envía (o la deja programada). Manda mensajes de WhatsApp a personas reales y consume créditos. Requiere el código de preparar_campana y los mismos datos. Usar SOLO después de que el usuario confirmó explícitamente.",
      inputSchema: datosCampanaSchema.extend({
        destinatarios: z.number().int().min(1).describe("Cantidad de destinatarios que mostró preparar_campana."),
        codigo_confirmacion: z.string().describe("Código devuelto por preparar_campana."),
      }),
      annotations: IRREVERSIBLE,
    },
    async (args, ctx) =>
      ejecutar(ctx, async () => {
        const datos: DatosCampana = {
          nombre: args.nombre.trim(),
          audiencia_id: args.audiencia_id,
          template_id: args.template_id,
          fecha_programada: args.fecha_programada ?? null,
        };

        const r = await validarCampana(datos);
        if (!r.ok) return falla(r.error);
        const { v } = r;

        if (v.contactosIds.length !== args.destinatarios) {
          return falla(
            `La audiencia cambió desde la vista previa (ahora tiene ${v.contactosIds.length} contactos en vez de ${args.destinatarios}). Volvé a preparar la campaña y pedile confirmación al usuario.`,
          );
        }

        // La huella se recalcula con la audiencia de AHORA: si cambiaron los
        // contactos (aunque sea la misma cantidad), el código no coincide.
        const cod = verificarCodigoConfirmacion(args.codigo_confirmacion, "campana", v.ctx.userId, {
          ...datos,
          destinatarios: args.destinatarios,
          huella: huellaContactos(v.contactosIds),
        });
        if (cod !== "ok") return falla(errorDeCodigo(cod));

        // Anti doble envío: el código se consume una sola vez (PK en la base).
        const consumo = await consumirCodigo(args.codigo_confirmacion, "campana");
        if (!consumo.ok) return falla(consumo.error);

        const guardada = await saveCampaignAction(
          datos.nombre,
          datos.audiencia_id,
          datos.template_id,
          v.contactosIds,
          v.fechaISO,
        );
        if (guardada.error || !guardada.id) return falla(guardada.error ?? "No se pudo crear la campaña.");

        if (v.fechaISO) {
          return exito({
            campana_id: guardada.id,
            estado: "programada",
            programada_para: datos.fecha_programada,
            destinatarios: v.contactosIds.length,
            nota: "Los créditos quedaron reservados para esta campaña.",
          });
        }

        const envio = await sendCampaignAction(
          guardada.id,
          datos.audiencia_id,
          v.template.nombre,
          v.template.templateLang ?? "es_AR",
          false,
          v.contactosIds.length,
        );

        if (!envio.ok) {
          return falla(
            `La campaña se creó pero no se pudo enviar: ${envio.error ?? "error desconocido"}. Se puede reintentar desde la sección Campañas de YamaSend.`,
          );
        }

        return exito({
          campana_id: guardada.id,
          estado: "enviando",
          destinatarios: v.contactosIds.length,
          como_seguir: "En unos minutos podés ver los resultados con ver_campana.",
        });
      }),
  );
}
