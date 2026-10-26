# Cambios P0 en n8n (n8n.yamasai.tech)

Fecha: 26/10/2026. **Aplicados y publicados el 26/10 con OK de Pato:** bloques SQL 1 y 2
(migración `yamas_send_p0_wamid_unico_y_envio_iniciado`), C1–C3 en envíos PATO
(versión `7ef70611…`; anterior `35d66fc6…`) y D en el scheduler (versión
`1c573211…`; anterior `a29d6368…`), salvo el filtro de tenant fijo del scheduler,
que quedó igual hasta confirmar. Lo demás (A, B, E, F) sigue pendiente. Servidor: `n8n.yamasai.tech` (MCP `n8n-selfhosted`). Cada bloque
se aplica con `update_workflow` sobre el workflow vivo y se revierte con
`restore_workflow_version` a la versión anterior (n8n guarda el historial), o
desactivando el workflow nuevo y reactivando el viejo cuando es una copia.

Regla de orden: **primero la app manda la firma, después n8n la exige.** La rama
`feat/firma-webhooks-n8n` ya manda `X-Yamasend-Signature` en los 7 Server
Actions; hasta que esa rama esté desplegada, activar `headerAuth` en un webhook
rompe la función de la app que lo llama.

Credencial de la firma: "Pedido de ChatGPT" (`rSRZC6wJRjwBX3bC`, header
`X-Yamasend-Signature`, mismo valor que `YAMASEND_SENDER_SECRET` en Vercel).
Recomendado: crear en n8n una credencial nueva "YamaSend firma app" con un valor
nuevo, cambiar `YAMASEND_SENDER_SECRET` en Vercel al mismo valor, y recién ahí
reasignar los webhooks (la credencial actual se vio en una captura).

---

## A. Copia ya creada (inactiva)

**"Yamasend - Sync de Contactos (WAHA) — P0 firmado [INACTIVO]"** — copia de
`JyPsXJqnoUKg39Vr` con webhook `headerAuth` + nodo A3 parametrizado. Mismo path
`yamasend/waha/sync-contacts`. Código fuente: `docs/n8n/sync-contactos-p0.sdk.js`.

Cutover (requiere OK):
1. En WAHA, para cada sesión `ys_*`, agregar a `config.webhooks[].customHeaders`
   el header `X-Yamasend-Signature` con el valor de la credencial (PUT
   `/api/sessions/{name}` — puede reiniciar la sesión; hacerlo de a una).
   También cambiar el nodo "6a. Crear sesión en WAHA" del QR Generator
   (`VxtHWQiIvpZ0tHIh`) para que las sesiones nuevas ya nazcan con el header.
2. Desactivar `JyPsXJqnoUKg39Vr`, activar la copia.
3. Rollback: desactivar la copia, activar `JyPsXJqnoUKg39Vr`.

---

## B. Aprobar Template Meta (`S0X7gl1KfYdesnrw`)

### B1. Webhook de la app con firma
```json
[
  { "type": "setNodeParameter", "nodeName": "Webhook", "path": "/authentication", "value": "headerAuth" },
  { "type": "setNodeCredential", "nodeName": "Webhook", "credentialKey": "httpHeaderAuth", "credentialId": "rSRZC6wJRjwBX3bC", "credentialName": "Pedido de ChatGPT" }
]
```
Prueba (sin mandar mensajes): POST a `/webhook/2ec4468d-…` sin header → 403;
con header y `tenant_id` inexistente → `{ok:false, error:"tenant_sin_credencial_ycloud"}` (403).

### B2. "Actualizar Mensaje Status" parametrizado (inyección SQL)
```json
[
  { "type": "updateNodeParameters", "nodeName": "Actualizar Mensaje Status", "parameters": {
    "operation": "executeQuery",
    "query": "UPDATE yamas_send_mensajes SET status = $1, error_code = $2, error_message = $3, pricing_category = $4, total_price = NULLIF($5,'')::numeric, send_time = NULLIF($6,'')::timestamptz, deliver_time = NULLIF($7,'')::timestamptz, read_time = NULLIF($8,'')::timestamptz, updated_at = now() WHERE wamid = $9",
    "options": { "queryReplacement": "={{ [ $json.msg.status, $json.msg.errorCode ?? null, $json.msg.errorMessage ?? null, $json.msg.pricingCategory ?? null, $json.msg.totalPrice == null ? '' : String($json.msg.totalPrice), $json.msg.sendTime ?? '', $json.msg.deliverTime ?? '', $json.msg.readTime ?? '', $json.msg.wamid ] }}"
  } }
]
```
Nota: el campo `query` NO lleva prefijo `=` (trampa conocida). Probar con una
ejecución manual pineando un evento `whatsapp.message.updated` de prueba antes
de publicar.

### B3. "Buscar Secret Tenant Mensaje" sin respuesta cuando no hay tenant
```json
[ { "type": "setNodeSettings", "nodeName": "Buscar Secret Tenant Mensaje", "settings": { "alwaysOutputData": true } } ]
```

### B4. Replay: tolerancia de timestamp en "Validar Firma" y "Validar Firma Mensaje"
Agregar antes de calcular el HMAC:
```js
const ageSec = Math.abs(Date.now()/1000 - Number(ctx.timestamp));
if (!Number.isFinite(ageSec) || ageSec > 300) {
  return [{ json: { valid: false, reason: 'timestamp_out_of_window', event: ctx.event, msg: ctx.msg, tpl: ctx.tpl } }];
}
```

---

## C. Envíos mensajes meta PATO (`lhxVD0sz5oZ56Cky`) — el que usa la app y el scheduler

### C1. Claim atómico contra el doble envío (`0_resolver_servidor`)
Reemplazar la CTE `m` por un UPDATE condicional: la campaña marca
`envio_iniciado_at = now()` (columna nueva, docs/sql bloque 2) solo si estaba
`enviando` y todavía sin iniciar; la única ejecución que logra el cambio sigue.
Un segundo POST (reintento del scheduler, doble clic) obtiene 0 filas →
`autorizado=false`. El status sigue siendo `enviando` (la app lo usa en 12
lugares), así que no hay cambios en la UI.
```json
[ { "type": "updateNodeParameters", "nodeName": "0_resolver_servidor", "parameters": {
  "operation": "executeQuery",
  "query": "WITH claim AS (\n  UPDATE yamas_send_campanas c SET envio_iniciado_at = now(), updated_at = now()\n  WHERE c.id = $1::uuid AND c.status = 'enviando' AND c.envio_iniciado_at IS NULL\n    AND NOT EXISTS (SELECT 1 FROM motor.drafts d WHERE d.campana_id = c.id)\n  RETURNING c.id, c.tenant_id, c.lista_id, c.template_nombre, c.template_id, c.contactos_count\n), m AS (\n  SELECT claim.id AS campaign_id, claim.tenant_id, claim.lista_id, claim.template_nombre AS template_name,\n         COALESCE(t.template_lang,'es_AR') AS template_language, claim.contactos_count AS total,\n         tc.ycloud_api, tc.wabaid AS wabaid, tc.ventas_tel, $2::boolean AS ventana_24h\n  FROM claim\n  LEFT JOIN yamas_send_templates t ON t.id = claim.template_id\n  LEFT JOIN yamas_inmo_clientes tc ON tc.tenant_id = claim.tenant_id\n)\nSELECT m.campaign_id, m.tenant_id, m.lista_id, m.template_name, m.template_language,\n       m.total, m.ycloud_api, m.wabaid, m.ventas_tel, m.ventana_24h,\n       (m.campaign_id IS NOT NULL AND m.ycloud_api IS NOT NULL AND m.ycloud_api <> '' AND m.wabaid IS NOT NULL AND m.wabaid <> '') AS autorizado\nFROM (SELECT 1) dummy\nLEFT JOIN m ON true",
  "options": { "queryReplacement": "={{ [ $json.body.campaign_id, $json.body.ventana_24h === true ] }}" }
} } ]
```
Efectos colaterales: ninguno en la UI. `actualizar_campana`/`actualizar_campana1`
ya ponen `enviado` al final; si el loop muere, la campaña queda en `enviando`
con `envio_iniciado_at` cargado y nadie la retoma (hoy tampoco). Rescate: un
cron que pase a `error` las que lleven más de N horas así. Una campaña
"Duplicar"/reintentar desde la app crea una fila nueva, así que no choca con
el cerrojo.

### C2. "Registrar Mensaje Enviado" y "(texto)" parametrizados + idempotentes
Requiere el índice `uq_yamas_send_mensajes_wamid` (docs/sql, bloque 1).
```json
[
 { "type": "updateNodeParameters", "nodeName": "Registrar Mensaje Enviado", "parameters": {
   "operation": "executeQuery",
   "query": "INSERT INTO yamas_send_mensajes (tenant_id, campana_id, contacto_id, telefono, wamid, waba_id, tipo, status)\nSELECT $1, $2::uuid, $3::uuid, $4, $5, $6, 'template', $7\nWHERE COALESCE($5,'') <> ''\nON CONFLICT (wamid) WHERE wamid IS NOT NULL AND wamid <> '' DO NOTHING",
   "options": { "queryReplacement": "={{ [ $('0_resolver_servidor').first().json.tenant_id, $('0_resolver_servidor').first().json.campaign_id, $('otbener_contactos').item.json.id, $json.to ?? null, $json.wamid ?? null, $json.wabaId ?? null, $json.status ?? null ] }}" }
 } },
 { "type": "updateNodeParameters", "nodeName": "Registrar Mensaje Enviado (texto)", "parameters": {
   "operation": "executeQuery",
   "query": "INSERT INTO yamas_send_mensajes (tenant_id, campana_id, contacto_id, telefono, wamid, waba_id, tipo, status)\nSELECT $1, $2::uuid, $3::uuid, $4, $5, $6, 'texto', $7\nWHERE COALESCE($5,'') <> ''\nON CONFLICT (wamid) WHERE wamid IS NOT NULL AND wamid <> '' DO NOTHING",
   "options": { "queryReplacement": "={{ [ $('0_resolver_servidor').first().json.tenant_id, $('0_resolver_servidor').first().json.campaign_id, $('otbener_contactos1').item.json.id, $json.to ?? null, $json.wamid ?? null, $json.wabaId ?? null, $json.status ?? null ] }}" }
 } }
]
```

### C3. Rama texto: JSON roto con comillas, sin retry ni onError, sin tope de 10 días
```json
[
 { "type": "setNodeParameter", "nodeName": "Envia_mensaje", "path": "/jsonBody", "value": "={{ JSON.stringify({ type: 'text', text: { body: $json.contenido_final }, from: '+' + $('0_resolver_servidor').first().json.ventas_tel, to: '+' + $json.tel }) }}" },
 { "type": "setNodeSettings", "nodeName": "Envia_mensaje", "settings": { "onError": "continueRegularOutput" } },
 { "type": "setNodeParameter", "nodeName": "0c_respond_rechazado", "path": "/responseCode", "value": 403 }
]
```
(Al `EnviarTemplate_YCloud` conviene sacarle `retryOnFail`: si YCloud aceptó y
la respuesta se perdió, el retry manda el mensaje dos veces. Mejor registrar
el error y seguir.) El tope de marketing de 10 días hay que copiarlo de
`otbener_contactos` a `otbener_contactos1` (misma cláusula `AND NOT (...)`).

---

## D. Scheduler (`cQL7xn9INQl82hkF`)
- `obtener_campanas_vencidas`: sacar `tenant_id = '5491138564646'` (hoy solo salen
  las campañas programadas de ese tenant). Confirmar antes que es intencional.
- `marcar_enviando`: `alwaysOutputData: true` para que una campaña ya tomada no
  corte el loop.
- `disparar_envio`: `retryOnFail: false` + `timeout: 15000`. La respuesta del
  envío llega al final del loop (minutos); el scheduler no debe esperarla ni
  reintentar. Con C1 el reintento ya no duplica, pero sigue siendo ruido.

## E. Resto de webhooks sin auth (misma receta: `/authentication` = headerAuth + credencial)
| Workflow | Nodo | Quién lo llama | Cuándo activar |
|---|---|---|---|
| `l245l2EnNjStx8qh` Perfil del negocio | Disparo del perfil | app (`perfil_negocio.ts`) y worker `byhTG2mp4pt47UPa` | tras deploy de la rama + agregar header en "Lanzar perfil" del worker |
| `ekVcl5YBtlegBiJg` Sync+Análisis v2 | Webhook | app (`sync.ts`, ya manda Bearer) | tras deploy |
| `byhTG2mp4pt47UPa` Análisis worker | Webhook | se autollama + QR Generator | agregar header en los HTTP que lo llaman, después activar |
| `54lMIkx4oF6qUrse` Motor Pipeline | Webhook | se autollama (cron + continuación) + worker | ídem |
| `AbfzphRS7LcsM88j` Sync LID | Webhook | worker y v2 | ídem |
| `3yNZelxXBx6Uo3S5` Receptor YCloud | Evento de YCloud | YCloud (webhook `yamasend-inbound` → reenvío desde `CKwrQPxt8a5M7wpN`) | YCloud firma con `ycloud-signature` (HMAC): copiar los nodos "Verificar/Validar Firma" de Aprobar Template; el reenvío interno lleva header |
| `CKwrQPxt8a5M7wpN` Respuestas | Mensaje entrante de YCloud | YCloud | validar HMAC `ycloud-signature` con el secreto del webhook `6abd88fa262d4a22f5ce7c63` |
| `VxtHWQiIvpZ0tHIh` QR Generator | Webhook | navegador (AppShell) | NO header: el browser no puede llevar el secreto; ya valida el access_token contra Supabase. Solo reemplazar la anon key a mano por la credencial `Ayf8omm7hiVVd9GK` |
| `ithLyW0PCSmKtC1z` agente AI web | Chat Trigger público | widget web | sacar `127.0.0.1` de allowedOrigins; resolver tenant por token, no por body |
| `uM2QaKdfO1DIrGsX` Pulso | pulso-status | dashboard | mover el hash/email del Code node a una credencial; o headerAuth |

## F. Secreto en claro en QR Generator
```json
[
 { "type": "setNodeParameter", "nodeName": "2. Obtener usuario autenticado (Supabase Auth)", "path": "/authentication", "value": "genericCredentialType" },
 { "type": "setNodeParameter", "nodeName": "2. Obtener usuario autenticado (Supabase Auth)", "path": "/genericAuthType", "value": "httpHeaderAuth" },
 { "type": "setNodeCredential", "nodeName": "2. Obtener usuario autenticado (Supabase Auth)", "credentialKey": "httpHeaderAuth", "credentialId": "Ayf8omm7hiVVd9GK", "credentialName": "Supabase Anon Key (apikey header)" }
]
```
y borrar el header `apikey` manual de `headerParameters` (dejar solo
`Authorization: Bearer …`). Verificar primero cómo lo hace el nodo "0. Resolver
auth.uid" de `ekVcl5YBtlegBiJg`, que ya está bien, y copiar esa configuración.
