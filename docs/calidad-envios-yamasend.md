# Control de calidad y salud de líneas en YamaSend (multi-tenant)

Fecha: 26/10/2026. Lleva al producto la regla fija de Pato para cualquier envío de
WhatsApp (seis pasos: verificar base, semáforo de línea, plantilla posicional,
prueba entregada, rechequeo durante la corrida, reconciliación). Hoy YamaSend
solo chequea "template APPROVED" y "WABA APPROVED" antes de enviar, y el estado
de los mensajes queda en `accepted` para siempre (la prueba del 26/10 lo mostró).

## Estado por paso

| # | Paso | Hoy en YamaSend | Qué se hace |
|---|---|---|---|
| 1 | **Verificar la base** (WA Lookup) | **No aplica a YamaSend** (decisión de Pato, 26/10): los contactos salen de las conversaciones de WhatsApp del propio cliente, así que ya tienen WhatsApp. La verificación es para bases externas (Capra, Alianza). | Nada. La tabla `yamas_send_wa_verificados` quedó creada vacía; se puede borrar. Si algún día se importan contactos de planillas, ahí sí verificar antes. |
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

1. ✅ 26/10: SQL bloque 7 aplicado (migración `yamas_send_calidad_linea_salud_y_wa_verificados`).
2. ✅ 26/10: `eWkUiOKjciRs1yOE` activo (versión `76f7e8f3…` + filtro `TEST%`). Primera corrida: YamaSend prospección (5491125239189) **AMARILLO** por 2× error 131049 en los últimos 52 mensajes (92 % entregados, 61 % leídos); tenant 5491138564646 VERDE; el fixture `TEST_MOTOR_8B` daba ROJO por API key inválida → se excluyen los `TEST%`. Las dos líneas comparten la cuenta YCloud "YamasAI" (mismo saldo USD 20,87 → AMARILLO en cuanto baje de 20).
3. ✅ 26/10: envío PATO `lhxVD0sz5oZ56Cky` (versión `34f29411…`): `0_resolver_servidor` lee `yamas_send_linea_salud`; con ROJO **no toma la campaña** (no marca `envio_iniciado_at`) y devuelve `rechazo = 'linea_en_rojo: <motivos>'`; nodo nuevo `marcar_rechazo` pasa la campaña a `error` con el motivo en `notas` (cubre el camino del scheduler); `0c_respond_rechazado` devuelve 403 con `error` y `semaforo`. El semáforo se toma del último chequeo (L-V 8:30/13:00); todavía no se refresca a pedido antes de cada envío.
4. ~~Verificación WA Lookup~~ — no aplica (ver paso 1).
5. Primer mensaje confirmado `delivered` + rechequeo de línea cada 20 mensajes (pasos 4b y 5).
6. Webhook de estado por tenant + reconciliación (pasos 4a y 6). Requiere tocar la app: generar `ycloud_webhook_secret_mensajes` y registrar el endpoint con la API key del tenant (`POST /v2/webhookEndpoints`).
7. ✅ 26/10 (rama `feat/firma-webhooks-n8n`, pusheada y **desplegada a producción** el 26/10 con `npx vercel@latest --prod`, deploy `yamasend-pato-l2kcndm6c`): la app lee `yamas_send_linea_salud` (política RLS `tenant_isolation_select`, `getLineaSaludAction`), muestra el banner `LineaSaludBanner` arriba de Campañas (semáforo, línea, saldo, métricas, motivos, avisos, antigüedad del chequeo) y con ROJO bloquea "Nueva campaña" (Campañas y Dashboard) con el motivo. Gate real en `saveCampaignAction` (antes del INSERT) y `sendCampaignAction` (pasa la campaña a `error` con nota). Falta: "entregados/leídos/fallidos" por campaña (depende del paso 6).
8. Refrescar la salud a pedido antes de cada envío: llamar `yamasend-salud-lineas` con `{tenant_id}` desde la app al crear la campaña (el webhook responde al instante y escribe la tabla en ~3 s).

Rollback de cada paso: desactivar el workflow nuevo / restaurar la versión anterior del envío / `DROP TABLE`.
