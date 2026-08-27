"use client";

import { useState } from "react";

/**
 * Guía de uso del asistente de IA.
 *
 * Vive dentro del panel (no es un PDF suelto) por tres razones: se lee bien
 * en celular, usa los mismos tokens visuales que el resto del producto, y se
 * actualiza con un deploy en vez de tener que regenerar y volver a subir un
 * archivo cada vez que el asistente aprende algo nuevo.
 *
 * El botón "Descargar" usa window.print(), que en cualquier navegador ofrece
 * "Guardar como PDF": quien quiera el PDF lo tiene, sin mantener dos formatos.
 */

interface Ejemplo {
  texto: string;
  nota?: string;
}

interface Tema {
  id: string;
  titulo: string;
  resumen: string;
  color: "verde" | "azul" | "ambar" | "violeta" | "rosa";
  icono: React.ReactNode;
  ejemplos: Ejemplo[];
  tip?: string;
}

const COLORES: Record<
  Tema["color"],
  { chip: string; icono: string; borde: string; texto: string }
> = {
  verde: {
    chip: "bg-[#ecf9f2]",
    icono: "text-[#067647]",
    borde: "border-[#a9e3c7]",
    texto: "text-[#067647]",
  },
  azul: {
    chip: "bg-[#eaf2fd]",
    icono: "text-[#1a5fb4]",
    borde: "border-[#b3cdf2]",
    texto: "text-[#1a5fb4]",
  },
  ambar: {
    chip: "bg-[#fdf5e6]",
    icono: "text-[#8a5a00]",
    borde: "border-[#eccf94]",
    texto: "text-[#8a5a00]",
  },
  violeta: {
    chip: "bg-[#f2eefc]",
    icono: "text-[#5b3fa8]",
    borde: "border-[#cbbcee]",
    texto: "text-[#5b3fa8]",
  },
  rosa: {
    chip: "bg-[#fdeef3]",
    icono: "text-[#a8336a]",
    borde: "border-[#eebccf]",
    texto: "text-[#a8336a]",
  },
};

const TEMAS: Tema[] = [
  {
    id: "contactos",
    titulo: "Contactos",
    resumen: "Traé tus conversaciones de WhatsApp y encontrá gente por lo que dijo.",
    color: "verde",
    icono: (
      <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
        <circle cx="6" cy="5.5" r="2.5" stroke="currentColor" strokeWidth="1.5" />
        <path
          d="M2 13.5c0-2.2 1.8-3.5 4-3.5s4 1.3 4 3.5"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <path
          d="M11 4.2a2.5 2.5 0 0 1 0 4.6M12.5 13.5c0-1.5-.5-2.6-1.4-3.2"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    ),
    ejemplos: [
      { texto: "Importá mis contactos de WhatsApp" },
      { texto: "Mostrame los contactos calientes" },
      {
        texto: "¿Quiénes preguntaron por precios?",
        nota: "Busca dentro de las conversaciones reales, no solo en los nombres",
      },
      { texto: "Buscá contactos que hablaron de una entrega demorada" },
      { texto: "Cambiale la temperatura a Marcos" },
    ],
    tip: "Cuando la respuesta viene de algo que la persona realmente escribió, el asistente te muestra la frase textual como evidencia.",
  },
  {
    id: "audiencias",
    titulo: "Audiencias",
    resumen: "Agrupá contactos para enviarles una campaña.",
    color: "azul",
    icono: (
      <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
        <circle cx="5.2" cy="6" r="2.2" stroke="currentColor" strokeWidth="1.5" />
        <circle cx="10.8" cy="6" r="2.2" stroke="currentColor" strokeWidth="1.5" />
        <path
          d="M1.8 13c0-1.9 1.5-3 3.4-3s3.4 1.1 3.4 3M7.4 13c0-1.9 1.5-3 3.4-3s3.4 1.1 3.4 3"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    ),
    ejemplos: [
      { texto: "Creá una audiencia" },
      { texto: "Armá una audiencia con los contactos calientes" },
      {
        texto: "Armá una audiencia con esos",
        nota: "Después de una búsqueda, toma los resultados que acabás de ver",
      },
      { texto: "Renombrá la audiencia" },
      { texto: "¿Cuántas audiencias tengo?" },
    ],
    tip: "Podés encadenar: primero buscá los contactos que te interesan y después pedí la audiencia con esos resultados.",
  },
  {
    id: "templates",
    titulo: "Templates",
    resumen: "Creá los mensajes que Meta tiene que aprobar antes de enviarlos.",
    color: "ambar",
    icono: (
      <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
        <rect
          x="2.5"
          y="2.5"
          width="11"
          height="11"
          rx="2"
          stroke="currentColor"
          strokeWidth="1.5"
        />
        <path d="M2.5 6h11M6 6v7.5" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    ),
    ejemplos: [
      { texto: "Quiero armar un template nuevo" },
      {
        texto: "Creá un template para avisar de una promoción",
        nota: "Te propone el texto y podés pedir otra versión",
      },
      { texto: "¿Qué templates tengo aprobados?" },
      { texto: "Mostrame el estado de mis templates" },
    ],
    tip: "Un template recién creado queda «enviado» hasta que Meta lo aprueba. Solo los aprobados se pueden usar en una campaña.",
  },
  {
    id: "campanas",
    titulo: "Campañas",
    resumen: "Enviá un template a una audiencia, ahora o programado.",
    color: "violeta",
    icono: (
      <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
        <path
          d="M2 8l12-5-4.5 12L7.5 9.5 2 8z"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
      </svg>
    ),
    ejemplos: [
      { texto: "Quiero mandar una campaña" },
      { texto: "Programá una campaña para el viernes" },
      { texto: "Cambiá el template de la campaña" },
      { texto: "Cambiale la audiencia a la campaña de agosto" },
      { texto: "Reprogramá la campaña" },
      { texto: "Cambiale el nombre a la campaña" },
    ],
    tip: "El template, la audiencia y la fecha solo se pueden cambiar mientras la campaña esté en borrador o programada. Si ya se envió, conviene duplicarla y editar la copia.",
  },
  {
    id: "metricas",
    titulo: "Métricas",
    resumen: "Preguntá cómo vienen tus envíos, sin abrir reportes.",
    color: "rosa",
    icono: (
      <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
        <path
          d="M2.5 13.5V9M6.5 13.5V4M10.5 13.5V7M14 13.5v-3"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    ),
    ejemplos: [
      { texto: "¿Cuántas campañas tengo?" },
      { texto: "¿Cuál fue la campaña que mejor me rindió?" },
      { texto: "¿Cuál es el mejor horario para enviar?" },
      { texto: "¿Cómo vengo este mes?" },
    ],
    tip: "Cuando la respuesta tiene varios datos, el asistente te la muestra como tabla además del texto.",
  },
];

interface IAAyudaModalProps {
  open: boolean;
  onClose: () => void;
  /** Manda el ejemplo al chat como si el usuario lo hubiera escrito. */
  onProbarEjemplo: (texto: string) => void;
}

export default function IAAyudaModal({ open, onClose, onProbarEjemplo }: IAAyudaModalProps) {
  const [abierto, setAbierto] = useState<string | null>("contactos");

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-6"
      onClick={onClose}
    >
      <div
        className="bg-ys-bg w-full sm:max-w-2xl max-h-[92vh] sm:max-h-[85vh] rounded-t-2xl sm:rounded-2xl overflow-hidden flex flex-col shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Encabezado */}
        <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-ys-border bg-white">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-ys-text">Qué le podés pedir al asistente</h2>
            <p className="text-[12.5px] text-ys-muted mt-0.5">
              Escribile como le hablarías a una persona. Tocá cualquier ejemplo para probarlo.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="flex-none w-8 h-8 rounded-lg flex items-center justify-center text-ys-dim hover:bg-ys-el2 hover:text-ys-text transition-colors cursor-pointer print:hidden"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path
                d="M4 4l8 8M12 4l-8 8"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        {/* Contenido */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {TEMAS.map((tema) => {
            const c = COLORES[tema.color];
            const expandido = abierto === tema.id;
            return (
              <section
                key={tema.id}
                className={`bg-white border rounded-2xl overflow-hidden transition-colors ${
                  expandido ? c.borde : "border-ys-border"
                }`}
              >
                <button
                  type="button"
                  onClick={() => setAbierto(expandido ? null : tema.id)}
                  className="w-full flex items-center gap-3 px-4 py-3.5 text-left cursor-pointer hover:bg-ys-el2 transition-colors"
                >
                  <span
                    className={`flex-none w-9 h-9 rounded-xl flex items-center justify-center ${c.chip} ${c.icono}`}
                  >
                    {tema.icono}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-bold text-ys-text">{tema.titulo}</span>
                    <span className="block text-[12.5px] text-ys-muted leading-snug">
                      {tema.resumen}
                    </span>
                  </span>
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 16 16"
                    fill="none"
                    className={`flex-none text-ys-dim transition-transform print:hidden ${
                      expandido ? "rotate-180" : ""
                    }`}
                  >
                    <path
                      d="M4 6l4 4 4-4"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>

                <div className={expandido ? "block" : "hidden print:block"}>
                  <div className="px-4 pb-4 pt-1 space-y-2">
                    {tema.ejemplos.map((ej) => (
                      <button
                        key={ej.texto}
                        type="button"
                        onClick={() => onProbarEjemplo(ej.texto)}
                        className="w-full text-left bg-ys-el2 border border-ys-border-softest rounded-xl px-3.5 py-2.5 cursor-pointer hover:bg-white hover:border-ys-border2 transition-colors group"
                      >
                        <span className="flex items-center gap-2">
                          <span className="text-[13px] font-medium text-ys-text">
                            &ldquo;{ej.texto}&rdquo;
                          </span>
                          <span className="ml-auto flex-none text-[11px] font-semibold text-ys-dim opacity-0 group-hover:opacity-100 transition-opacity print:hidden">
                            Probar →
                          </span>
                        </span>
                        {ej.nota && (
                          <span className="block text-[11.5px] text-ys-dim mt-1 leading-snug">
                            {ej.nota}
                          </span>
                        )}
                      </button>
                    ))}

                    {tema.tip && (
                      <div className={`rounded-xl px-3.5 py-2.5 ${c.chip}`}>
                        <p className={`text-[11.5px] leading-relaxed ${c.texto}`}>
                          <span className="font-bold">Tené en cuenta: </span>
                          {tema.tip}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </section>
            );
          })}

          <div className="bg-white border border-ys-border rounded-2xl px-4 py-3.5">
            <h3 className="text-sm font-bold text-ys-text mb-1.5">Si algo sale distinto</h3>
            <p className="text-[12.5px] text-ys-muted leading-relaxed">
              Podés corregir sobre la marcha sin empezar de nuevo: mientras armás algo, escribí el
              cambio (&ldquo;mejor llamala Promo Agosto&rdquo;) y el asistente lo toma. Si te
              arrepentís, alcanza con decir &ldquo;dejalo&rdquo; o &ldquo;cancelá&rdquo;. Nada se
              crea ni se envía sin que lo confirmes antes.
            </p>
          </div>
        </div>

        {/* Pie */}
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-ys-border bg-white print:hidden">
          <button
            type="button"
            onClick={() => window.print()}
            className="text-[12.5px] font-semibold text-ys-muted hover:text-ys-text transition-colors cursor-pointer"
          >
            Descargar en PDF
          </button>
          <button
            type="button"
            onClick={onClose}
            className="bg-ys-green hover:bg-ys-green-hover text-white text-[13px] font-semibold rounded-xl px-4 py-2 transition-colors cursor-pointer"
          >
            Entendido
          </button>
        </div>
      </div>
    </div>
  );
}
