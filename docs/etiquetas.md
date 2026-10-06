# Etiquetas

Las etiquetas viven en **Contactos**: la barra única filtra por score y etiquetas, y el botón **Etiquetas** abre la administración (sugeridas, crear, renombrar, eliminar). Las etiquetas son **acumulables**: un contacto
puede ser `cliente` + `producto` + `nuevo`, y elegir las tres en el filtro muestra a quienes
tienen **todas**. De ahí se arma una audiencia con el botón **Crear audiencia** de la barra (usa lo seleccionado o todo lo filtrado).

## «Cliente»

Es una etiqueta **de sistema**: la pone sola la sincronización a quien recibió un mensaje del
negocio que confirma una compra o un pago («gracias por tu compra», «comprobante», «pago
acreditado»...). No se puede quitar, renombrar ni eliminar a mano.

Si ese contacto **nunca había escrito**, no tenía registro de contacto analizado. La
sincronización lo crea con **todo el análisis vacío** (sin temperatura, sin score, sin interés),
solo con la etiqueta: es «cliente y nada más». En Contactos aparece como «Sin analizar».

La sincronización corre sola:
- al abrir **Contactos** y **Campañas** (si la persona puede importar contactos);
- al terminar cada análisis de chats (último nodo del workflow n8n «Perfil del negocio (IA)»).

Es idempotente: correrla de nuevo no crea ni cambia nada. Deja afuera a los contactos cuyo nombre
incluye el del propio negocio (otras sucursales).

## Cómo se etiqueta

| Forma | Dónde |
|---|---|
| Crear una etiqueta propia | Contactos > **Etiquetas** > **Crear etiqueta**. Existe aunque todavía no tenga contactos (catálogo, máx. 100). |
| A mano, un contacto | Detalle del contacto > **Etiquetas** (se eligen entre las existentes o se escribe una nueva). |
| A mano, varios | Contactos: seleccionar contactos y tocar **Etiquetar** (agregar o quitar). |
| Sugeridas | Contactos > **Etiquetas** > sugeridas: **Aplicar**, **Revisar** (destildar o sumar contactos antes de aplicar) o **Ignorar** (lo ignorado no vuelve). |
| Automática | Solo `cliente`. |

Las etiquetas se guardan en minúsculas, con espacios simples, hasta 30 caracteres y sin símbolos
raros (`lib/etiquetas/etiquetas.ts` replica a la función SQL). Máximo 20 por contacto.

### Qué se sugiere

Las sugerencias salen de lo que se sabe de los contactos, en cuatro grupos. No dependen del rubro.

**Por comportamiento**
- `nuevo`: aparecieron por primera vez en los últimos 30 días.
- `cliente nuevo`: hicieron su primera compra en los últimos 30 días.
- `frecuente`: 3 o más compras detectadas.
- `compró una vez`: una sola compra detectada.
- `interesado`: temperatura caliente y todavía no compraron.
- `dormido`: no hablan hace más de 60 días.
- `reclamo`: actitud negativa en la conversación.

**Por lo que preguntan**: `mayorista`, `busca empleo` (no confunde «ropa de trabajo» con empleo) y `proveedor`.

**Por producto**: marcas o productos del catálogo del perfil que aparecen en el interés de al menos 2
contactos. Un par de palabras consecutivas reemplaza a las sueltas (`royal canin`, no `royal` y `canin`).

**Por tema**: las palabras clave que más se repiten en los chats (por ejemplo `envío` o `descuento`). Se
juntan singular y plural, se conserva la palabra con tildes, y se descartan las genéricas (`compra`,
`pedido`...), las del propio rubro del negocio (`mascotas` en una tienda de mascotas) y las que ya salen
como producto.

En todos los grupos se descarta lo que ya está en uso, lo que el usuario ignoró y lo que no segmenta
(cubre a más del 40% de los contactos). Cada regla tiene un mínimo de contactos para aparecer.

## Piezas

| Pieza | Dónde |
|---|---|
| Columna `etiquetas` en `yamas_send_leads` y funciones SQL | `docs/etiquetas.sql` |
| Lógica pura (normalización, filtro acumulable, sugerencias) | `lib/etiquetas/etiquetas.ts` — prueba: `node --experimental-strip-types --import ./scripts/register-alias.mjs scripts/test-etiquetas.mts` y `scripts/test-etiquetas-sugerencias.mts` |
| Acciones del servidor | `lib/actions/etiquetas.ts` |
| Barra de Contactos | `ContactosBarra.tsx`; administración en `EtiquetasModal.tsx`; revisión en `RevisarSugerenciaModal.tsx` |
| Chip de etiqueta | `components/yamasend/EtiquetaChip.tsx` |
| Etiquetar varios contactos desde Contactos | `components/yamasend/EtiquetarSeleccionModal.tsx` |
| Catálogo de etiquetas propias (SQL) | `docs/etiquetas-catalogo.sql` |
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
