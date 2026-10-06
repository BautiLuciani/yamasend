"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  CampoPerfil,
  PerfilChatMensaje,
  PerfilNegocio,
  PropuestaPerfil,
} from "@/lib/types";
import {
  actualizarDatosNegocioAction,
  getDatosNegocioAction,
  type DatosNegocio,
} from "@/lib/actions/profile";
import {
  aplicarPropuestaPerfilAction,
  completarPerfilDesdeChatsAction,
  conversarPerfilAction,
  ignorarNovedadesAction,
  getPerfilNegocioAction,
  regenerarPerfilNegocioAction,
} from "@/lib/actions/perfil_negocio";
import { importarArchivoPerfilAction } from "@/lib/actions/perfil_importar";
import { ProductosEditor, StatusMsg } from "./ProductosEditor";
import { calcularNovedades, juntarPropuestas, type Novedad } from "@/lib/perfil/novedades";

/**
 * Sección "Perfil" del menú principal: todo lo que la IA sabe del negocio.
 *
 * El perfil es "Datos de la empresa" (la misma fuente que usan los templates y
 * el agente). Se completa de tres formas:
 *   1. A mano, editando los cuadros de texto.
 *   2. Solo, desde los chats: el workflow de n8n investiga las conversaciones
 *      y llena las celdas VACÍAS (nunca pisa lo que el usuario escribió). Si
 *      detecta algo distinto de lo ya cargado, lo ofrece como sugerencia.
 *   3. Con el asistente (diálogo) o importando un archivo (PDF, Excel, Word,
 *      CSV o imagen). Ambos devuelven una propuesta que se aplica con un click.
 */

const POLL_MS = 4000;

const SALUDO =
  "Hola 👋 Soy el asistente de tu perfil. Contame cómo es tu negocio, pedime que mejore algún texto, o adjuntá tu lista de precios y te armo los cambios para que los apliques.";

type CampoTexto =
  | "nombreEmpresa"
  | "rubro"
  | "descripcionNegocio"
  | "publicoObjetivo"
  | "tonoComunicacion"
  | "zonaCobertura"
  | "diferenciales"
  | "reglasEvitar";

interface DefCampo {
  key: CampoTexto;
  /** Campo equivalente en el perfil inferido; reglasEvitar no se infiere. */
  inferido?: Exclude<CampoPerfil, "productos">;
  label: string;
  placeholder: string;
  lineas: number;
}

const CAMPOS: DefCampo[] = [
  { key: "nombreEmpresa", inferido: "nombre_empresa", label: "Nombre del negocio", placeholder: "Ej: Pets Center", lineas: 1 },
  { key: "rubro", inferido: "rubro", label: "A qué se dedica", placeholder: "Ej: Venta de alimentos y accesorios para mascotas", lineas: 1 },
  { key: "descripcionNegocio", inferido: "descripcion_negocio", label: "Descripción", placeholder: "Contá en pocas líneas qué hace tu negocio y qué lo distingue.", lineas: 3 },
  { key: "publicoObjetivo", inferido: "publico_objetivo", label: "Público objetivo", placeholder: "Ej: Dueños de perros y gatos de la zona oeste.", lineas: 2 },
  { key: "tonoComunicacion", inferido: "tono_comunicacion", label: "Tono de comunicación", placeholder: "Ej: Cercano, con voseo y algún emoji.", lineas: 2 },
  { key: "zonaCobertura", inferido: "zona_cobertura", label: "Zona de cobertura", placeholder: "Ej: CABA y GBA. Envíos en el día.", lineas: 2 },
  { key: "diferenciales", inferido: "diferenciales", label: "Diferenciales", placeholder: "Ej: Sistema de puntos, descuentos con tarjeta, retiro en sucursal.", lineas: 2 },
  { key: "reglasEvitar", label: "Qué evitar al comunicar", placeholder: "Ej: No prometer plazos de entrega exactos. No hablar de competidores.", lineas: 2 },
];

const BTN_PRIMARIO =
  "text-[13px] font-bold text-white bg-ys-green rounded-[10px] px-4 py-2.5 cursor-pointer transition-all hover:bg-ys-green-hover disabled:opacity-60 disabled:cursor-default";
const BTN_SECUNDARIO =
  "text-[13px] font-bold text-[#3f4844] border border-ys-border rounded-[10px] px-4 py-2.5 cursor-pointer transition-colors hover:bg-[#f7f9f8] disabled:opacity-60 disabled:cursor-default";
const INPUT_CLS =
  "w-full border border-ys-border rounded-[10px] px-3 py-2.5 text-[13.5px] font-medium text-ys-text outline-none focus:border-ys-green disabled:bg-ys-el2 disabled:cursor-not-allowed resize-none";

function hace(fechaIso: string | null): string {
  if (!fechaIso) return "";
  const min = Math.round((Date.now() - new Date(fechaIso).getTime()) / 60000);
  if (min < 1) return "hace instantes";
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 48) return `hace ${h} h`;
  return `hace ${Math.round(h / 24)} días`;
}

/** Resumen legible de qué cambiaría una propuesta. */
function lineasPropuesta(p: PropuestaPerfil): string[] {
  const l: string[] = [];
  const t = (rotulo: string, v?: string) => v && l.push(`${rotulo}: ${v}`);
  t("Nombre del negocio", p.nombreEmpresa);
  t("A qué se dedica", p.rubro);
  t("Descripción", p.descripcionNegocio);
  t("Público objetivo", p.publicoObjetivo);
  t("Tono", p.tonoComunicacion);
  t("Zona de cobertura", p.zonaCobertura);
  t("Diferenciales", p.diferenciales);
  t("Qué evitar", p.reglasEvitar);
  const prods = p.productosUpsert ?? [];
  for (const x of prods.slice(0, 12)) {
    l.push(`Producto: ${x.nombre}${x.precio ? ` — ${x.precio}` : ""}`);
  }
  if (prods.length > 12) l.push(`…y ${prods.length - 12} productos más`);
  for (const n of p.productosQuitar ?? []) l.push(`Quitar producto: ${n}`);
  return l;
}

function leerBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const r = reader.result;
      if (typeof r !== "string") return reject(new Error("read failed"));
      // readAsDataURL devuelve "data:<mime>;base64,<contenido>".
      resolve(r.split(",")[1] ?? "");
    };
    reader.onerror = () => reject(new Error("read failed"));
    reader.readAsDataURL(file);
  });
}

function Campo({
  def,
  valor,
  onChange,
  readOnly,
  completadoPorIA,
}: {
  def: DefCampo;
  valor: string;
  onChange: (v: string) => void;
  readOnly: boolean;
  completadoPorIA: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <label className="text-[11px] font-extrabold tracking-[0.05em] uppercase text-ys-dimmer">
          {def.label}
        </label>
        {completadoPorIA && valor.trim() && (
          <span className="text-[11px] font-bold text-ys-green-text">✓ Completado desde tus chats</span>
        )}
      </div>
      {def.lineas === 1 ? (
        <input
          value={valor}
          onChange={(e) => onChange(e.target.value)}
          readOnly={readOnly}
          placeholder={def.placeholder}
          maxLength={2000}
          autoComplete="off"
          className={INPUT_CLS}
        />
      ) : (
        <textarea
          value={valor}
          onChange={(e) => onChange(e.target.value)}
          readOnly={readOnly}
          placeholder={def.placeholder}
          rows={def.lineas}
          maxLength={2000}
          className={INPUT_CLS}
        />
      )}
    </div>
  );
}

export default function Perfil({ tieneOrganizacion }: { tieneOrganizacion: boolean }) {
  const [datos, setDatos] = useState<DatosNegocio | null>(null);
  const [guardado, setGuardado] = useState<DatosNegocio | null>(null);
  const [inferido, setInferido] = useState<PerfilNegocio | null>(null);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [regenerando, setRegenerando] = useState(false);
  const [procesandoNov, setProcesandoNov] = useState(false);

  const [chat, setChat] = useState<PerfilChatMensaje[]>([]);
  const [entrada, setEntrada] = useState("");
  const [pensando, setPensando] = useState(false);
  const [aplicando, setAplicando] = useState<string | null>(null);
  const [importando, setImportando] = useState(false);
  const [agregando, setAgregando] = useState(false);
  const [nuevoCampo, setNuevoCampo] = useState<CampoTexto | "producto">("descripcionNegocio");
  const [nuevoTexto, setNuevoTexto] = useState("");
  const [nuevoProd, setNuevoProd] = useState({ nombre: "", precio: "", descripcion: "" });
  const fileRef = useRef<HTMLInputElement>(null);
  const finChat = useRef<HTMLDivElement>(null);

  // Último estado guardado, legible desde el intervalo de polling sin
  // reiniciarlo cada vez que cambia.
  const guardadoRef = useRef<DatosNegocio | null>(null);
  useEffect(() => {
    guardadoRef.current = guardado;
  }, [guardado]);

  const sucio = !!datos && !!guardado && JSON.stringify(datos) !== JSON.stringify(guardado);
  const editable = datos?.editable ?? false;
  const generando = inferido?.estado === "generando";

  const recargarInferido = useCallback(async () => {
    setInferido(await getPerfilNegocioAction());
  }, []);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      let [d, p] = await Promise.all([getDatosNegocioAction(), getPerfilNegocioAction()]);
      // Si el perfil ya se analizó pero todavía no se copió a "Datos de la empresa"
      // (por ejemplo, el análisis es anterior a esta pantalla), se completa ahora.
      // Solo toca celdas vacías y respeta lo que la persona borró a propósito.
      let completado: { campos: number; productos: number } | null = null;
      if (p?.estado === "listo" && d?.editable) {
        const r = await completarPerfilDesdeChatsAction();
        if (!r.error && (r.campos > 0 || r.productos > 0)) {
          completado = r;
          [d, p] = await Promise.all([getDatosNegocioAction(), getPerfilNegocioAction()]);
        }
      }
      if (cancelado) return;
      setDatos(d);
      setGuardado(d);
      setInferido(p);
      if (completado) {
        const partes: string[] = [];
        if (completado.campos > 0) partes.push(`${completado.campos} dato${completado.campos === 1 ? "" : "s"}`);
        if (completado.productos > 0) partes.push(`${completado.productos} producto${completado.productos === 1 ? "" : "s"}`);
        setMsg({ type: "ok", text: `Completamos ${partes.join(" y ")} con lo que encontramos en tus chats. Revisalo y editá lo que haga falta.` });
      }
      setCargando(false);
    })();
    return () => {
      cancelado = true;
    };
  }, []);

  // Mientras el workflow investiga los chats, se consulta cada pocos segundos.
  // Al terminar, el workflow ya volcó lo detectado a las celdas vacías, así
  // que se vuelven a leer los datos (si no hay cambios sin guardar).
  useEffect(() => {
    if (!generando) return;
    const id = setInterval(async () => {
      const p = await getPerfilNegocioAction();
      setInferido(p);
      if (p?.estado !== "generando") {
        const d = await getDatosNegocioAction();
        setDatos((actual) => (actual && guardadoRef.current && JSON.stringify(actual) !== JSON.stringify(guardadoRef.current) ? actual : d));
        setGuardado(d);
        setMsg(
          p?.estado === "listo"
            ? { type: "ok", text: "Terminamos de analizar tus conversaciones. Revisá lo que completamos." }
            : null,
        );
      }
    }, POLL_MS);
    return () => clearInterval(id);
  }, [generando]);

  useEffect(() => {
    finChat.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [chat, pensando]);

  /** Suma un dato escrito a mano al cuadro elegido (queda editable y sin guardar). */
  function agregarInfo() {
    if (nuevoCampo === "producto") {
      const nombre = nuevoProd.nombre.trim();
      if (!nombre) return;
      const prod = { nombre, precio: nuevoProd.precio.trim(), descripcion: nuevoProd.descripcion.trim() };
      setDatos((d) => (d ? { ...d, productos: [...d.productos, prod] } : d));
      setNuevoProd({ nombre: "", precio: "", descripcion: "" });
    } else {
      const texto = nuevoTexto.trim();
      if (!texto) return;
      setDatos((d) => {
        if (!d) return d;
        const actual = d[nuevoCampo].trim();
        return { ...d, [nuevoCampo]: actual ? `${actual}. ${texto}` : texto };
      });
      setNuevoTexto("");
    }
    setAgregando(false);
    setMsg({ type: "ok", text: "Lo sumamos. Revisalo y tocá «Guardar cambios»." });
  }

  function setCampo(key: CampoTexto, v: string) {
    setDatos((d) => (d ? { ...d, [key]: v } : d));
  }

  async function guardar() {
    if (!datos || !editable) return;
    setGuardando(true);
    setMsg(null);
    const { editable: _e, ...base } = datos;
    void _e;
    const res = await actualizarDatosNegocioAction(base, tieneOrganizacion);
    setGuardando(false);
    if (res.error) setMsg({ type: "err", text: res.error });
    else {
      setGuardado(datos);
      setMsg({ type: "ok", text: "Cambios guardados." });
    }
  }

  async function volverAAnalizar() {
    setRegenerando(true);
    setMsg(null);
    const res = await regenerarPerfilNegocioAction();
    if (res.error) setMsg({ type: "err", text: res.error });
    await recargarInferido();
    setRegenerando(false);
  }

  /** Acepta novedades: las aplica juntas por el mismo camino que el asistente. */
  async function aceptarNovedades(lista: Novedad[]) {
    if (sucio) {
      setMsg({ type: "err", text: "Guardá tus cambios antes de aceptar novedades, así no se pisan." });
      return;
    }
    setProcesandoNov(true);
    setMsg(null);
    const res = await aplicarPropuestaPerfilAction(juntarPropuestas(lista.map((n) => n.propuesta)));
    setProcesandoNov(false);
    if (res.error) {
      setMsg({ type: "err", text: res.error });
      return;
    }
    if (res.datos) {
      setDatos(res.datos);
      setGuardado(res.datos);
    }
    setMsg({ type: "ok", text: res.resumen });
  }

  /** Ignora novedades: se recuerda para no volver a sugerirlas. */
  async function ignorarNovedades(lista: Novedad[]) {
    setProcesandoNov(true);
    const res = await ignorarNovedadesAction(lista.flatMap((n) => n.claves));
    if (res.error) setMsg({ type: "err", text: res.error });
    await recargarInferido();
    setProcesandoNov(false);
  }

  async function enviarChat() {
    const texto = entrada.trim();
    if (!texto || pensando) return;
    const previo = chat;
    setChat([...previo, { id: `u-${Date.now()}`, role: "user", text: texto }]);
    setEntrada("");
    setPensando(true);
    const res = await conversarPerfilAction(
      previo.map((m) => ({ role: m.role, text: m.text })),
      texto,
    );
    setPensando(false);
    setChat((c) => [
      ...c,
      res.error
        ? { id: `e-${Date.now()}`, role: "assistant", text: res.error }
        : { id: `a-${Date.now()}`, role: "assistant", text: res.respuesta, propuesta: res.propuesta ?? undefined },
    ]);
  }

  async function resolverPropuesta(id: string, propuesta: PropuestaPerfil, aplicar: boolean) {
    if (!aplicar) {
      setChat((c) => c.map((m) => (m.id === id ? { ...m, propuestaEstado: "descartada" } : m)));
      return;
    }
    if (sucio) {
      setMsg({ type: "err", text: "Guardá tus cambios antes de aplicar la propuesta, así no se pisan." });
      return;
    }
    setAplicando(id);
    const res = await aplicarPropuestaPerfilAction(propuesta);
    setAplicando(null);
    if (res.error) {
      setMsg({ type: "err", text: res.error });
      return;
    }
    if (res.datos) {
      setDatos(res.datos);
      setGuardado(res.datos);
    }
    setChat((c) => [
      ...c.map((m): PerfilChatMensaje => (m.id === id ? { ...m, propuestaEstado: "aplicada" } : m)),
      { id: `r-${Date.now()}`, role: "assistant", text: res.resumen },
    ]);
  }

  /** Un archivo adjunto va al chat: se muestra como mensaje y la respuesta trae la propuesta. */
  async function importar(file: File) {
    setImportando(true);
    setChat((c) => [...c, { id: `f-${Date.now()}`, role: "user", text: `📎 ${file.name}` }]);
    let texto: string;
    let propuesta: PropuestaPerfil | undefined;
    try {
      const base64 = await leerBase64(file);
      const res = await importarArchivoPerfilAction(base64, file.name, file.type);
      if (res.error) {
        texto = res.error;
      } else if (!res.propuesta) {
        texto = res.resumen || "No encontré datos del negocio en el archivo.";
      } else {
        texto = `${res.resumen}\nSi un producto ya existe le actualizo precio y descripción; los nuevos los agrego. ¿Lo aplico?`;
        propuesta = res.propuesta;
      }
    } catch {
      texto = "No se pudo leer el archivo.";
    }
    setImportando(false);
    setChat((c) => [...c, { id: `i-${Date.now()}`, role: "assistant", text: texto, propuesta }]);
  }

  if (cargando || !datos) {
    return (
      <div className="px-4 md:px-[38px] pt-6 text-[13px] font-semibold text-ys-muted">
        {cargando ? "Cargando perfil…" : "No se pudo cargar el perfil."}
      </div>
    );
  }

  const decisiones = inferido?.decisiones ?? {};
  // Se calculan contra lo GUARDADO (no lo que se está tipeando), así no
  // parpadean mientras el usuario escribe.
  const novedades: Novedad[] =
    editable && guardado && inferido?.estado === "listo"
      ? calcularNovedades(guardado, inferido.perfil, inferido.ignorados)
      : [];
  const sinHallazgos =
    inferido?.estado === "listo" &&
    !Object.values(inferido.perfil).some((v) => (Array.isArray(v) ? v.length > 0 : !!v?.valor));
  // El análisis inicial corre solo cuando se conecta el WhatsApp, así que el botón
  // solo hace falta si nunca se analizó o si falló.
  const puedeAnalizar = !generando && (!inferido || inferido.estado === "error");

  return (
    <div className="flex-1 min-w-0 flex flex-col overflow-y-auto lg:overflow-hidden pt-[58px] md:pt-0">
      <div className="flex-none px-4 md:px-[38px] pt-3 md:pt-[34px] pb-4 flex flex-col gap-1.5">
        <div className="text-2xl md:text-[28px] font-extrabold tracking-[-0.025em] text-ys-text">Perfil</div>
        <div className="text-sm md:text-[15px] text-ys-dim font-medium max-w-[760px]">
          Todo lo que la IA sabe de tu negocio. Lo completamos solos leyendo tus chats de WhatsApp; vos lo editás a mano, o
          se lo contás al asistente.
        </div>
      </div>

      <div className="px-4 md:px-[38px] pb-6 grid grid-cols-1 lg:grid-cols-2 gap-5 flex-1 min-h-0">
        {/* ── Izquierda: datos cargados desde los chats, editables ── */}
        <div className="min-w-0 flex flex-col gap-4 lg:overflow-y-auto lg:pr-2 lg:pb-4">
          {editable && (
            <div className="flex flex-col gap-3">
              <div>
                <button type="button" onClick={() => setAgregando((v) => !v)} className={BTN_SECUNDARIO}>
                  {agregando ? "Cerrar" : "+ Agregar información"}
                </button>
              </div>
              {agregando && (
                <div className="border border-ys-border-soft rounded-xl p-4 flex flex-col gap-3">
                  <select
                    value={nuevoCampo}
                    onChange={(e) => setNuevoCampo(e.target.value as CampoTexto | "producto")}
                    className={INPUT_CLS}
                  >
                    {CAMPOS.map((c) => (
                      <option key={c.key} value={c.key}>{c.label}</option>
                    ))}
                    <option value="producto">Producto o servicio</option>
                  </select>
                  {nuevoCampo === "producto" ? (
                    <div className="flex flex-col gap-2">
                      <input value={nuevoProd.nombre} onChange={(e) => setNuevoProd((p) => ({ ...p, nombre: e.target.value }))} placeholder="Nombre del producto o servicio" className={INPUT_CLS} />
                      <input value={nuevoProd.precio} onChange={(e) => setNuevoProd((p) => ({ ...p, precio: e.target.value }))} placeholder="Precio (opcional)" className={INPUT_CLS} />
                      <input value={nuevoProd.descripcion} onChange={(e) => setNuevoProd((p) => ({ ...p, descripcion: e.target.value }))} placeholder="Descripción (opcional)" className={INPUT_CLS} />
                    </div>
                  ) : (
                    <textarea
                      value={nuevoTexto}
                      onChange={(e) => setNuevoTexto(e.target.value)}
                      rows={3}
                      maxLength={2000}
                      placeholder="Escribí el dato. Se suma a lo que ya tengas en ese cuadro."
                      className={INPUT_CLS}
                    />
                  )}
                  <div>
                    <button
                      type="button"
                      onClick={agregarInfo}
                      disabled={nuevoCampo === "producto" ? !nuevoProd.nombre.trim() : !nuevoTexto.trim()}
                      className={BTN_PRIMARIO}
                    >
                      Agregar
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="border border-ys-border-soft rounded-xl p-4 flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
            <div className="text-[13px] font-semibold text-ys-muted leading-[1.5]">
              {generando ? (
                <span className="flex items-center gap-2.5 text-ys-text">
                  <span className="w-4 h-4 rounded-full border-2 border-ys-green-bg border-t-ys-green animate-spin" />
                  Leyendo tus conversaciones… puede tardar un minuto.
                </span>
              ) : inferido?.estado === "listo" ? (
                <>
                  Analizamos {inferido.mensajesAnalizados.toLocaleString("es-AR")} mensajes de tus chats {hace(inferido.generadoAt)}.
                  Completamos lo que estaba vacío.
                </>
              ) : inferido?.estado === "error" ? (
                inferido.error === "sin_conversaciones" ? (
                  "Todavía no hay conversaciones suficientes para armar tu perfil. Cuando tengas chats, volvé a intentar."
                ) : (
                  (inferido.error ?? "No se pudo analizar tus conversaciones.")
                )
              ) : (
                "Todavía no analizamos tus chats. Cuando lo hagamos, completamos solos lo que falte."
              )}
            </div>
            {puedeAnalizar && (
              <button type="button" onClick={volverAAnalizar} disabled={regenerando} className={`${BTN_PRIMARIO} self-start sm:self-auto whitespace-nowrap`}>
                {regenerando ? "Analizando…" : inferido ? "Reintentar" : "Analizar mis chats"}
              </button>
            )}
          </div>

          {msg && <StatusMsg msg={msg} />}

          {sinHallazgos && (
            <div className="text-[13px] font-semibold text-ys-muted leading-[1.5] border border-ys-border-soft rounded-xl p-4">
              No encontramos datos claros de tu negocio en los chats (es normal si hay sobre todo conversaciones personales).
              Completalo a mano o contáselo al asistente.
            </div>
          )}

          {!editable && (
            <div className="text-[12.5px] font-semibold text-ys-warn-text bg-ys-warn-bg rounded-[10px] px-3.5 py-2.5">
              Estos datos los administra tu empresa: podés verlos, pero no editarlos.
            </div>
          )}

          {novedades.length > 0 && (
            <div className="flex flex-col gap-2">
              {novedades.map((n) => (
                <div key={n.claves.join("|")} className="bg-white border border-ys-green-border rounded-xl px-3.5 py-3 flex flex-col sm:flex-row sm:items-center gap-2.5 sm:justify-between">
                  <div className="min-w-0 flex flex-col gap-0.5">
                    <div className="text-[13px] font-bold text-ys-text">{n.titulo}</div>
                    <div className="text-[12.5px] font-medium text-ys-muted leading-[1.45]">{n.detalle}</div>
                    {(n.tipo === "campo" || n.tipo === "precio") && (
                      <div className="text-[12px] font-semibold text-ys-dim">Ahora tenés: {n.actual}</div>
                    )}
                  </div>
                  <div className="flex gap-2 flex-none">
                    <button type="button" disabled={procesandoNov} onClick={() => aceptarNovedades([n])} className="text-[12px] font-bold text-white bg-ys-green rounded-lg px-3 py-1.5 cursor-pointer hover:bg-ys-green-hover disabled:opacity-60">
                      Aceptar
                    </button>
                    <button type="button" disabled={procesandoNov} onClick={() => ignorarNovedades([n])} className="text-[12px] font-bold text-[#3f4844] border border-ys-border rounded-lg px-3 py-1.5 cursor-pointer hover:bg-[#f7f9f8] disabled:opacity-60">
                      Ignorar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="border border-ys-border-soft rounded-xl p-5 flex flex-col gap-4">
            <div className="text-[15px] font-extrabold text-ys-text">Datos del negocio</div>
            {CAMPOS.map((def) => (
              <Campo
                key={def.key}
                def={def}
                valor={datos[def.key]}
                onChange={(v) => setCampo(def.key, v)}
                readOnly={!editable}
                completadoPorIA={!!def.inferido && decisiones[def.inferido] === "aplicado"}
              />
            ))}

            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between gap-2">
                <label className="text-[11px] font-extrabold tracking-[0.05em] uppercase text-ys-dimmer">
                  Productos y servicios ({datos.productos.length})
                </label>
                {decisiones.productos === "aplicado" && datos.productos.length > 0 && (
                  <span className="text-[11px] font-bold text-ys-green-text">✓ Incluye productos detectados en tus chats</span>
                )}
              </div>
              <ProductosEditor
                productos={datos.productos}
                onChange={(p) => setDatos((d) => (d ? { ...d, productos: p } : d))}
                readOnly={!editable}
                msg={null}
                textoAyuda="Para cargar tu lista de precios, adjuntala en el chat con el clip: primero revisás qué se detectó y después lo aplicás."
              />
            </div>

            {editable && (
              <div className="flex items-center gap-3">
                <button type="button" onClick={guardar} disabled={guardando || !sucio} className={BTN_PRIMARIO}>
                  {guardando ? "Guardando…" : "Guardar cambios"}
                </button>
                {sucio && !guardando && <span className="text-[12px] font-semibold text-ys-warn-text">Tenés cambios sin guardar</span>}
              </div>
            )}
          </div>
        </div>

        {/* ── Derecha: chat con el asistente ── */}
        <div className="min-w-0 flex flex-col border border-ys-border-soft rounded-xl bg-white overflow-hidden min-h-[560px] lg:min-h-0">
          <div className="flex-none px-4 py-3 border-b border-ys-border-softest">
            <div className="text-[15px] font-extrabold text-ys-text">Asistente del perfil</div>
            <div className="text-[12px] font-medium text-ys-muted">Completá, corregí o mejorá tu perfil charlando.</div>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto p-4 flex flex-col gap-3">
            <div className="max-w-[88%] rounded-xl px-3 py-2 text-[13px] font-medium leading-[1.5] bg-ys-el2 text-ys-text">
              {SALUDO}
            </div>

            {chat.map((m) => {
              const lineas = m.propuesta ? lineasPropuesta(m.propuesta) : [];
              return (
                <div key={m.id} className={`flex flex-col gap-2 ${m.role === "user" ? "items-end" : "items-start"}`}>
                  <div className={`max-w-[88%] rounded-xl px-3 py-2 text-[13px] font-medium leading-[1.5] whitespace-pre-wrap ${m.role === "user" ? "bg-ys-green text-white" : "bg-ys-el2 text-ys-text"}`}>
                    {m.text}
                  </div>
                  {m.propuesta && lineas.length > 0 && (
                    <div className="w-full max-w-[92%] border border-ys-green-border bg-[#f7fbf9] rounded-xl px-3 py-2.5 flex flex-col gap-2">
                      <div className="text-[11px] font-extrabold tracking-[0.05em] uppercase text-ys-dimmer">Cambios propuestos</div>
                      <ul className="flex flex-col gap-1 max-h-[200px] overflow-y-auto">
                        {lineas.map((l, i) => (
                          <li key={i} className="text-[12.5px] font-semibold text-ys-text">• {l}</li>
                        ))}
                      </ul>
                      {m.propuestaEstado === "aplicada" ? (
                        <span className="text-[12.5px] font-bold text-ys-green-text">✓ Aplicado</span>
                      ) : m.propuestaEstado === "descartada" ? (
                        <span className="text-[12.5px] font-semibold text-ys-muted">Descartado</span>
                      ) : editable ? (
                        <div className="flex gap-2">
                          <button type="button" disabled={aplicando === m.id} onClick={() => resolverPropuesta(m.id, m.propuesta!, true)} className={BTN_PRIMARIO}>
                            {aplicando === m.id ? "Aplicando…" : "Aplicar"}
                          </button>
                          <button type="button" disabled={aplicando === m.id} onClick={() => resolverPropuesta(m.id, m.propuesta!, false)} className={BTN_SECUNDARIO}>
                            Descartar
                          </button>
                        </div>
                      ) : (
                        <span className="text-[12px] font-semibold text-ys-muted">Solo tu empresa puede aplicar cambios.</span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {(pensando || importando) && (
              <div className="text-[12.5px] font-semibold text-ys-muted">
                {importando ? "Leyendo el archivo…" : "El asistente está pensando…"}
              </div>
            )}
            <div ref={finChat} />
          </div>

          <div className="flex-none border-t border-ys-border-softest p-3 flex flex-col gap-1.5">
            <div className="flex items-end gap-2">
              <button
                type="button"
                title="Adjuntar archivo (PDF, Excel, Word, CSV o foto)"
                aria-label="Adjuntar archivo"
                disabled={!editable || importando}
                onClick={() => fileRef.current?.click()}
                className="flex-none w-10 h-10 rounded-[10px] border border-ys-border flex items-center justify-center text-ys-muted cursor-pointer transition-colors hover:bg-[#f7f9f8] hover:text-ys-text disabled:opacity-60 disabled:cursor-default"
              >
                <svg width="17" height="17" viewBox="0 0 16 16" fill="none">
                  <path d="m13.2 7.4-4.9 4.9a3 3 0 0 1-4.2-4.2l5.2-5.2a2 2 0 0 1 2.8 2.8L7 10.9a1 1 0 0 1-1.4-1.4l4.6-4.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              <textarea
                value={entrada}
                onChange={(e) => setEntrada(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    enviarChat();
                  }
                }}
                rows={2}
                maxLength={2000}
                disabled={!editable}
                placeholder={editable ? "Escribí acá… Ej: Hacemos envíos en el día a todo GBA." : "Solo tu empresa puede editar estos datos."}
                className={`flex-1 min-w-0 ${INPUT_CLS}`}
              />
              <button type="button" onClick={enviarChat} disabled={!editable || pensando || !entrada.trim()} className={BTN_PRIMARIO}>
                Enviar
              </button>
              <input
                ref={fileRef}
                type="file"
                accept=".pdf,.xlsx,.csv,.docx,.txt,image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) importar(f);
                }}
              />
            </div>
            <div className="text-[11.5px] font-medium text-ys-dim">
              Adjuntá una lista de precios o un catálogo (PDF, Excel, Word, CSV o foto) y te armo los cambios para que los apliques.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
