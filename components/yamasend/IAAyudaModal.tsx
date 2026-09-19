"use client";

import { useState } from "react";

/**
 * Guía de uso del asistente de IA.
 *
 * Vive dentro del panel (no es un PDF suelto) por dos razones: se lee bien
 * en celular y usa los mismos tokens visuales que el resto del producto.
 *
 * "Descargar en PDF" genera un documento PDF real e independiente (ver
 * IAAyudaPdfDocument.tsx, con @react-pdf/renderer) — no es window.print():
 * no depende del layout de la página, del viewport ni de qué accordion esté
 * abierto acá en pantalla, y no arrastra el chrome de la app (sidebar, URL,
 * fecha del navegador). El modal y el PDF comparten la misma fuente de
 * contenido (TEMAS, más abajo), así que nunca pueden divergir.
 */

export interface Ejemplo {
  texto: string;
  nota?: string;
}

export interface Tema {
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

/**
 * Misma paleta que COLORES, en hex plano — la usa el generador de PDF
 * (components/yamasend/IAAyudaPdfDocument.tsx), que no puede consumir clases
 * de Tailwind. Mantener sincronizado si se toca COLORES.
 */
export const PDF_COLOR_HEX: Record<
  Tema["color"],
  { chip: string; texto: string; borde: string }
> = {
  verde: { chip: "#ecf9f2", texto: "#067647", borde: "#a9e3c7" },
  azul: { chip: "#eaf2fd", texto: "#1a5fb4", borde: "#b3cdf2" },
  ambar: { chip: "#fdf5e6", texto: "#8a5a00", borde: "#eccf94" },
  violeta: { chip: "#f2eefc", texto: "#5b3fa8", borde: "#cbbcee" },
  rosa: { chip: "#fdeef3", texto: "#a8336a", borde: "#eebccf" },
};

export const TEMAS: Tema[] = [
  {
    id: "oportunidades",
    titulo: "Oportunidades",
    resumen: "Encontrá clientes que están en un buen momento para volver a contactar.",
    color: "verde",
    icono: (
      <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
        <path
          d="m8 2 1.6 3.6L13 7l-3.4 1.4L8 12 6.4 8.4 3 7l3.4-1.4L8 2Z"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
      </svg>
    ),
    ejemplos: [
      { texto: "¿A quién me conviene contactar hoy?" },
      { texto: "¿Qué oportunidades importantes detectaste?" },
      { texto: "Mostrame clientes con intención de compra" },
      {
        texto: "¿Por qué recomendás contactar a estas personas?",
        nota: "El asistente te muestra la frase textual que escribió cada contacto, como evidencia",
      },
    ],
    tip: "Cuando el asistente te recomienda a alguien, siempre te muestra qué dijo esa persona en la conversación real — nunca es una corazonada.",
  },
  {
    id: "momento",
    titulo: "Momento ideal",
    resumen: "Descubrí cuándo conviene volver a hablar con cada cliente.",
    color: "azul",
    icono: (
      <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.5" />
        <path d="M8 4.8v3.4l2.3 1.3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    ejemplos: [
      { texto: "¿A quién debería contactar esta semana?" },
      { texto: "¿Qué clientes están esperando que los contacte más adelante?" },
      { texto: "¿Cuándo debería volver a escribirle a este cliente?" },
      { texto: "Mostrame oportunidades cuyo momento de contacto ya llegó" },
    ],
    tip: "El momento lo calcula el asistente según cuándo escribió cada contacto y qué tan urgente parece su interés.",
  },
  {
    id: "ofrecer",
    titulo: "Qué ofrecer",
    resumen: "Usá lo que dijeron tus clientes para entender qué puede interesarles.",
    color: "ambar",
    icono: (
      <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
        <path
          d="M2 2.5h5.2L14 9.3a1.3 1.3 0 0 1 0 1.9l-2.8 2.8a1.3 1.3 0 0 1-1.9 0L2.5 7.2V2z"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
        <circle cx="5" cy="5" r="1" fill="currentColor" />
      </svg>
    ),
    ejemplos: [
      { texto: "¿Qué producto le interesa a este cliente?" },
      { texto: "¿Quién está buscando zapatillas?" },
      { texto: "¿Qué le ofrecerías a este contacto?" },
      { texto: "Agrupame clientes según lo que están buscando" },
    ],
    tip: "Funciona mejor cuanto más claro tengas cargado tu catálogo. Si el asistente todavía no lo tiene, te lo va a decir en vez de inventar una respuesta.",
  },
  {
    id: "audiencias",
    titulo: "Audiencias inteligentes",
    resumen: "Convertí oportunidades en grupos de clientes listos para trabajar.",
    color: "violeta",
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
      { texto: "Creá una audiencia con clientes interesados en zapatillas" },
      { texto: "Agrupá los clientes que conviene contactar hoy" },
      {
        texto: "Armame una audiencia con esas oportunidades",
        nota: "Después de una búsqueda o recomendación, toma los resultados que acabás de ver",
      },
      { texto: "Renombrá la audiencia" },
      { texto: "¿Cuántas audiencias tengo?" },
    ],
    tip: "Podés partir de una búsqueda o de una oportunidad detectada: el asistente arma la audiencia con esos contactos, sin que tengas que volver a explicarlos.",
  },
  {
    id: "campanas",
    titulo: "Mensajes y campañas",
    resumen: "Pasá de una oportunidad a una campaña conversando con la IA.",
    color: "rosa",
    icono: (
      <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
        <path d="M2 8l12-5-4.5 12L7.5 9.5 2 8z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
    ),
    ejemplos: [
      { texto: "Preparame una campaña para estas personas" },
      { texto: "¿Qué mensaje mandarías?" },
      {
        texto: "Prepará la campaña, pero no envíes nada todavía",
        nota: "Nada se crea ni se envía sin que lo confirmes antes",
      },
      { texto: "Programá la campaña para el viernes" },
      { texto: "Cambiale el template a la campaña" },
    ],
    tip: "El template, la audiencia y la fecha se pueden cambiar mientras la campaña esté en borrador o programada. Si ya se envió, conviene duplicarla y editar la copia.",
  },
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
  const [abierto, setAbierto] = useState<string | null>("oportunidades");
  const [generandoPdf, setGenerandoPdf] = useState(false);
  const [errorPdf, setErrorPdf] = useState(false);

  /**
   * Genera el PDF real (ver IAAyudaPdfDocument.tsx) y lo descarga directo,
   * sin pasar por el diálogo de impresión del navegador. La librería se
   * importa de forma dinámica para no sumar peso al bundle del modal en
   * cada carga de la sección IA — solo se descarga cuando alguien realmente
   * pide el PDF.
   */
  async function handleDescargarPdf() {
    if (generandoPdf) return;
    setGenerandoPdf(true);
    setErrorPdf(false);
    try {
      const [{ pdf }, { default: IAAyudaPdfDocument }] = await Promise.all([
        import("@react-pdf/renderer"),
        import("./IAAyudaPdfDocument"),
      ]);
      const blob = await pdf(<IAAyudaPdfDocument />).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "YamaSend-IA-Guia.pdf";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("[IAAyudaModal] No se pudo generar el PDF", err);
      setErrorPdf(true);
    } finally {
      setGenerandoPdf(false);
    }
  }

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
            className="flex-none w-8 h-8 rounded-lg flex items-center justify-center text-ys-dim hover:bg-ys-el2 hover:text-ys-text transition-colors cursor-pointer"
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
                    className={`flex-none text-ys-dim transition-transform ${
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

                <div className={expandido ? "block" : "hidden"}>
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
                          <span className="ml-auto flex-none text-[11px] font-semibold text-ys-dim opacity-0 group-hover:opacity-100 transition-opacity">
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
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-ys-border bg-white">
          <div className="flex flex-col gap-1">
            <button
              type="button"
              onClick={handleDescargarPdf}
              disabled={generandoPdf}
              className="text-[12.5px] font-semibold text-ys-muted hover:text-ys-text transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-wait text-left"
            >
              {generandoPdf ? "Generando PDF..." : "Descargar en PDF"}
            </button>
            {errorPdf && (
              <span className="text-[11px] font-medium text-red-600">
                No se pudo generar el PDF. Probá de nuevo.
              </span>
            )}
          </div>
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
