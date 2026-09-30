# Conector MCP de YamaSend (Claude y ChatGPT)

Permite que un usuario maneje YamaSend hablando desde Claude o ChatGPT:
consultar contactos, audiencias, templates, campañas y métricas; crear
audiencias y borradores; mandar templates a Meta y enviar o programar campañas
(siempre con vista previa + confirmación).

- **URL del conector:** `https://<dominio-de-yamasend>/api/mcp`
- **Login:** OAuth 2.1 con el OAuth Server de Supabase Auth (mismos usuarios que el panel).
- **Pantalla de consentimiento:** `/oauth/consent`.

## Cómo funciona

1. El usuario pega la URL (o toca "Conectar" si ya estamos en el directorio).
2. El cliente pide `/api/mcp` sin token → `401` con `WWW-Authenticate` que apunta a
   `/.well-known/oauth-protected-resource/api/mcp`.
3. Esa metadata dice que el login lo hace Supabase Auth
   (`https://<ref>.supabase.co/auth/v1`). El cliente se registra solo (DCR).
4. Supabase manda al usuario a `/oauth/consent`. Si no tiene sesión, pasa por el
   login normal (magic link) y vuelve solo.
5. El usuario aprueba → el cliente recibe un access token (JWT del usuario con
   claim `client_id`) y lo manda en cada request.
6. `app/api/mcp/route.ts` valida el token (`lib/mcp/auth.ts`) y corre el request
   dentro de `runWithAccessToken`. `createClient()` de `lib/supabase/server.ts`
   usa ese token en vez de cookies, así que **todas las tools reutilizan los
   mismos server actions del panel** (permisos, reserva de créditos, guard del
   Motor, log de actividad). RLS aplica igual que en el panel.

## Tools

| Tool | Tipo |
|---|---|
| ver_mi_cuenta, buscar_contactos, listar_audiencias, ver_audiencia, listar_templates, listar_campanas, ver_campana, ver_metricas, mejor_horario_envio | Lectura |
| preparar_envio_template, preparar_campana | Lectura (vista previa + código) |
| crear_audiencia, guardar_template_borrador | Escritura |
| editar_audiencia | Escritura (marcada destructiva porque puede quitar contactos) |
| confirmar_envio_template, confirmar_campana | Irreversibles (destructiveHint + openWorldHint) |

Las irreversibles exigen el código de la vista previa (HMAC sobre los datos
exactos + huella de la audiencia, vence en 15 min) y lo consumen una sola vez
en `yamas_send_mcp_confirmaciones` (PK → sin doble envío). Ver
`lib/mcp/confirmacion.ts` y `docs/mcp-conector-migracion.sql`.

Nunca se expone: `costo_usd`, `ycloud_api`, ni datos de otros tenants.

## Puesta en marcha

### 1. Supabase (Dashboard del proyecto Yamas.AI)
1. **Authentication → OAuth Server**: activar el OAuth Server.
2. En la misma pantalla: activar **Dynamic Client Registration** (Claude y
   ChatGPT se registran solos).
3. **Authorization Path**: `/oauth/consent`.
4. **Authentication → URL Configuration → Site URL**: tiene que ser el dominio
   de producción de YamaSend (la pantalla de consentimiento se arma con Site URL
   + Authorization Path).
5. Verificar: `https://fhqqdnehsjgnnqirsinu.supabase.co/.well-known/oauth-authorization-server/auth/v1`
   tiene que devolver un JSON (hoy da 404 porque el OAuth Server está apagado).

### 2. Vercel (variables de entorno de producción)
- `MCP_PUBLIC_ORIGIN` (recomendado): `https://<dominio-de-yamasend>` sin barra
  final. Fija la URL del recurso para que coincida exacto con la que pega el usuario.
- `SUPABASE_SERVICE_ROLE_KEY`: ya se usa para créditos; de ahí se deriva la
  clave de los códigos de confirmación. Alternativa: `MCP_CONFIRMACION_SECRET`
  (32+ caracteres). Sin ninguna de las dos, las acciones irreversibles
  responden un error claro y no ejecutan nada.
- Deployment Protection no debe bloquear `/api/mcp` ni `/.well-known/*` en producción.

### 3. Probarlo
- **Claude** (cualquier plan): Configuración → Conectores → Agregar conector
  personalizado → URL `https://<dominio>/api/mcp` → Conectar.
- **ChatGPT**: pegar una URL propia solo funciona con modo desarrollador en
  planes Business/Enterprise/Edu. Para el público general hay que publicarlo
  en el Plugin Directory.
- Checklist de prueba: ver_mi_cuenta → buscar_contactos → crear_audiencia →
  preparar_campana (programada a futuro) → confirmar → listar_campanas.

## Publicación en directorios (el "un solo clic")

- **Claude**: https://claude.ai/directory/manage → Submit new → MCP connector.
  Piden: tools con `title` + anotaciones (listo), OAuth (listo), URL de
  documentación, política de privacidad, contacto de soporte, ícono y una
  cuenta de prueba con datos cargados.
- **ChatGPT (Plugin Directory)**: organización verificada en
  platform.openai.com, política de privacidad, términos, soporte, video,
  5 casos de prueba positivos y 3 negativos, cuenta de prueba **sin MFA**.
  Ambos directorios rechazan conectores que mueven dinero: por eso la compra de
  créditos no está en el conector.

## Pendientes conocidos
- El OAuth Server de Supabase está en beta y todavía no soporta CIMD (Claude y
  ChatGPT usan DCR, que ambos soportan).
- Los tokens no traen `aud` del recurso MCP (Supabase no lo setea). Se aceptan
  tokens OAuth del propio proyecto con `client_id`; todos los clientes OAuth
  del proyecto son para este conector.
- Cuentas de empresa: por ahora el conector trabaja con cuentas de vendedor
  (las que tienen WhatsApp).
- Fuera del v1: Motor de Decisión, compra de créditos, borrados.
