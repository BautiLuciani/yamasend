# YamaSend — auditoría y plan (26/10/2026)

Alcance: los 18 workflows activos + alerta + backup en `n8n.yamasai.tech`, la base
Supabase "Yamas.AI" (`fhqqdnehsjgnnqirsinu`), la app en `yamasend-repo` (rama
`chore/n8n-yamasai-tech`, la desplegada) y Vercel `yamasend-pato`.

Cómo se comprobó: lectura completa de la definición de cada workflow y de sus
últimas ejecuciones por MCP (sin ejecutar ni modificar nada en producción);
consultas de solo lectura a Postgres (`pg_class`, `pg_policies`,
`information_schema`, asesor de seguridad de Supabase); `grep` y `tsc` en el
repo. Nada de lo que sigue mandó mensajes ni tocó datos.

## 1. Hallazgos (una página)

| # | Sev. | Dónde | Qué | Cómo se comprobó |
|---|---|---|---|---|
| 1 | **Alta** | Envíos PATO `lhxVD0sz5oZ56Cky` + Scheduler `cQL7xn9INQl82hkF` | **Doble envío posible**: el webhook de envío responde al terminar el loop (minutos); el scheduler reintenta el POST (`retryOnFail`) y el resolver acepta cualquier campaña en `enviando` sin marcarla → la misma campaña corre dos veces. No hay clave única por `wamid` ni por campaña+contacto en `yamas_send_mensajes`. | Definición de ambos workflows; `pg_indexes` de `yamas_send_mensajes` (solo PK). |
| 2 | **Alta** | 9 webhooks sin autenticación | Receptor YCloud, Respuestas, Aprobar Template (webhook de la app), Perfil del negocio, Sync+Análisis v2, Análisis worker, Motor Pipeline, Sync LID, Sync de Contactos WAHA. Solo los dos de envío tienen Header Auth. Consecuencias concretas: crear templates en Meta con la API key de cualquier tenant; hacer que la línea de prospección responda a cualquier número (gasto YCloud+OpenAI); inyectar mensajes/contactos falsos; disparar corridas del Motor y regeneraciones de perfil (OpenAI gpt-4o) para cualquier tenant. | `authentication` ausente en cada nodo Webhook; sin IF/Code que compare header. |
| 3 | **Alta** | Agente AI web `ithLyW0PCSmKtC1z` | Chat público que confía en el `tenant_id` del body: lee contactos y chats y crea listas **de otro tenant**. `allowedOrigins` incluye `127.0.0.1`. | Definición: INFO1 filtra por `$json.tenant_id` del chat; tools usan ese ID. |
| 4 | **Alta** | Inyección SQL | `Registrar Mensaje Enviado` y `(texto)` (envíos, con datos de la respuesta de YCloud); `0_resolver_servidor` (`campaign_id` del body); `Actualizar Mensaje Status` (Aprobar Template, datos del evento YCloud); `A3. Log Actividad` (Sync WAHA, `session_name` del webhook **sin auth** → explotable desde internet); `CATALOGO` del agente (deshabilitado). El resto de los ~25 nodos Postgres usa `queryReplacement`. | Lectura de cada `query`. |
| 5 | **Alta** | Alerta de errores `65ksreEdUuIkVloc` | Un mail por ejecución fallida, sin agrupar: con el polling cada 2 min una caída de YCloud = 30 mails/hora. Nunca se disparó (0 ejecuciones): sin probar. | Definición y ejecuciones. |
| 6 | Media | QR Generator `VxtHWQiIvpZ0tHIh` | Anon key de Supabase escrita a mano en el nodo "2. Obtener usuario autenticado" (confirmado). Registra el webhook en WAHA con `hmac: null`. "4. Buscar tenant" sigue sin tenant si falla. | Definición. |
| 7 | Media | Pulso `uM2QaKdfO1DIrGsX` | Hash SHA-256 fijo + mail en un Code node (crackeable offline si se exporta; el backup a Drive lo exporta). Lee una Data Table que **ningún** workflow del servidor escribe → dashboard vacío. | Definición; búsqueda "Pulso". |
| 8 | Media | Sync LID `AbfzphRS7LcsM88j` | Con 2+ sesiones conectadas atribuye todos los pares LID↔teléfono al **primer** tenant (`.first()`). | Nodo "Agrupar pares lid-telefono". |
| 9 | Media | Polling YCloud Pro `InpR1YEf6BMGRtIh` | Match FIFO sin correlación: dos onboardings a la vez se cruzan de tenant. 720 ejecuciones/día aunque no haya pendientes. | Definición; 2.195 ejecuciones. |
| 10 | Media | Scheduler `cQL7xn9INQl82hkF` | `tenant_id = '5491138564646'` fijo: solo salen campañas programadas de ese tenant. Si el disparo falla, la campaña queda en `enviando` para siempre. | Query `obtener_campanas_vencidas`. |
| 11 | Media | Envíos: rama texto | `Envia_mensaje` sin retry ni onError (un 4xx corta el loop y la campaña queda en `enviando`); `"body": "{{…}}"` rompe el JSON con comillas; el tope de marketing de 10 días está solo en la rama template. `EnviarTemplate_YCloud` con `retryOnFail` puede duplicar un mensaje si YCloud aceptó y la respuesta se perdió. | Definición. |
| 12 | Media | Supabase | 7 tablas `yamas_inmo_*` **sin RLS** y con `GRANT ALL` a `authenticated`: cualquier usuario logueado de YamaSend puede leerlas/borrarlas (son de Yamas Inmo). 3 tablas `yamas_send_*` con grant a `anon` (RLS sin política las protege hoy). 8 RPC `SECURITY DEFINER` ejecutables por `anon` (todas chequean `auth.uid()`: no filtran). Postgres con parches pendientes. | `get_advisors`, `role_table_grants`, `pg_proc`. |
| 13 | Media | App | Solo el envío de campañas mandaba `X-Yamasend-Signature`; los otros 6 Server Actions llamaban a n8n sin nada (**corregido en la rama** `feat/firma-webhooks-n8n`). Vercel no está conectado a Git. | `grep fetch(` en `lib/actions`. |
| 14 | Media | Backup `RY3xRZy7bv2YflLn` | Sube el JSON completo de **todos** los workflows (incluye el hash de Pulso y lo de Attain/Alianza) a la raíz de "My Drive" de una cuenta genérica, sin cifrar ni rotar. Sin `errorWorkflow`. | Definición; 1 ejecución manual OK. |
| 15 | Media | Ajenos a YamaSend | Verificador diario `PKDjz4G916qun5xl` es de Alianza/Capra y controla el verificador propio dado de baja el 23/10; Envíos por YCloud prospección `J6M5W0x5laqdi3kF` tiene un cron anual `0 10 15 10 *` activo y también usa ese verificador. | Definición. |
| 16 | Baja | Aprobar Template | HMAC sin ventana de tiempo (replay); "Buscar Secret Tenant Mensaje" sin `alwaysOutputData` deja el webhook sin respuesta; solo manda BODY a Meta (header/footer/botones se guardan pero no se envían). | Definición. |
| 17 | Baja | Varios | Sin `executionTimeout` en ninguno; `availableInMCP: true` en todos; credenciales con prefijo `ali` (Alianza) e ids genéricos; nodos huérfanos (Gmail en v2, "Clientes de Clientes" en el agente); descripción de Respuestas promete throttling que no existe. | Definición. |
| 18 | Info | Ejecución 514 | No existe (ni la 513): fueron borradas o nunca se persistieron. Nada que limpiar. | `search_workflow_executions`. |

Lo que está bien: todas las credenciales son las de YamaSend (Postgres Yamas.AI,
Supabase Yamas.AI, YamasAI Ycloud, WAHA API Key); ninguna URL al cloud viejo ni
al WAHA de DigitalOcean; el Receptor YCloud y el worker de análisis son
idempotentes (`ON CONFLICT`); las API keys de YCloud por tenant vienen de la DB,
no están escritas; las RPC validan `auth.uid()`; `tsc` pasa.

## 2. Plan por fases

Cada paso dice riesgo y cómo volver. Nada de esto está aplicado salvo lo marcado ✅.

**Fase 0 — ya hecho, sin tocar producción**
- ✅ Rama `feat/firma-webhooks-n8n`: helper `lib/n8n/firma.ts` y firma en los 7
  Server Actions (`tsc` OK). Revertir: no desplegar / `git checkout chore/n8n-yamasai-tech`.
- ✅ Workflow inactivo `nCZw7T3vu3yj4aL9` "Sync de Contactos — P0 firmado": Header
  Auth + A3 parametrizado + timeout 300 s. Revertir: borrarlo.
- ✅ `docs/n8n-cambios-p0.md`: operaciones exactas para Aprobar Template, Envíos
  PATO, Scheduler, QR Generator y los demás webhooks.
- ✅ `docs/sql/2026-10-26-p0-seguridad.sql`: índice único `wamid`, columna
  `envio_iniciado_at`, revokes a `anon`, `search_path`. Cada bloque con rollback.

**Fase 1 — fiabilidad del envío (riesgo bajo, 1 día)**
1. SQL bloque 1 y 2 (índice `wamid` + columna). Rollback: `DROP INDEX` / `DROP COLUMN`.
2. Envíos PATO: C1 (claim atómico), C2 (INSERT parametrizado + `ON CONFLICT`),
   C3 (rama texto). Rollback: `restore_workflow_version`.
3. Scheduler: D (`retryOnFail` off, timeout, `alwaysOutputData`; decidir el tenant fijo).
4. Prueba de punta a punta con una lista de 1 contacto (número de Pato), rama
   template y rama texto. Requiere OK.
5. Eliminar el workflow de envío original `iTgqykkftwSDK8L7` (nadie lo llama:
   la app usa `YAMASEND_SEND_WEBHOOK_URL` → PATO). Rollback: n8n lo guarda
   archivado 30 días.

**Fase 2 — cerrar los webhooks (riesgo medio: hay que coordinar dos lados)**
1. Crear credencial nueva "YamaSend firma app" en n8n (a mano) y poner el mismo
   valor en Vercel `YAMASEND_SENDER_SECRET`. Desplegar la rama de Fase 0.
   Rollback: volver la env var y redeploy anterior en Vercel.
2. Activar `headerAuth` en Aprobar Template (B1), Perfil del negocio, v2,
   worker, Motor, Sync LID, y agregar el header en los HTTP internos que se
   llaman entre sí (worker → motor/lid/perfil, motor → motor, v2 → lid).
   Orden: primero los HTTP que llaman, después los webhooks que exigen.
   Prueba: POST sin header → 403; cron del Motor sigue con `success`.
3. Receptor YCloud y Respuestas: validar `ycloud-signature` (HMAC) con el
   secreto del webhook `6abd88fa262d4a22f5ce7c63`, copiando los nodos de
   Aprobar Template. Riesgo: si el secreto no coincide se pierden entrantes →
   activar con `alwaysOutputData` y un día de log antes de rechazar.
4. WAHA: inventario de sesiones y sus webhooks; agregar `customHeaders` de a una
   sesión (puede reiniciarla); recién después activar la copia `nCZw7T3vu3yj4aL9`.
5. QR Generator: F (anon key → credencial) y `hmac/customHeaders` en "6a".
6. Agente AI web: tenant por token de usuario (como hace v2), no por body;
   sacar `127.0.0.1`.
7. Aprobar Template B2–B4; parametrizar `Actualizar Mensaje Status`.

**Fase 3 — operación**
1. Alerta de errores: agrupar por workflow/10 min (Data Table o staticData), mail
   con resumen; probarla con un fallo controlado (workflow de prueba que tira error).
2. Monitor horario de crons (polling 2 min, scheduler 5, motor 15, LID 3 h).
3. Backup: carpeta propia en Drive, cuenta identificada, excluir workflows ajenos,
   retención; sumar `pg_dump` de Supabase y el volumen de n8n (Easypanel).
4. Supabase: SQL bloques 3–6; decidir RLS en `yamas_inmo_*` con Yamas Inmo;
   actualizar Postgres (ventana de mantenimiento).
5. Conectar `yamasend-pato` a Git (`main` o rama fija) y dejar de desplegar desde la PC.
6. Pulso: migrar o apagar el productor; mover el hash a credencial.
7. Sync LID: iterar por sesión. Polling YCloud: correlacionar por teléfono y
   cortar antes de pegarle a YCloud si no hay pendientes.

**Fase 4 — producto y orden**
- Insight IA / Template IA / Analizar catálogo: migrar los 3 workflows del cloud
  o quitar los botones (hoy fallan en silencio con 404).
- Costos OpenAI: `max_tokens`, tope por tenant/día, caché de perfil; gpt-4o-mini
  donde alcance (consolidación del perfil usa gpt-4o).
- Limpiar el cloud viejo; dar de baja verificador propio, droplet DO, cron anual
  de prospección, workflow de Alianza en este servidor.
- Vercel: confirmar que `YCLOUD_API_KEY`, `OPENAI_API_KEY`,
  `YAMASEND_SENDER_SECRET`, `SUPABASE_SERVICE_ROLE_KEY` son Sensitive (el MCP no
  llega: hacerlo desde el dashboard). En el código no hay ninguna clave de
  servidor con `NEXT_PUBLIC_` (solo URL y anon key, que son públicas por diseño).
- `docs/arquitectura.md` con el mapa + runbooks.

## 3. Necesito tu OK para

1. Hacer **push** de `feat/firma-webhooks-n8n` al repo de Bauti (hoy solo está local).
2. Crear la credencial "YamaSend firma app" en n8n (la creás vos; yo la asigno) y
   cambiar `YAMASEND_SENDER_SECRET` en Vercel al mismo valor → rotación de la
   firma que se vio en la captura.
3. Desplegar la rama en Vercel (`npx vercel@latest --prod` desde la PC, o
   conectar Git antes).
4. Aplicar los bloques 1 y 2 del SQL (índice `wamid`, columna `envio_iniciado_at`).
5. Aplicar en el workflow de envíos PATO los cambios C1–C3 y en el scheduler D
   (reversibles por historial de versiones).
6. Una **campaña de prueba** a tu número (1 contacto, plantilla aprobada).
7. Eliminar el workflow de envío original `iTgqykkftwSDK8L7`.
8. Activar `headerAuth` en los webhooks de la tabla E (después de 2 y 3).
9. Tocar las sesiones WAHA (customHeaders) — una por una, puede reconectar.
10. Desactivar el verificador diario de Alianza en este servidor y el cron anual
    de prospección; decidir el tenant fijo del scheduler.
11. Aplicar los bloques 3–6 del SQL y, con Yamas Inmo, el RLS de `yamas_inmo_*`.
