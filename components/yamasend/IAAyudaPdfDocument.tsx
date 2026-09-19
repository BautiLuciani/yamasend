import { Document, Page, Text, View, Image, Font, StyleSheet } from "@react-pdf/renderer";
import { TEMAS, PDF_COLOR_HEX, type Tema } from "./IAAyudaModal";

// El motor de hifenación por default de react-pdf usa reglas de inglés, que
// cortan mal las palabras en español ("comuni-car" en vez de "comu-ni-car",
// o directamente cortes inválidos). Como el documento es corto y de una
// sola columna, es más prolijo no hifenar nada: cada palabra se ajusta
// entera al renglón siguiente si no entra.
Font.registerHyphenationCallback((word) => [word]);

/**
 * PRODUCT-AI-UX-1.1 — Documento PDF real e independiente para "Qué le podés
 * pedir al asistente".
 *
 * Reemplaza a window.print(): esto ya no imprime la página web (con su
 * chrome, sidebar, URL, fecha del navegador, etc.), genera un archivo .pdf
 * real desde cero, en A4, con paginación automática a cargo de
 * @react-pdf/renderer — no calculamos alturas a mano ni dependemos del
 * estado visual del modal (accordions, scroll, viewport).
 *
 * Fuente única: TEMAS vive en IAAyudaModal.tsx y este documento lo importa
 * tal cual — nada de contenido se duplica a mano acá. Si el día de mañana
 * se agrega una categoría en TEMAS, este PDF la incluye solo.
 *
 * Fuente tipográfica: se usa Helvetica (base14, sin registrar fuente
 * externa) porque su codificación WinAnsi ya cubre á/é/í/ó/ú/ñ/¿/¡ sin
 * agregar peso de bundle ni depender de una licencia de fuente embebida.
 */

const styles = StyleSheet.create({
  page: {
    paddingTop: 40,
    paddingBottom: 48,
    paddingHorizontal: 40,
    fontSize: 10,
    fontFamily: "Helvetica",
    color: "#2c3531",
  },
  headerTitulo: {
    fontSize: 20,
    fontFamily: "Helvetica-Bold",
    color: "#101814",
  },
  headerSubtitulo: {
    fontSize: 12.5,
    fontFamily: "Helvetica-Bold",
    color: "#5d6560",
    marginTop: 3,
  },
  headerIntro: {
    fontSize: 9.5,
    color: "#5d6560",
    marginTop: 10,
    lineHeight: 1.5,
  },
  headerAclaracion: {
    fontSize: 9.5,
    fontFamily: "Helvetica-Bold",
    color: "#101814",
    marginTop: 6,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 18,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#e3e7e4",
  },
  logo: {
    width: 100,
    height: 40,
    objectFit: "contain",
  },
  card: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
    marginBottom: 12,
  },
  cardTitulo: {
    fontSize: 12.5,
    fontFamily: "Helvetica-Bold",
    color: "#101814",
  },
  cardResumen: {
    fontSize: 9.5,
    color: "#5d6560",
    marginTop: 2,
    marginBottom: 9,
    lineHeight: 1.4,
  },
  ejemplo: {
    backgroundColor: "#f4f6f5",
    borderRadius: 7,
    paddingVertical: 6,
    paddingHorizontal: 9,
    marginBottom: 5,
  },
  ejemploTexto: {
    fontSize: 9.5,
    fontFamily: "Helvetica-Bold",
    color: "#2c3531",
  },
  ejemploNota: {
    fontSize: 8.5,
    color: "#8a938e",
    marginTop: 2,
    lineHeight: 1.3,
  },
  tipBox: {
    borderRadius: 7,
    paddingVertical: 7,
    paddingHorizontal: 9,
    marginTop: 4,
  },
  tipTexto: {
    fontSize: 8.5,
    lineHeight: 1.4,
  },
  tipLabel: {
    fontFamily: "Helvetica-Bold",
  },
  cierre: {
    borderWidth: 1,
    borderColor: "#e3e7e4",
    borderRadius: 10,
    padding: 14,
    marginTop: 4,
  },
  cierreTitulo: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    color: "#101814",
    marginBottom: 4,
  },
  cierreTexto: {
    fontSize: 9.5,
    color: "#5d6560",
    lineHeight: 1.45,
  },
  footer: {
    position: "absolute",
    bottom: 22,
    left: 40,
    right: 40,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 8,
    color: "#9aa19c",
    borderTopWidth: 1,
    borderTopColor: "#e3e7e4",
    paddingTop: 6,
  },
});

function TemaCard({ tema }: { tema: Tema }) {
  const c = PDF_COLOR_HEX[tema.color];
  return (
    <View style={[styles.card, { borderColor: c.borde }]} wrap={false}>
      <Text style={styles.cardTitulo}>{tema.titulo}</Text>
      <Text style={styles.cardResumen}>{tema.resumen}</Text>
      {tema.ejemplos.map((ej) => (
        <View key={ej.texto} style={styles.ejemplo}>
          <Text style={styles.ejemploTexto}>&ldquo;{ej.texto}&rdquo;</Text>
          {ej.nota ? <Text style={styles.ejemploNota}>{ej.nota}</Text> : null}
        </View>
      ))}
      {tema.tip ? (
        <View style={[styles.tipBox, { backgroundColor: c.chip }]}>
          <Text style={[styles.tipTexto, { color: c.texto }]}>
            <Text style={styles.tipLabel}>Tené en cuenta: </Text>
            {tema.tip}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

// Ruta pública del logo del sidebar (public/brand/logo-sidebar.png). En el
// documento generado en el navegador, react-pdf lo resuelve como una URL
// relativa al origen actual.
const LOGO_SRC = "/brand/logo-sidebar.png";

export default function IAAyudaPdfDocument() {
  return (
    <Document title="YamaSend IA — Guía del asistente">
      <Page size="A4" style={styles.page} wrap>
        <View style={styles.headerRow}>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- Image de @react-pdf/renderer, no <img> HTML; no expone prop alt */}
          <Image src={LOGO_SRC} style={styles.logo} />
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitulo}>YamaSend IA</Text>
            <Text style={styles.headerSubtitulo}>
              Todo lo que le podés pedir a tu asistente
            </Text>
          </View>
        </View>

        <Text style={styles.headerIntro}>
          Tu asistente puede ayudarte a entender conversaciones, detectar oportunidades y
          decidir a quién contactar, cuándo hacerlo y qué comunicar.
        </Text>
        <Text style={[styles.headerAclaracion, { marginBottom: 16 }]}>
          Las acciones importantes siempre requieren tu confirmación.
        </Text>

        {TEMAS.map((tema) => (
          <TemaCard key={tema.id} tema={tema} />
        ))}

        <View style={styles.cierre} wrap={false}>
          <Text style={styles.cierreTitulo}>Si algo sale distinto</Text>
          <Text style={styles.cierreTexto}>
            Podés corregir sobre la marcha sin empezar de nuevo: mientras armás algo, escribí
            el cambio (&ldquo;mejor llamala Promo Agosto&rdquo;) y el asistente lo toma. Si te
            arrepentís, alcanza con decir &ldquo;dejalo&rdquo; o &ldquo;cancelá&rdquo;. Nada se
            crea ni se envía sin que lo confirmes antes.
          </Text>
        </View>

        <View style={styles.footer} fixed>
          <Text>YamaSend · Asistente comercial con IA</Text>
          <Text render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
