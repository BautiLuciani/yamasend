# Control de calidad y salud de líneas en YamaSend (multi-tenant)

Fecha: 26/10/2026. Lleva al producto la regla fija de Pato para cualquier envío de
WhatsApp (seis pasos: verificar base, semáforo de línea, plantilla posicional,
prueba entregada, rechequeo durante la corrida, reconciliación). Hoy YamaSend
solo chequea "template APPROVED" y "WABA APPROVED" antes de enviar, y el estado
de los mensajes queda en `accepted` para siempre (la prueba del 26/10 lo mostró).

## Estado por paso

| # | Paso | Hoy en YamaSend | Qué se hace |
|---|---|---|---|
| 1 | **Verificar la base** (WA Lookup, 7 días de vigencia, USD 0,001/número) | No existe. Un contacto sin WhatsApp genera error 131026 y le pega a la calidad del tenant. | Tabla `yamas_send_wa_verificados` (SQL bloque 7). En el envío, antes del loop: verificar los teléfonos de la lista sin fila vigente (lotes de 100, uno a la vez, 31 s entre lotes), guardar, y **descartar `registrado=false`** (filtro estricto: si WA Lookup no respondió, el número se considera no verificado y no sale). |
| 2 | **Semáforo de línea** | Solo APPROVED de template y WABA. | Workflow `eWkUiOKjciRs1yOE` **Salud de líneas por tenant** (inactivo): L-V 8:30 y 13:00 + webhook a pedido. Por tenant: saldo, `phoneNumbers` (calidad, estado, tier), `businessAccounts` (restricciones, review) y últimos 100 mensajes → `yamas_send_linea_salud`. Mail a Pato solo si algo no está VERDE. El envío lee la tabla: **ROJO = no arranca** (`autorizado=false`, respuesta 403 con motivo); salud vieja (> 6 h) o inexistente = se pide un chequeo a pedido antes de seguir. |
| 3 | **Plantilla posicional** | Las plantillas de YamaSend no llevan variables (solo BODY fijo) — no aplica hoy. | Cuando se agreguen variables en "Generar template", forzar `{{1}}`, `{{2}}` (los nombrados fallan por YCloud, error 100). |
| 4 | **Prueba entregada** | La app marca `enviado` cuando YCloud devuelve `accepted`. Nadie confirma `delivered`. | (a) Registrar en la cuenta YCloud de cada tenant el webhook `whatsapp.message.updated` → `ycloud-message-status` (ya existe en Aprobar Template, con HMAC por tenant). Falta: generar y guardar `ycloud_webhook_secret_mensajes` al conectar el WhatsApp. (b) En el envío: mandar el **primer** mensaje, esperar hasta 60 s el `delivered` (polling `GET /v2/whatsapp/messages/{id}`) y recién ahí seguir con el resto; si falla, campaña a `error` con el `errorCode`. |
| 5 | **Rechequeo durante la corrida** | No hay. | En el loop, cada 20 mensajes: `GET /v2/whatsapp/phoneNumbers/{waba}/{tel}`; si `qualityRating=RED` o `status<>CONNECTED` → cortar, campaña a `error`, log de actividad. Se mide `failed` acumulados: > 20 % en la corrida → cortar. |
| 6 | **Reconciliación** | `mensajes_ok` se calcula por `ultima_campana_enviada_at`, no por entrega real. | Cron cada 30 min: para campañas `enviado` de las últimas 24 h, traer `GET /v2/whatsapp/messages?filter.wamid=…` (o el webhook del punto 4) y actualizar `yamas_send_mensajes.status/error_code`; recalcular `mensajes_ok/mensajes_error` con `delivered|read`. Mostrar en la app "entregados / leídos / fallidos" en vez de "ok". |

## Umbrales (los mismos del control de Capra/Alianza)

- **ROJO** (no se envía): línea no `CONNECTED`, calidad `RED`, saldo ≤ USD 5, fallos > 20 % en los últimos ≥ 30 mensajes, o no se pudo leer la línea.
- **AMARILLO** (se envía, se avisa): calidad `YELLOW`, saldo ≤ USD 20, fallos > 10 %, lectura < 5 %, restricciones vigentes en la WABA, error `131049` (Meta frena por salud del ecosistema).
- Informativos: `131047` (re-engagement), review `REJECTED`, línea del tenant no encontrada en su cuenta YCloud.
- `131026` (sin WhatsApp) > 10 % de la muestra = la base no se verificó → AMARILLO.

El `qualityRating` llega tarde (ventana de 24 h); las señales tempranas son la
tasa de lectura, los `131049` y las pausas de plantilla. Meta expone
`health_status.can_send_message` (AVAILABLE/LIMITED/BLOCKED) por entidad, mejor
que el rating: requiere token de Meta por tenant (hoy solo Capra lo tiene en el
cloud); queda para cuando los tenants conecten por Embedded Signup.

## Orden de implementación

1. Aplicar SQL bloque 7 (dos tablas). → **OK pendiente** (DDL).
2. Activar `eWkUiOKjciRs1yOE` y correrlo a mano una vez; revisar la tabla con los 3 tenants actuales. Manda mail solo si hay AMARILLO/ROJO.
3. Envío PATO `lhxVD0sz5oZ56Cky`: en `0_resolver_servidor` sumar `LEFT JOIN yamas_send_linea_salud s ON s.tenant_id = claim.tenant_id` y `autorizado := … AND COALESCE(s.semaforo,'VERDE') <> 'ROJO'`; devolver `s.semaforo, s.motivos` para el 403. Antes del resolver, HTTP a `yamasend-salud-lineas` con `{tenant_id}` si `checked_at < now() - 6h` (o siempre: son 4 GET).
4. Verificación WA Lookup en el envío (paso 1): nodos Code + HTTP (credencial `WA Lookup`, `aliWALookup00001`) + Postgres upsert, entre `otbener_contactos` y el loop. Cuenta compartida con Alianza (7:00–7:40): si devuelve `42901`, esperar 35 s y reintentar; si sigue, la campaña no sale (filtro estricto).
5. Primer mensaje confirmado + rechequeo cada 20 (pasos 4b y 5).
6. Webhook de estado por tenant + reconciliación (pasos 4a y 6). Requiere tocar la app: generar `ycloud_webhook_secret_mensajes` y registrar el endpoint con la API key del tenant (`POST /v2/webhookEndpoints`).
7. App: mostrar el semáforo del tenant en Campañas (y bloquear el botón "Enviar" con ROJO, con el motivo), y "entregados/leídos/fallidos" por campaña.

Rollback de cada paso: desactivar el workflow nuevo / restaurar la versión anterior del envío / `DROP TABLE`.
