"use client";

import { useState } from "react";
import type { Contact, ChatPayload } from "@/lib/types";
import { ScoreBadge } from "./ContactsTable";

function initialsOf(nombre: string): string {
  const parts = nombre.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "—";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

// -------------------------------------------------------------------------
// Tarjeta: seleccionar_contactos
// Tabla de contactos con checkboxes dentro del chat, con posible
// preselección (cuando vino de un análisis de IA por consulta).
// -------------------------------------------------------------------------
interface SeleccionarContactosCardProps {
  contacts: Contact[];
  preselectedIds: string[];
  consultaUsada?: string | null;
  onConfirm: (contactosIds: string[]) => void;
  disabled?: boolean;
}

export function SeleccionarContactosCard({
  contacts,
  preselectedIds,
  consultaUsada,
  onConfirm,
  disabled,
}: SeleccionarContactosCardProps) {
  const [selected, setSelected] = useState<Set<string>>(
    new Set(preselectedIds),
  );
  const [query, setQuery] = useState("");
  const [confirmed, setConfirmed] = useState(false);

  function toggle(id: string) {
    if (confirmed) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const filtered = contacts.filter(
    (c) =>
      c.nombre.toLowerCase().includes(query.toLowerCase()) ||
      c.tel.includes(query),
  );

  return (
    <div className="bg-white border border-ys-border rounded-2xl overflow-hidden flex flex-col">
      {consultaUsada && (
        <div className="px-4 py-2.5 bg-ys-green-bg text-xs font-bold text-ys-green-text border-b border-ys-border-softest">
          Filtrado por: &ldquo;{consultaUsada}&rdquo;
        </div>
      )}
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-ys-border-softest">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="flex-none">
          <circle cx="7" cy="7" r="4.5" stroke="#9aa19c" strokeWidth="1.5" />
          <path d="m10.5 10.5 3 3" stroke="#9aa19c" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar contacto..."
          disabled={confirmed}
          className="flex-1 min-w-0 border-none outline-none bg-transparent text-[13px] font-semibold text-ys-text disabled:opacity-60"
        />
        <div className="flex-none text-xs font-bold text-ys-green-text bg-ys-green-bg rounded-full px-2.5 py-1">
          {selected.size} seleccionado{selected.size === 1 ? "" : "s"}
        </div>
      </div>

      <div className="max-h-[280px] overflow-y-auto flex flex-col">
        {filtered.length === 0 && (
          <div className="text-center text-[13px] text-ys-muted font-medium py-6">
            No encontramos contactos con ese nombre.
          </div>
        )}
        {filtered.map((c) => {
          const active = selected.has(c.id);
          return (
            <button
              key={c.id}
              onClick={() => toggle(c.id)}
              disabled={confirmed}
              className="flex items-center gap-3 px-4 py-2.5 border-b border-ys-border-softest last:border-b-0 text-left transition-colors hover:bg-[#f7fbf9] disabled:hover:bg-transparent disabled:cursor-default"
            >
              <div className="w-[18px] h-[18px] flex-none rounded-[6px] border-[1.5px] border-ys-border bg-white flex items-center justify-center">
                {active && (
                  <div className="w-[18px] h-[18px] -m-[1.5px] rounded-[6px] bg-ys-green flex items-center justify-center">
                    <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
                      <path d="m3 8.4 3.4 3L13 4.6" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                )}
              </div>
              <div className="w-[30px] h-[30px] flex-none rounded-full bg-ys-el2 text-[#5d6560] text-[11px] font-extrabold flex items-center justify-center">
                {initialsOf(c.nombre)}
              </div>
              <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                <div className="text-[13.5px] font-bold text-ys-text truncate">
                  {c.nombre || "Sin nombre"}
                </div>
                <div className="font-mono text-[11.5px] text-ys-dim truncate">
                  {c.tel || "—"}
                </div>
              </div>
              <ScoreBadge score={c.score} />
            </button>
          );
        })}
      </div>

      <div className="px-4 py-3 border-t border-ys-border-softest">
        <button
          onClick={() => {
            setConfirmed(true);
            onConfirm(Array.from(selected));
          }}
          disabled={confirmed || disabled || selected.size === 0}
          className="w-full text-[13px] font-bold text-white bg-ys-green rounded-[10px] py-2.5 cursor-pointer transition-all hover:bg-ys-green-hover disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {confirmed ? "Selección confirmada" : "Confirmar selección"}
        </button>
      </div>
    </div>
  );
}

// -------------------------------------------------------------------------
// Tarjeta: confirmar_audiencia
// Resumen final antes de escribir en Supabase — el usuario tiene que hacer
// click explícito, el bot nunca crea la audiencia sola.
// -------------------------------------------------------------------------
interface ConfirmarAudienciaCardProps {
  nombre: string;
  contactosIds: string[];
  onConfirm: () => void;
  disabled?: boolean;
}

export function ConfirmarAudienciaCard({
  nombre,
  contactosIds,
  onConfirm,
  disabled,
}: ConfirmarAudienciaCardProps) {
  const [confirmed, setConfirmed] = useState(false);

  return (
    <div className="bg-white border border-ys-border rounded-2xl px-5 py-[18px] flex flex-col gap-3.5">
      <div className="flex items-center gap-3">
        <div className="w-[38px] h-[38px] flex-none rounded-xl bg-ys-green-bg flex items-center justify-center">
          <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
            <circle cx="5.2" cy="6" r="2.2" stroke="#12B76A" strokeWidth="1.5" />
            <circle cx="10.8" cy="6" r="2.2" stroke="#12B76A" strokeWidth="1.5" />
            <path d="M1.8 13c0-1.9 1.5-3 3.4-3s3.4 1.1 3.4 3M7.4 13c0-1.9 1.5-3 3.4-3s3.4 1.1 3.4 3" stroke="#12B76A" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </div>
        <div className="flex-1 min-w-0 flex flex-col gap-0.5">
          <div className="text-[15px] font-extrabold text-ys-text truncate">{nombre}</div>
          <div className="text-xs text-ys-dim font-semibold">
            {contactosIds.length} contacto{contactosIds.length === 1 ? "" : "s"}
          </div>
        </div>
      </div>
      <button
        onClick={() => {
          setConfirmed(true);
          onConfirm();
        }}
        disabled={confirmed || disabled}
        className="text-[13px] font-bold text-white bg-ys-green rounded-[10px] py-2.5 cursor-pointer transition-all hover:bg-ys-green-hover disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {confirmed ? "Creando..." : "Crear audiencia"}
      </button>
    </div>
  );
}

// -------------------------------------------------------------------------
// Tarjeta: audiencia_creada
// Confirmación final + follow-ups, en el mismo espíritu que hasFollowUps
// del prototipo.
// -------------------------------------------------------------------------
interface AudienciaCreadaCardProps {
  nombre: string;
  totalContactos: number;
  onVerAudiencia: () => void;
}

export function AudienciaCreadaCard({
  nombre,
  totalContactos,
  onVerAudiencia,
}: AudienciaCreadaCardProps) {
  return (
    <div className="bg-white border border-ys-border rounded-2xl px-5 py-[18px] flex items-center gap-3">
      <div className="w-[38px] h-[38px] flex-none rounded-xl bg-ys-green-bg flex items-center justify-center">
        <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
          <path d="m3 8.4 4 4L14 3.6" stroke="#12B76A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <div className="flex-1 min-w-0 flex flex-col gap-0.5">
        <div className="text-[14.5px] font-extrabold text-ys-text truncate">{nombre}</div>
        <div className="text-xs text-ys-dim font-semibold">
          {totalContactos} contacto{totalContactos === 1 ? "" : "s"} · Audiencia creada
        </div>
      </div>
      <button
        onClick={onVerAudiencia}
        className="flex-none text-[12.5px] font-bold text-ys-green-text cursor-pointer transition-colors hover:text-ys-green"
      >
        Ver audiencia →
      </button>
    </div>
  );
}

/** Selector genérico según el `kind` del payload — usado desde IA.tsx. */
export function renderChatCard(
  payload: ChatPayload,
  contacts: Contact[],
  handlers: {
    onConfirmSeleccion: (ids: string[]) => void;
    onConfirmAudiencia: () => void;
    onVerAudiencia: (audienciaId: string) => void;
    onElegirCategoria: (categoria: string) => void;
    onUsarSugerencia: () => void;
    onPedirOtraSugerencia: () => void;
    onGuardarBorrador: () => void;
    onEnviarAMeta: () => void;
    onVerTemplates: () => void;
    onElegirAudienciaCampana: (audienciaId: string) => void;
    onElegirTemplateCampana: (templateId: string) => void;
    onElegirMomentoCampana: (momento: "ahora" | "programar") => void;
    onElegirFechaCampana: (fechaIso: string) => void;
    onConfirmarCampana: () => void;
    onVerCampana: (campanaId: string) => void;
    onConfirmarImportarContactos: (diasAnalisis: number, limiteContactos: number) => void;
    onCrearAudienciaDesdeBusqueda: (consulta: string, contactosIds: string[]) => void;
  },
  isLatest: boolean,
) {
  if (payload.kind === "seleccionar_contactos") {
    return (
      <SeleccionarContactosCard
        contacts={contacts}
        preselectedIds={payload.preselectedIds}
        consultaUsada={payload.consultaUsada}
        onConfirm={handlers.onConfirmSeleccion}
        disabled={!isLatest}
      />
    );
  }
  if (payload.kind === "confirmar_audiencia") {
    return (
      <ConfirmarAudienciaCard
        nombre={payload.nombre}
        contactosIds={payload.contactosIds}
        onConfirm={handlers.onConfirmAudiencia}
        disabled={!isLatest}
      />
    );
  }
  if (payload.kind === "audiencia_creada") {
    return (
      <AudienciaCreadaCard
        nombre={payload.nombre}
        totalContactos={payload.totalContactos}
        onVerAudiencia={() => handlers.onVerAudiencia(payload.audienciaId)}
      />
    );
  }
  if (payload.kind === "elegir_categoria_template") {
    return (
      <ElegirCategoriaTemplateCard
        onElegir={handlers.onElegirCategoria}
        disabled={!isLatest}
      />
    );
  }
  if (payload.kind === "sugerencia_template") {
    return (
      <SugerenciaTemplateCard
        sugerencia={payload.sugerencia}
        onUsar={handlers.onUsarSugerencia}
        onPedirOtra={handlers.onPedirOtraSugerencia}
        disabled={!isLatest}
      />
    );
  }
  if (payload.kind === "confirmar_template") {
    return (
      <ConfirmarTemplateCard
        nombre={payload.nombre}
        contenido={payload.contenido}
        categoria={payload.categoria}
        onGuardarBorrador={handlers.onGuardarBorrador}
        onEnviarAMeta={handlers.onEnviarAMeta}
        disabled={!isLatest}
      />
    );
  }
  if (payload.kind === "template_guardado") {
    return (
      <TemplateGuardadoCard
        nombre={payload.nombre}
        resultado={payload.resultado}
        onVerTemplates={handlers.onVerTemplates}
      />
    );
  }
  if (payload.kind === "elegir_audiencia_campana") {
    return (
      <ElegirAudienciaCampanaCard
        audiencias={payload.audiencias}
        onElegir={handlers.onElegirAudienciaCampana}
        disabled={!isLatest}
      />
    );
  }
  if (payload.kind === "elegir_template_campana") {
    return (
      <ElegirTemplateCampanaCard
        templates={payload.templates}
        onElegir={handlers.onElegirTemplateCampana}
        disabled={!isLatest}
      />
    );
  }
  if (payload.kind === "elegir_momento_campana") {
    return (
      <ElegirMomentoCampanaCard
        onElegir={handlers.onElegirMomentoCampana}
        disabled={!isLatest}
      />
    );
  }
  if (payload.kind === "elegir_fecha_campana") {
    return (
      <ElegirFechaCampanaCard
        onConfirmar={handlers.onElegirFechaCampana}
        disabled={!isLatest}
      />
    );
  }
  if (payload.kind === "confirmar_campana") {
    return (
      <ConfirmarCampanaCard
        nombre={payload.nombre}
        audienciaNombre={payload.audienciaNombre}
        totalContactos={payload.totalContactos}
        templateNombre={payload.templateNombre}
        momento={payload.momento}
        fechaProgramada={payload.fechaProgramada}
        costoUsd={payload.costoUsd}
        onConfirmar={handlers.onConfirmarCampana}
        disabled={!isLatest}
      />
    );
  }
  if (payload.kind === "campana_creada") {
    return (
      <CampanaCreadaCard
        nombre={payload.nombre}
        momento={payload.momento}
        fechaProgramada={payload.fechaProgramada}
        onVerCampana={() => handlers.onVerCampana(payload.campanaId)}
      />
    );
  }
  if (payload.kind === "confirmar_importar_contactos") {
    return (
      <ConfirmarImportarContactosCard
        diasAnalisis={payload.diasAnalisis}
        limiteContactos={payload.limiteContactos}
        onConfirmar={handlers.onConfirmarImportarContactos}
        disabled={!isLatest}
      />
    );
  }
  if (payload.kind === "importacion_completada") {
    return (
      <ImportacionCompletadaCard
        contactosAnalizados={payload.contactosAnalizados}
        leadsIdentificados={payload.leadsIdentificados}
        contactosProcesados={payload.contactosProcesados}
      />
    );
  }
  if (payload.kind === "resultados_busqueda_contactos") {
    return (
      <ResultadosBusquedaContactosCard
        consulta={payload.consulta}
        resultados={payload.resultados}
        onCrearGrupo={(ids) => handlers.onCrearAudienciaDesdeBusqueda(payload.consulta, ids)}
        disabled={!isLatest}
      />
    );
  }
  return null;
}

// -------------------------------------------------------------------------
// Tarjeta: elegir_categoria_template
// Mismas 3 categorías fijas que el modal manual y que acepta Meta/YCloud
// a nivel API (MARKETING, UTILITY, AUTHENTICATION — "Servicio" no es una
// categoría válida en la API de templates, aunque algunas plataformas lo
// usen como término de UX; mandarla causa PARAM_INVALID en YCloud).
// -------------------------------------------------------------------------
const CATEGORIAS_TEMPLATE = [
  { key: "marketing", label: "Marketing" },
  { key: "utility", label: "Utilidad" },
  { key: "authentication", label: "Autenticación" },
] as const;

interface ElegirCategoriaTemplateCardProps {
  onElegir: (categoria: string) => void;
  disabled?: boolean;
}

export function ElegirCategoriaTemplateCard({
  onElegir,
  disabled,
}: ElegirCategoriaTemplateCardProps) {
  const [elegida, setElegida] = useState<string | null>(null);

  return (
    <div className="bg-white border border-ys-border rounded-2xl px-5 py-[18px] flex flex-col gap-3">
      <div className="flex gap-2 flex-wrap">
        {CATEGORIAS_TEMPLATE.map((c) => {
          const active = elegida === c.key;
          return (
            <button
              key={c.key}
              onClick={() => {
                if (disabled || elegida) return;
                setElegida(c.key);
                onElegir(c.key);
              }}
              disabled={disabled || !!elegida}
              className={`text-[12.5px] font-bold rounded-full px-3.5 py-2 cursor-pointer transition-colors disabled:cursor-not-allowed ${
                active
                  ? "border-[1.5px] border-ys-green bg-ys-green-bg text-ys-green-text"
                  : "border border-ys-border text-[#3f4844] hover:bg-[#f7fbf9] hover:border-ys-green-border disabled:hover:bg-transparent"
              }`}
            >
              {c.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// -------------------------------------------------------------------------
// Tarjeta: sugerencia_template
// Muestra el mensaje que propuso la IA, con opción de usarlo o pedir otro.
// -------------------------------------------------------------------------
interface SugerenciaTemplateCardProps {
  sugerencia: string;
  onUsar: () => void;
  onPedirOtra: () => void;
  disabled?: boolean;
}

export function SugerenciaTemplateCard({
  sugerencia,
  onUsar,
  onPedirOtra,
  disabled,
}: SugerenciaTemplateCardProps) {
  const [resuelto, setResuelto] = useState(false);

  return (
    <div className="bg-white border border-ys-green-border rounded-2xl px-5 py-[18px] flex flex-col gap-3">
      <div className="text-[13.5px] leading-[1.55] text-[#2c3531] font-medium whitespace-pre-wrap">
        {sugerencia}
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => {
            setResuelto(true);
            onUsar();
          }}
          disabled={disabled || resuelto}
          className="text-[12.5px] font-extrabold text-white bg-ys-green rounded-[9px] px-3.5 py-2.5 cursor-pointer transition-all hover:bg-ys-green-hover hover:-translate-y-px disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Usar este mensaje
        </button>
        <button
          onClick={() => {
            setResuelto(true);
            onPedirOtra();
          }}
          disabled={disabled || resuelto}
          className="text-[12.5px] font-bold text-[#3f4844] border border-ys-border rounded-[9px] px-3.5 py-2.5 cursor-pointer transition-colors hover:bg-[#f7f9f8] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Generar otra opción
        </button>
      </div>
    </div>
  );
}

// -------------------------------------------------------------------------
// Tarjeta: confirmar_template
// Resumen final con las dos acciones posibles — guardar borrador o mandar
// a Meta — el bot nunca ejecuta ninguna de las dos sin este click explícito.
// -------------------------------------------------------------------------
const CATEGORIA_LABELS: Record<string, string> = {
  marketing: "Marketing",
  utility: "Utilidad",
  authentication: "Autenticación",
};

interface ConfirmarTemplateCardProps {
  nombre: string;
  contenido: string;
  categoria: string;
  onGuardarBorrador: () => void;
  onEnviarAMeta: () => void;
  disabled?: boolean;
}

export function ConfirmarTemplateCard({
  nombre,
  contenido,
  categoria,
  onGuardarBorrador,
  onEnviarAMeta,
  disabled,
}: ConfirmarTemplateCardProps) {
  const [accion, setAccion] = useState<"borrador" | "meta" | null>(null);

  return (
    <div className="bg-white border border-ys-border rounded-2xl px-5 py-[18px] flex flex-col gap-3.5">
      <div className="flex items-center gap-3">
        <div className="w-[38px] h-[38px] flex-none rounded-xl bg-ys-green-bg flex items-center justify-center">
          <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
            <path d="m8 2 1.6 3.6L13 7l-3.4 1.4L8 12 6.4 8.4 3 7l3.4-1.4L8 2Z" stroke="#12B76A" strokeWidth="1.5" strokeLinejoin="round" />
          </svg>
        </div>
        <div className="flex-1 min-w-0 flex flex-col gap-0.5">
          <div className="text-[15px] font-extrabold text-ys-text truncate">{nombre}</div>
          <div className="text-xs text-ys-dim font-semibold">
            {CATEGORIA_LABELS[categoria] ?? categoria}
          </div>
        </div>
      </div>
      <div className="border border-ys-border-softest rounded-xl bg-[#fbfcfb] px-3.5 py-3 text-[13px] leading-[1.55] text-[#2c3531] font-medium whitespace-pre-wrap">
        {contenido}
      </div>
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => {
            setAccion("borrador");
            onGuardarBorrador();
          }}
          disabled={disabled || !!accion}
          className="text-[12.5px] font-bold text-[#3f4844] border border-ys-border rounded-[9px] px-3.5 py-2.5 cursor-pointer transition-colors hover:bg-[#f7f9f8] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {accion === "borrador" ? "Guardando..." : "Guardar borrador"}
        </button>
        <button
          onClick={() => {
            setAccion("meta");
            onEnviarAMeta();
          }}
          disabled={disabled || !!accion}
          className="text-[12.5px] font-extrabold text-white bg-ys-green rounded-[9px] px-3.5 py-2.5 cursor-pointer transition-all hover:bg-ys-green-hover hover:-translate-y-px disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {accion === "meta" ? "Enviando..." : "Enviar a Meta"}
        </button>
      </div>
    </div>
  );
}

// -------------------------------------------------------------------------
// Tarjeta: template_guardado
// Confirmación final — distingue visualmente borrador (gris) de enviado a
// Meta (verde, en revisión), en el mismo espíritu que audiencia_creada.
// -------------------------------------------------------------------------
interface TemplateGuardadoCardProps {
  nombre: string;
  resultado: "borrador" | "enviado";
  onVerTemplates: () => void;
}

export function TemplateGuardadoCard({
  nombre,
  resultado,
  onVerTemplates,
}: TemplateGuardadoCardProps) {
  const esEnviado = resultado === "enviado";
  return (
    <div className="bg-white border border-ys-border rounded-2xl px-5 py-[18px] flex items-center gap-3">
      <div className={`w-[38px] h-[38px] flex-none rounded-xl flex items-center justify-center ${esEnviado ? "bg-ys-green-bg" : "bg-ys-el2"}`}>
        {esEnviado ? (
          <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
            <path d="m3 8.4 4 4L14 3.6" stroke="#12B76A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
            <path d="m8 2 1.6 3.6L13 7l-3.4 1.4L8 12 6.4 8.4 3 7l3.4-1.4L8 2Z" stroke="#5d6560" strokeWidth="1.5" strokeLinejoin="round" />
          </svg>
        )}
      </div>
      <div className="flex-1 min-w-0 flex flex-col gap-0.5">
        <div className="text-[14.5px] font-extrabold text-ys-text truncate">{nombre}</div>
        <div className="text-xs text-ys-dim font-semibold">
          {esEnviado ? "Enviado a Meta · En revisión" : "Guardado como borrador"}
        </div>
      </div>
      <button
        onClick={onVerTemplates}
        className="flex-none text-[12.5px] font-bold text-ys-green-text cursor-pointer transition-colors hover:text-ys-green"
      >
        Ver templates →
      </button>
    </div>
  );
}

// -------------------------------------------------------------------------
// Tarjeta: elegir_audiencia_campana
// Chips de audiencias existentes, con conteo de contactos. No hay audiencia
// activa visualmente hasta que se confirma el click (elección única, no toggle).
// -------------------------------------------------------------------------
interface ElegirAudienciaCampanaCardProps {
  audiencias: { id: string; nombre: string; totalContactos: number }[];
  onElegir: (audienciaId: string) => void;
  disabled?: boolean;
}

export function ElegirAudienciaCampanaCard({
  audiencias,
  onElegir,
  disabled,
}: ElegirAudienciaCampanaCardProps) {
  const [elegido, setElegido] = useState<string | null>(null);

  return (
    <div className="bg-white border border-ys-border rounded-2xl px-4 py-3.5 flex flex-col gap-2">
      {audiencias.map((g) => {
        const active = elegido === g.id;
        return (
          <button
            key={g.id}
            onClick={() => {
              if (disabled || elegido) return;
              setElegido(g.id);
              onElegir(g.id);
            }}
            disabled={disabled || !!elegido}
            className={`border-[1.5px] rounded-[12px] px-3.5 py-2.5 flex items-center gap-3 cursor-pointer transition-all text-left disabled:cursor-not-allowed ${
              active ? "border-ys-green bg-ys-green-bg" : "border-ys-border hover:-translate-y-px disabled:hover:translate-y-0"
            }`}
          >
            <div className="w-[30px] h-[30px] flex-none rounded-[10px] bg-ys-green-bg flex items-center justify-center">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <circle cx="5.2" cy="6" r="2.2" stroke="#067647" strokeWidth="1.5" />
                <circle cx="10.8" cy="6" r="2.2" stroke="#067647" strokeWidth="1.5" />
                <path d="M1.8 13c0-1.9 1.5-3 3.4-3s3.4 1.1 3.4 3M7.4 13c0-1.9 1.5-3 3.4-3s3.4 1.1 3.4 3" stroke="#067647" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </div>
            <div className="flex-1 min-w-0 flex flex-col gap-0.5">
              <div className="text-[13px] font-bold text-ys-text truncate">{g.nombre}</div>
              <div className="text-[11.5px] text-ys-dim font-semibold">
                {g.totalContactos} contacto{g.totalContactos === 1 ? "" : "s"}
              </div>
            </div>
            {active && (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="7" fill="#12B76A" />
                <path d="m4.6 8.3 2.3 2.2L11.4 6" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </button>
        );
      })}
    </div>
  );
}

// -------------------------------------------------------------------------
// Tarjeta: elegir_template_campana
// Solo templates aprobados por Meta (filtrado antes de llegar acá).
// -------------------------------------------------------------------------
interface ElegirTemplateCampanaCardProps {
  templates: { id: string; nombre: string; contenido: string }[];
  onElegir: (templateId: string) => void;
  disabled?: boolean;
}

export function ElegirTemplateCampanaCard({
  templates,
  onElegir,
  disabled,
}: ElegirTemplateCampanaCardProps) {
  const [elegido, setElegido] = useState<string | null>(null);

  return (
    <div className="bg-white border border-ys-border rounded-2xl px-4 py-3.5 flex flex-col gap-2">
      {templates.map((t) => {
        const active = elegido === t.id;
        return (
          <button
            key={t.id}
            onClick={() => {
              if (disabled || elegido) return;
              setElegido(t.id);
              onElegir(t.id);
            }}
            disabled={disabled || !!elegido}
            className={`border-[1.5px] rounded-[12px] px-3.5 py-2.5 flex items-start gap-3 cursor-pointer transition-all text-left disabled:cursor-not-allowed ${
              active ? "border-ys-green bg-ys-green-bg" : "border-ys-border hover:-translate-y-px disabled:hover:translate-y-0"
            }`}
          >
            <div className="flex-1 min-w-0 flex flex-col gap-1">
              <div className="flex items-center gap-2 flex-wrap">
                <div className="font-mono text-[12.5px] text-ys-text">{t.nombre}</div>
                <span className="inline-flex items-center gap-1 text-[10.5px] font-bold text-ys-green-text bg-ys-green-bg rounded-full px-2 py-0.5">
                  <svg width="9" height="9" viewBox="0 0 16 16" fill="none">
                    <path d="m3 8.4 3.4 3L13 4.6" stroke="#067647" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  Aprobado
                </span>
              </div>
              <div className="text-[12px] text-ys-muted font-medium leading-[1.5] line-clamp-2">
                {t.contenido}
              </div>
            </div>
            {active && (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="flex-none">
                <circle cx="8" cy="8" r="7" fill="#12B76A" />
                <path d="m4.6 8.3 2.3 2.2L11.4 6" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </button>
        );
      })}
    </div>
  );
}

// -------------------------------------------------------------------------
// Tarjeta: elegir_momento_campana
// "Enviar ahora" vs. "Programar" — mismo patrón visual que el paso 3 del
// wizard manual, simplificado a dos opciones tipo chip.
// -------------------------------------------------------------------------
interface ElegirMomentoCampanaCardProps {
  onElegir: (momento: "ahora" | "programar") => void;
  disabled?: boolean;
}

export function ElegirMomentoCampanaCard({
  onElegir,
  disabled,
}: ElegirMomentoCampanaCardProps) {
  const [elegido, setElegido] = useState<"ahora" | "programar" | null>(null);

  const opciones: { key: "ahora" | "programar"; label: string; sub: string }[] = [
    { key: "ahora", label: "Enviar ahora", sub: "Empieza al confirmar" },
    { key: "programar", label: "Programar envío", sub: "Elegís fecha y hora" },
  ];

  return (
    <div className="bg-white border border-ys-border rounded-2xl px-4 py-3.5 flex flex-col gap-2">
      {opciones.map((o) => {
        const active = elegido === o.key;
        return (
          <button
            key={o.key}
            onClick={() => {
              if (disabled || elegido) return;
              setElegido(o.key);
              onElegir(o.key);
            }}
            disabled={disabled || !!elegido}
            className={`border-[1.5px] rounded-[12px] px-3.5 py-2.5 flex items-center gap-3 cursor-pointer transition-all text-left disabled:cursor-not-allowed ${
              active ? "border-ys-green bg-ys-green-bg" : "border-ys-border hover:-translate-y-px disabled:hover:translate-y-0"
            }`}
          >
            <div className="flex-1 flex flex-col gap-0.5">
              <div className="text-[13px] font-bold text-ys-text">{o.label}</div>
              <div className="text-[11.5px] text-ys-dim font-semibold">{o.sub}</div>
            </div>
            {active && (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="7" fill="#12B76A" />
                <path d="m4.6 8.3 2.3 2.2L11.4 6" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </button>
        );
      })}
    </div>
  );
}

// -------------------------------------------------------------------------
// Tarjeta: elegir_fecha_campana
// Input datetime-local + botón de confirmar, con mínimo = ahora (no se
// puede programar en el pasado).
// -------------------------------------------------------------------------
interface ElegirFechaCampanaCardProps {
  onConfirmar: (fechaIso: string) => void;
  disabled?: boolean;
}

function defaultFechaProgramadaChat(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(10, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function ElegirFechaCampanaCard({
  onConfirmar,
  disabled,
}: ElegirFechaCampanaCardProps) {
  const [fecha, setFecha] = useState(defaultFechaProgramadaChat());
  const [confirmado, setConfirmado] = useState(false);

  return (
    <div className="bg-white border border-ys-border rounded-2xl px-4 py-3.5 flex flex-col gap-3">
      <input
        type="datetime-local"
        value={fecha}
        min={new Date().toISOString().slice(0, 16)}
        disabled={confirmado || disabled}
        onChange={(e) => setFecha(e.target.value)}
        className="border border-ys-border rounded-[10px] px-3.5 py-[11px] text-[13.5px] font-semibold text-ys-text outline-none transition-colors focus:border-ys-green disabled:opacity-60"
      />
      <button
        onClick={() => {
          if (!fecha) return;
          setConfirmado(true);
          onConfirmar(new Date(fecha).toISOString());
        }}
        disabled={confirmado || disabled || !fecha}
        className="text-[12.5px] font-extrabold text-white bg-ys-green rounded-[9px] py-2.5 cursor-pointer transition-all hover:bg-ys-green-hover disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {confirmado ? "Confirmado" : "Confirmar fecha"}
      </button>
    </div>
  );
}

// -------------------------------------------------------------------------
// Tarjeta: confirmar_campana
// Resumen final con costo estimado — mismo espíritu que el paso "Revisar"
// del wizard manual, pero condensado a una sola tarjeta con un solo botón.
// -------------------------------------------------------------------------
interface ConfirmarCampanaCardProps {
  nombre: string;
  audienciaNombre: string;
  totalContactos: number;
  templateNombre: string;
  momento: "ahora" | "programar";
  fechaProgramada: string | null;
  costoUsd: number;
  onConfirmar: () => void;
  disabled?: boolean;
}

export function ConfirmarCampanaCard({
  nombre,
  audienciaNombre,
  totalContactos,
  templateNombre,
  momento,
  fechaProgramada,
  costoUsd,
  onConfirmar,
  disabled,
}: ConfirmarCampanaCardProps) {
  const [confirmado, setConfirmado] = useState(false);

  const fechaLabel =
    momento === "ahora"
      ? "Ahora"
      : fechaProgramada
        ? new Date(fechaProgramada).toLocaleString("es-AR", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })
        : "Sin definir";

  return (
    <div className="bg-white border border-ys-border rounded-2xl px-5 py-[18px] flex flex-col gap-3.5">
      <div className="text-[15px] font-extrabold text-ys-text">{nombre}</div>
      <div className="bg-[#fbfcfb] border border-ys-border-softest rounded-xl px-3.5 py-3 grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-0.5">
          <div className="text-[10.5px] font-extrabold tracking-[0.06em] uppercase text-ys-dimmer">Envío</div>
          <div className="text-[12.5px] font-bold text-ys-text">{fechaLabel}</div>
        </div>
        <div className="flex flex-col gap-0.5">
          <div className="text-[10.5px] font-extrabold tracking-[0.06em] uppercase text-ys-dimmer">Destinatarios</div>
          <div className="text-[12.5px] font-bold text-ys-text">{audienciaNombre}</div>
          <div className="font-mono text-[11px] text-ys-muted">{totalContactos} contactos</div>
        </div>
        <div className="flex flex-col gap-0.5 col-span-2">
          <div className="text-[10.5px] font-extrabold tracking-[0.06em] uppercase text-ys-dimmer">Mensaje</div>
          <div className="font-mono text-[12.5px] text-ys-text">{templateNombre}</div>
        </div>
      </div>
      <div className="flex items-center justify-between text-[12.5px] font-bold text-ys-text border-t border-ys-border-soft pt-2.5">
        <span className="font-semibold text-ys-muted">Costo estimado</span>
        <span className="font-mono">USD {costoUsd.toFixed(2)}</span>
      </div>
      <button
        onClick={() => {
          setConfirmado(true);
          onConfirmar();
        }}
        disabled={confirmado || disabled}
        className="text-[13px] font-bold text-white bg-ys-green rounded-[10px] py-2.5 cursor-pointer transition-all hover:bg-ys-green-hover disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {confirmado ? "Creando..." : "Crear campaña"}
      </button>
    </div>
  );
}

// -------------------------------------------------------------------------
// Tarjeta: campana_creada
// Confirmación final — distingue enviada ahora vs. programada.
// -------------------------------------------------------------------------
interface CampanaCreadaCardProps {
  nombre: string;
  momento: "ahora" | "programar";
  fechaProgramada: string | null;
  onVerCampana: () => void;
}

export function CampanaCreadaCard({
  nombre,
  momento,
  fechaProgramada,
  onVerCampana,
}: CampanaCreadaCardProps) {
  const esProgramada = momento === "programar";
  return (
    <div className="bg-white border border-ys-border rounded-2xl px-5 py-[18px] flex items-center gap-3">
      <div className="w-[38px] h-[38px] flex-none rounded-xl bg-ys-green-bg flex items-center justify-center">
        {esProgramada ? (
          <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
            <rect x="2.5" y="3.5" width="11" height="10" rx="2" stroke="#12B76A" strokeWidth="1.5" />
            <path d="M2.5 6.5h11M5.5 2v3M10.5 2v3" stroke="#12B76A" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
            <path d="m3 8.4 4 4L14 3.6" stroke="#12B76A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </div>
      <div className="flex-1 min-w-0 flex flex-col gap-0.5">
        <div className="text-[14.5px] font-extrabold text-ys-text truncate">{nombre}</div>
        <div className="text-xs text-ys-dim font-semibold">
          {esProgramada
            ? `Programada${fechaProgramada ? ` · ${new Date(fechaProgramada).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}` : ""}`
            : "Enviándose ahora"}
        </div>
      </div>
      <button
        onClick={onVerCampana}
        className="flex-none text-[12.5px] font-bold text-ys-green-text cursor-pointer transition-colors hover:text-ys-green"
      >
        Ver campaña →
      </button>
    </div>
  );
}

// -------------------------------------------------------------------------
// Tarjeta: confirmar_importar_contactos
// Resumen de la config (días/límite) antes de disparar syncAndAnalyzeAction
// — puede tardar bastante (varios segundos por contacto), por eso el botón
// muestra un estado "Importando..." explícito.
// -------------------------------------------------------------------------
interface ConfirmarImportarContactosCardProps {
  diasAnalisis: number;
  limiteContactos: number;
  onConfirmar: (diasAnalisis: number, limiteContactos: number) => void;
  disabled?: boolean;
}

const PRESETS_DIAS_CHAT = [
  { label: "7 días", value: 7 },
  { label: "30 días", value: 30 },
  { label: "90 días", value: 90 },
  { label: "Todo", value: 365 },
];

export function ConfirmarImportarContactosCard({
  diasAnalisis,
  limiteContactos,
  onConfirmar,
  disabled,
}: ConfirmarImportarContactosCardProps) {
  const [confirmado, setConfirmado] = useState(false);
  const [dias, setDias] = useState(diasAnalisis);
  const [limite, setLimite] = useState(limiteContactos);

  return (
    <div className="bg-white border border-ys-border rounded-2xl px-5 py-[18px] flex flex-col gap-3.5">
      <div className="flex flex-col gap-2">
        <div className="text-[11px] font-extrabold tracking-[0.06em] uppercase text-ys-dimmer">
          Rango de fechas
        </div>
        <div className="flex gap-[3px] bg-ys-el2 rounded-[10px] p-[3px]">
          {PRESETS_DIAS_CHAT.map((p) => (
            <button
              key={p.value}
              onClick={() => !confirmado && !disabled && setDias(p.value)}
              disabled={confirmado || disabled}
              className={`flex-1 text-center text-[12.5px] rounded-lg py-1.5 cursor-pointer transition-colors disabled:cursor-not-allowed ${
                dias === p.value
                  ? "font-bold text-ys-text bg-white shadow-[0_1px_2px_rgba(16,24,20,0.07)]"
                  : "font-semibold text-[#7b837e]"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-[7px]">
        <div className="text-[11px] font-extrabold tracking-[0.06em] uppercase text-ys-dimmer">
          Cantidad de contactos
        </div>
        <div className="flex items-center gap-2.5">
          <input
            type="number"
            min={1}
            max={500}
            value={limite}
            disabled={confirmado || disabled}
            onChange={(e) =>
              setLimite(Math.max(1, Math.min(500, parseInt(e.target.value, 10) || 1)))
            }
            className="w-[90px] flex-none border border-ys-border rounded-[10px] px-3 py-2 font-mono text-[13px] text-ys-text outline-none transition-colors focus:border-ys-green disabled:opacity-60"
          />
          <div className="min-w-0 text-[11.5px] text-ys-dim font-medium">
            Priorizamos los más recientes primero.
          </div>
        </div>
      </div>

      <button
        onClick={() => {
          setConfirmado(true);
          onConfirmar(dias, limite);
        }}
        disabled={confirmado || disabled}
        className="text-[13px] font-bold text-white bg-ys-green rounded-[10px] py-2.5 cursor-pointer transition-all hover:bg-ys-green-hover disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {confirmado ? "Importando..." : "Importar contactos"}
      </button>
    </div>
  );
}

// -------------------------------------------------------------------------
// Tarjeta: importacion_completada
// Resumen de resultados — mismo espíritu que StatBox en SyncConfigModal.
// -------------------------------------------------------------------------
interface ImportacionCompletadaCardProps {
  contactosAnalizados: number;
  leadsIdentificados: number;
  contactosProcesados: number;
}

export function ImportacionCompletadaCard({
  contactosAnalizados,
  leadsIdentificados,
  contactosProcesados,
}: ImportacionCompletadaCardProps) {
  return (
    <div className="bg-white border border-ys-border rounded-2xl px-4 py-3.5 grid grid-cols-3 gap-2.5">
      <div className="flex flex-col gap-0.5 rounded-xl border border-ys-border bg-[#fbfcfb] px-3 py-2.5">
        <div className="font-mono text-base font-medium text-ys-text">{contactosProcesados}</div>
        <div className="text-[10px] uppercase tracking-[0.03em] font-semibold text-ys-dim">Procesados</div>
      </div>
      <div className="flex flex-col gap-0.5 rounded-xl border border-ys-border bg-[#fbfcfb] px-3 py-2.5">
        <div className="font-mono text-base font-medium text-ys-text">{contactosAnalizados}</div>
        <div className="text-[10px] uppercase tracking-[0.03em] font-semibold text-ys-dim">Analizados</div>
      </div>
      <div className="flex flex-col gap-0.5 rounded-xl bg-ys-green px-3 py-2.5">
        <div className="font-mono text-base font-medium text-white">{leadsIdentificados}</div>
        <div className="text-[10px] uppercase tracking-[0.03em] font-semibold text-white/80">Con interés</div>
      </div>
    </div>
  );
}

// -------------------------------------------------------------------------
// Tarjeta: resultados_busqueda_contactos
// Lista de contactos encontrados por búsqueda de texto completo, con
// cantidad de menciones y el fragmento que hizo match (viene con **bold**
// desde ts_headline de Postgres — lo parseamos a <mark> acá). Selección
// múltiple con checkboxes (todos preseleccionados por default) + botón
// para crear audiencia con los elegidos, reusando el flujo de crear_audiencia.
// -------------------------------------------------------------------------
interface ResultadoBusquedaContacto {
  contactoId: string | null;
  nombre: string;
  telefono: string;
  menciones: number;
  fragmento: string;
}

function renderFragmentoConResaltado(fragmento: string) {
  const partes = fragmento.split(/(\*\*[^*]+\*\*)/g);
  return partes.map((parte, i) => {
    if (parte.startsWith("**") && parte.endsWith("**")) {
      return (
        <mark key={i} className="bg-ys-green-bg text-ys-green-text rounded-[3px] px-0.5 font-bold not-italic">
          {parte.slice(2, -2)}
        </mark>
      );
    }
    return <span key={i}>{parte}</span>;
  });
}

interface ResultadosBusquedaContactosCardProps {
  consulta: string;
  resultados: ResultadoBusquedaContacto[];
  onCrearGrupo: (contactosIds: string[]) => void;
  disabled?: boolean;
}

export function ResultadosBusquedaContactosCard({
  resultados,
  onCrearGrupo,
  disabled,
}: ResultadosBusquedaContactosCardProps) {
  // Solo los que tienen contactoId resuelto se pueden agrupar (los que no
  // matchean con yamas_send_contactos quedan visibles pero no seleccionables
  // para la audiencia, ya que saveListAction necesita el id real del contacto).
  const seleccionables = resultados.filter((r) => r.contactoId);
  const [selected, setSelected] = useState<Set<string>>(
    new Set(seleccionables.map((r) => r.contactoId as string)),
  );
  const [confirmado, setConfirmado] = useState(false);

  function toggle(id: string) {
    if (confirmado || disabled) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="bg-white border border-ys-border rounded-2xl overflow-hidden flex flex-col">
      <div className="max-h-[320px] overflow-y-auto flex flex-col">
        {resultados.map((r) => {
          const active = r.contactoId ? selected.has(r.contactoId) : false;
          const seleccionable = !!r.contactoId;
          return (
            <button
              key={r.telefono}
              onClick={() => r.contactoId && toggle(r.contactoId)}
              disabled={confirmado || disabled || !seleccionable}
              className="w-full flex items-start gap-3 px-4 py-3 border-b border-ys-border-softest last:border-b-0 text-left transition-colors hover:bg-[#f7fbf9] disabled:hover:bg-transparent disabled:cursor-default"
            >
              {seleccionable && (
                <div className="w-[18px] h-[18px] flex-none rounded-[6px] border-[1.5px] border-ys-border bg-white flex items-center justify-center mt-0.5">
                  {active && (
                    <div className="w-[18px] h-[18px] -m-[1.5px] rounded-[6px] bg-ys-green flex items-center justify-center">
                      <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
                        <path d="m3 8.4 3.4 3L13 4.6" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </div>
                  )}
                </div>
              )}
              <div className="flex-1 min-w-0 flex flex-col gap-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="text-[13.5px] font-bold text-ys-text truncate">{r.nombre}</div>
                  <div className="font-mono text-[11.5px] text-ys-dim">{r.telefono}</div>
                  <div className="text-[10.5px] font-bold text-ys-green-text bg-ys-green-bg rounded-full px-2 py-0.5">
                    {r.menciones} menci{r.menciones === 1 ? "ón" : "ones"}
                  </div>
                </div>
                <div className="text-[12.5px] text-ys-muted font-medium leading-[1.5] italic">
                  &ldquo;{renderFragmentoConResaltado(r.fragmento)}&rdquo;
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {seleccionables.length > 0 && (
        <div className="px-4 py-3 border-t border-ys-border-softest">
          <button
            onClick={() => {
              setConfirmado(true);
              onCrearGrupo(Array.from(selected));
            }}
            disabled={confirmado || disabled || selected.size === 0}
            className="w-full text-[13px] font-bold text-white bg-ys-green rounded-[10px] py-2.5 cursor-pointer transition-all hover:bg-ys-green-hover disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {confirmado
              ? "Creando audiencia..."
              : `Crear audiencia con ${selected.size} contacto${selected.size === 1 ? "" : "s"}`}
          </button>
        </div>
      )}
    </div>
  );
}
