# Etiquetas

Submenú **Etiquetas** dentro de **Audiencias**. Las etiquetas son **acumulables**: un contacto
puede ser `cliente` + `eukanuba` + `nuevo`, y elegir las tres en el filtro muestra a quienes
tienen **todas**. De ahí se arma una audiencia con un click.

## «Cliente»

Es una etiqueta **de sistema**: la pone sola la sincronización a quien recibió un mensaje del
negocio que confirma una compra o un pago («gracias por tu compra», «comprobante», «pago
acreditado»...). No se puede quitar, renombrar ni eliminar a mano.

Si ese contacto **nunca había escrito**, no tenía registro de contacto analizado. La
sincronización lo crea con **todo el análisis vacío** (sin temperatura, sin score, sin interés),
solo con la etiqueta: es «cliente y nada más». En Contactos aparece como «Sin analizar».

La sincronización corre sola:
- al abrir **Audiencias > Etiquetas** y **Campañas** (si la persona puede importar contactos);
- al terminar cada análisis de chats (último nodo del workflow n8n «Perfil del negocio (IA)»).

Es idempotente: correrla de nuevo no crea ni cambia nada. Deja afuera a los contactos cuyo nombre
incluye el del propio negocio (otras sucursales).

## Cómo se etiqueta

| Forma | Dónde |
|---|---|
| A mano, un contacto | Detalle del contacto > **Etiquetas** (se eligen entre las existentes o se escribe una nueva). |
| A mano, varios | Audiencias > Etiquetas: elegir etiquetas, y «Agregar otra etiqueta a estos N contactos». |
| Sugeridas | Audiencias > Etiquetas > **Etiquetas sugeridas**: Aplicar o Ignorar (lo ignorado no vuelve). |
| Automática | Solo `cliente`. |

Las etiquetas se guardan en minúsculas, con espacios simples, hasta 30 caracteres y sin símbolos
raros (`lib/etiquetas/etiquetas.ts` replica a la función SQL). Máximo 20 por contacto.

### Qué se sugiere

- **nuevo**: aparecieron por primera vez en los últimos 30 días (al menos 2 contactos).
- **frecuente**: 3 o más compras detectadas.
- **Una por marca o producto del catálogo** (`royal canin`, `eukanuba`): las palabras de los nombres
  de tus productos que aparecen en el interés detectado de al menos 2 contactos. Un par de palabras
  consecutivas reemplaza a las sueltas (se sugiere `royal canin`, no `royal` y `canin`). Se descartan
  las que cubren a más del 40% de los contactos (no segmentan: «mascotas» en una tienda de mascotas)
  y las palabras genéricas (`adulto`, `perro` de tamaño, `alimento`...).

Nunca se sugiere una etiqueta que ya está en uso ni una que se ignoró.

## Piezas

| Pieza | Dónde |
|---|---|
| Columna `etiquetas` en `yamas_send_leads` y funciones SQL | `docs/etiquetas.sql` |
| Lógica pura (normalización, filtro acumulable, sugerencias) | `lib/etiquetas/etiquetas.ts` — prueba: `node --experimental-strip-types --import ./scripts/register-alias.mjs scripts/test-etiquetas.mts` |
| Acciones del servidor | `lib/actions/etiquetas.ts` |
| Pantalla del submenú | `components/yamasend/Etiquetas.tsx` (pestañas en `Audiencias.tsx`) |
| Chip de etiqueta | `components/yamasend/EtiquetaChip.tsx` |
| Etiquetas en Contactos | `ContactsTable.tsx` (chips) y `ContactDetailModal.tsx` (editor) |

## Seguridad

- El tenant sale de la sesión y los ids de contactos se **recalculan en el servidor**: el navegador
  solo dice qué etiquetas quiere. Una persona no puede etiquetar contactos de otra cuenta.
- Etiquetar, quitar, renombrar, eliminar y crear audiencias exige el permiso `crear_audiencias`.
- La sincronización de clientes exige `importar_contactos`; la función interna por tenant no se
  puede ejecutar desde la app (solo desde n8n).

## Límites conocidos

- «Cliente» se **infiere** de los mensajes del negocio. Si un negocio no manda confirmaciones por
  WhatsApp, no hay clientes detectados.
- «Cliente» no se puede quitar a mano: si hay un falso positivo, hoy no se corrige desde la app.
- Las sugerencias por producto salen del interés detectado en los chats: los clientes sin análisis
  no aportan a esas sugerencias.
- Contactos muestra hasta 500; las etiquetas, conteos y audiencias consideran hasta 3000.
