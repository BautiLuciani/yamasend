"use client";

import { useEffect, useMemo, useState } from "react";
import type { Template } from "@/lib/types";
import {
  ActionBar,
  BarBtn,
  BtnPrimary,
  CheckBox,
  SearchBox,
  SectionBody,
  SectionHeader,
  SectionPage,
  Segmented,
  SelectionBar,
  pluralizar,
  type StatusTone,
} from "./SectionChrome";

interface TemplatesProps {
  templates: Template[];
  onNewTemplate: () => void;
  onOpenTemplate: (tpl: Template) => void;
  /** Arma un template nuevo con el mismo texto (para variar uno que anduvo bien). */
  onDuplicate: (tpl: Template) => void;
  /** Borra borradores (los ya enviados a Meta no se borran desde acá). */
  onDeleteDrafts: (ids: string[]) => Promise<void>;
  /**
   * false NO esconde el botón: lo deja visible y bloqueado. Esconderlo hacía
   * que el permiso revocado fuera invisible —la sección simplemente perdía el
   * botón sin explicación—. Ahora se ve, y al tocarlo avisa quién puede
   * habilitarlo. El gate real sigue estando en el server action.
   */
  puedeCrear?: boolean;
  /** Se dispara al tocar el botón sin permiso. Muestra el aviso. */
  onSinPermiso?: () => void;
}

const CATEGORIA_LABEL: Record<string, string> = {
  marketing: "Marketing",
  utility: "Utilidad",
  authentication: "Autenticación",
  service: "Servicio",
};

function StatusBadge({ status }: { status: Template["status"] }) {
  if (status === "verificado")
    return (
      <span className="inline-flex items-center gap-1.5 flex-none text-xs font-extrabold text-ys-green-text bg-[#d3f2e3] rounded-full px-[11px] py-1">
        Aprobado
      </span>
    );
  if (status === "enviado")
    return (
      <span className="inline-flex items-center gap-1.5 flex-none text-xs font-extrabold text-ys-warn-text bg-ys-warn-bg rounded-full px-[11px] py-1">
        En revisión
      </span>
    );
  if (status === "borrador")
    return (
      <span className="inline-flex items-center gap-1.5 flex-none text-xs font-extrabold text-ys-muted bg-ys-el2 rounded-full px-[11px] py-1">
        Borrador
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1.5 flex-none text-xs font-extrabold text-ys-red-text bg-ys-red-bg rounded-full px-[11px] py-1">
      {status === "error" ? "Error" : "Rechazado"}
    </span>
  );
}

type Filtro = "todos" | "verificado" | "enviado" | "rechazado" | "borrador";

const GRID = "md:grid-cols-[44px_minmax(0,1.1fr)_minmax(0,1.6fr)_130px_130px]";

export default function Templates({
  templates,
  onNewTemplate,
  onOpenTemplate,
  onDuplicate,
  onDeleteDrafts,
  puedeCrear = true,
  onSinPermiso,
}: TemplatesProps) {
  const [query, setQuery] = useState("");
  const [estado, setEstado] = useState<Filtro>("todos");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [borrando, setBorrando] = useState(false);

  const counts = useMemo(
    () => ({
      aprobados: templates.filter((t) => t.status === "verificado").length,
      revision: templates.filter((t) => t.status === "enviado").length,
      rechazados: templates.filter((t) => t.status === "rechazado" || t.status === "error").length,
    }),
    [templates],
  );

  const filtered = templates.filter((t) => {
    if (estado !== "todos") {
      const ok = estado === "rechazado" ? t.status === "rechazado" || t.status === "error" : t.status === estado;
      if (!ok) return false;
    }
    if (query && !t.nombre.toLowerCase().includes(query.toLowerCase())) return false;
    return true;
  });

  // Escape sale de la selección (no hay botón "Deseleccionar").
  useEffect(() => {
    if (sel.size === 0) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSel(new Set());
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sel.size]);

  // Lo que ya no existe o quedó filtrado afuera sale de la selección.
  const visibles = new Set(filtered.map((t) => t.id));
  const seleccionados = filtered.filter((t) => sel.has(t.id));
  const todosMarcados = filtered.length > 0 && seleccionados.length === filtered.length;

  function toggle(id: string) {
    setSel((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleTodos() {
    setSel(todosMarcados ? new Set() : new Set(filtered.map((t) => t.id)));
  }

  const soloBorradores = seleccionados.length > 0 && seleccionados.every((t) => t.status === "borrador" && !t.esDeEmpresa);
  const unico = seleccionados.length === 1 ? seleccionados[0] : null;

  const tone: StatusTone = counts.rechazados > 0 ? "warn" : counts.aprobados > 0 ? "ok" : "neutral";
  const valor =
    templates.length === 0
      ? "Sin templates"
      : [
          `${counts.aprobados} aprobado${counts.aprobados === 1 ? "" : "s"}`,
          counts.revision > 0 ? `${counts.revision} en revisión` : null,
          counts.rechazados > 0 ? `${counts.rechazados} rechazado${counts.rechazados === 1 ? "" : "s"}` : null,
        ]
          .filter(Boolean)
          .join(" · ");

  async function borrar() {
    setBorrando(true);
    await onDeleteDrafts(seleccionados.map((t) => t.id));
    setBorrando(false);
    setSel(new Set());
  }

  return (
    <SectionPage>
      <SectionHeader
        title="Templates"
        subtitle="Creá y administrá tus mensajes de WhatsApp."
        status={{
          icon: (
            <svg width="20" height="20" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <rect x="2.5" y="2.5" width="11" height="11" rx="2" stroke="currentColor" strokeWidth="1.5" />
              <path d="M2.5 6h11M6 6v7.5" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          ),
          label: "Estado en Meta",
          value: valor,
          tone,
        }}
      />

      <ActionBar>
        <BtnPrimary onClick={puedeCrear ? onNewTemplate : onSinPermiso} bloqueado={!puedeCrear}>
          Nuevo template
        </BtnPrimary>
        {templates.length > 0 && (
          <>
            <SearchBox value={query} onChange={setQuery} placeholder="Buscar template..." />
            <Segmented<Filtro>
              value={estado}
              onChange={setEstado}
              options={[
                { key: "todos", label: "Todos" },
                { key: "verificado", label: "Aprobados" },
                { key: "enviado", label: "En revisión" },
                { key: "rechazado", label: "Rechazados" },
                { key: "borrador", label: "Borradores" },
              ]}
            />
          </>
        )}
      </ActionBar>

      <SectionBody>
        {templates.length === 0 && (
          <div className="bg-ys-card border border-ys-border rounded-2xl py-16 px-6 flex flex-col items-center gap-3.5">
            <div className="text-[19px] font-extrabold tracking-[-0.02em] text-ys-text">Creá tu primer template</div>
            <div className="text-sm text-ys-muted font-medium text-center max-w-[420px]">
              Los templates son los mensajes que vas a utilizar para comunicarte con tus contactos.
            </div>
          </div>
        )}

        {templates.length > 0 && filtered.length === 0 && (
          <div className="bg-ys-card border border-ys-border rounded-2xl py-[52px] px-6 flex flex-col items-center gap-2.5">
            <div className="text-base font-extrabold text-ys-text">Sin resultados</div>
            <div className="text-[13.5px] text-ys-muted font-medium">Probá con otro nombre o cambiá los filtros.</div>
          </div>
        )}

        {filtered.length > 0 && (
          <div className="bg-ys-card border border-ys-border rounded-2xl overflow-hidden">
            <div
              className={`hidden md:grid ${GRID} items-center px-5 py-3 border-b border-ys-border text-[11px] font-extrabold tracking-[0.06em] uppercase text-ys-muted`}
            >
              <CheckBox
                checked={todosMarcados}
                indeterminate={!todosMarcados && seleccionados.length > 0}
                onChange={toggleTodos}
                label="Seleccionar todos los templates"
              />
              <span>Nombre</span>
              <span>Mensaje</span>
              <span>Categoría</span>
              <span>Estado</span>
            </div>
            {filtered.map((t, i) => {
              const marcado = sel.has(t.id) && visibles.has(t.id);
              return (
                <div
                  key={t.id}
                  onClick={() => onOpenTemplate(t)}
                  className={`grid grid-cols-[28px_minmax(0,1fr)_auto] ${GRID} items-center gap-x-3 gap-y-1 px-4 md:px-5 py-3.5 cursor-pointer transition-colors ${
                    i > 0 ? "border-t border-ys-border-softer" : ""
                  } ${marcado ? "bg-ys-green-bg" : t.esDeEmpresa ? "bg-[#faf8ff] hover:bg-[#f5f1ff]" : "hover:bg-[#fbfcfb]"}`}
                >
                  <CheckBox checked={marcado} onChange={() => toggle(t.id)} label={`Seleccionar ${t.nombre}`} />
                  <div className="min-w-0 flex flex-col gap-0.5">
                    <span className="font-mono text-sm font-medium text-ys-text truncate">{t.nombre}</span>
                    {t.esDeEmpresa && <span className="text-[11.5px] font-bold text-[#5b3fa8]">De tu empresa</span>}
                  </div>
                  <span className="md:hidden">
                    <StatusBadge status={t.status} />
                  </span>
                  <span className="hidden md:block text-[13px] font-medium text-ys-muted truncate">{t.contenido}</span>
                  <span className="hidden md:block text-[13.5px] font-semibold text-ys-muted">
                    {CATEGORIA_LABEL[t.tipo ?? "marketing"] ?? "Marketing"}
                  </span>
                  <span className="hidden md:block">
                    <StatusBadge status={t.status} />
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </SectionBody>

      {seleccionados.length > 0 && (
        <SelectionBar texto={pluralizar(seleccionados.length, "template", "templates")}>
          {!unico && !(soloBorradores && puedeCrear) && (
            <span className="text-[13px] font-semibold text-[#9aa9a3] pr-3 whitespace-nowrap">
              Elegí uno solo para ver o duplicar
            </span>
          )}
          {unico && <BarBtn onClick={() => onOpenTemplate(unico)}>Ver detalle</BarBtn>}
          {unico && puedeCrear && <BarBtn onClick={() => onDuplicate(unico)}>Duplicar</BarBtn>}
          {soloBorradores && puedeCrear && (
            <BarBtn variante="danger" onClick={borrar} disabled={borrando}>
              {borrando ? "Eliminando…" : "Eliminar"}
            </BarBtn>
          )}
        </SelectionBar>
      )}
    </SectionPage>
  );
}
