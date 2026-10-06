# Campañas sugeridas

Tres campañas que aparecen arriba de la lista en **Campañas**, armadas solas con el
perfil del negocio y las compras detectadas en los chats. Se calculan cada vez que se
abre la sección, así que siempre están al día. **Nunca se envía nada sin que la persona
lo revise**: "Crear campaña" arma la audiencia y abre el asistente de campañas en el paso
del template.

| Campaña | Quién entra |
|---|---|
| Clientes que no compran hace 2 semanas | Compraron al menos una vez y su última compra fue hace más de 14 días. |
| Clientes por producto | Contactos cuyo interés detectado coincide con un producto del perfil (se elige en un selector). |
| Mejores compradores | El 20% con más compras (mínimo 2). |

En todos: se dejan afuera los contactos que recibieron una campaña en los últimos 7 días y los
que tienen el nombre del propio negocio (otras sucursales).

## Piezas

| Pieza | Dónde |
|---|---|
| Reglas de cada audiencia (lógica pura) | `lib/campanas/sugeridas.ts` — prueba: `node --experimental-strip-types --import ./scripts/register-alias.mjs scripts/test-campanas-sugeridas.mts` |
| Detección de compras | función SQL `yamas_send_compradores_detectados` — `docs/campanas-sugeridas.sql` |
| Cálculo y creación de la audiencia | `lib/actions/campanas_sugeridas.ts` |
| Tarjetas | `components/yamasend/CampanasSugeridas.tsx`, montadas en `Campanas.tsx` desde `AppShell.tsx` |

## Cómo se decide que alguien "compró"

YamaSend no tiene registro de ventas. Una compra es un día en el que el dueño le mandó al
contacto un mensaje que confirma una compra o un pago ("gracias por tu compra", "comprobante",
"pago acreditado", "tu pedido ya salió"...). **Si el negocio no manda ese tipo de confirmaciones
por WhatsApp, no hay compras detectadas** y las campañas 1 y 3 muestran un aviso en vez de
una audiencia. La campaña por producto no depende de las compras.

## Por producto: cómo se asocian los clientes

Se compara el interés detectado de cada contacto (`producto_servicio`, `necesidad` y palabras
clave) con el nombre de cada producto del perfil:

- Se usan las palabras de 4 letras o más, sin acentos. Singular y plural cuentan igual
  (`perro`/`perros`); un prefijo no ("canine" no es "canin").
- Tiene que coincidir al menos la mitad de las palabras y alguna **distintiva**: una que no se
  repite en más del 25% de los productos. Sin esto, todos los productos de una marca daban la
  misma audiencia (la marca coincidía con cualquier producto de la marca).
- Productos con exactamente los mismos clientes se muestran una sola vez.
- Un producto necesita al menos 3 clientes para sugerirse.

## Seguridad

- Los ids de contactos **nunca viajan desde el navegador**: la audiencia se recalcula en el
  servidor al crearla.
- Crear la audiencia exige el permiso `crear_audiencias` (y el botón respeta `crear_campanas`).
- Si ya existe una audiencia "Sugerida: …" se actualiza en vez de crear otra cada vez.

## Límites conocidos

- Las audiencias de YamaSend se arman con contactos **analizados** (leads). Los compradores
  que nunca tuvieron un chat analizado no pueden entrar. En `+pets` se detectaron ~234
  compradores y 99 están en Contactos.
- Cuando el interés detectado es genérico ("productos para mascotas"), no alcanza para asociar
  al cliente con un producto puntual.
- El mensaje sugerido es una base fija con el nombre del negocio y usa `{{1}}` para el nombre
  del cliente. Un template de marketing igual necesita la aprobación de Meta.
