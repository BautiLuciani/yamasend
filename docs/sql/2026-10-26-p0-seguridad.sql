-- P0 seguridad / fiabilidad — Supabase "Yamas.AI" (fhqqdnehsjgnnqirsinu)
-- 26/10/2026. Bloques 1 y 2 APLICADOS (migración
-- yamas_send_p0_wamid_unico_y_envio_iniciado; el índice se creó sin CONCURRENTLY
-- porque la tabla tenía 2 filas). Bloques 3 a 6 pendientes. Cada bloque es
-- independiente y reversible (el rollback va comentado debajo de cada uno).
-- Aplicar por bloques, en el SQL Editor o con apply_migration, después del OK.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) Idempotencia de envíos: un wamid se registra una sola vez.
--    Hoy yamas_send_mensajes no tiene unique sobre wamid; el workflow de envío
--    hace INSERT sin ON CONFLICT y un reintento del scheduler duplica filas.
--    Chequeo previo (debe dar 0 filas antes de crear el índice):
--      SELECT wamid, count(*) FROM yamas_send_mensajes
--       WHERE wamid IS NOT NULL AND wamid <> '' GROUP BY 1 HAVING count(*) > 1;
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_yamas_send_mensajes_wamid
  ON public.yamas_send_mensajes (wamid)
  WHERE wamid IS NOT NULL AND wamid <> '';
-- rollback: DROP INDEX CONCURRENTLY IF EXISTS public.uq_yamas_send_mensajes_wamid;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) Doble envío de campañas: el envío solo arranca si logra pasar la campaña
--    de 'enviando' a 'en curso' (claim atómico). El scheduler ya hace
--    programada → enviando con UPDATE condicional; falta el segundo cerrojo en
--    el workflow de envío (ver docs/n8n-cambios-p0.md, nodo 0_resolver_servidor).
--    Se usa una columna nueva y NO un status nuevo: "enviando" aparece en 12
--    lugares de la app (Campanas.tsx, write.ts, creditos/reserva.ts, mcp/tools.ts)
--    y un estado nuevo los rompería.
ALTER TABLE public.yamas_send_campanas ADD COLUMN IF NOT EXISTS envio_iniciado_at timestamptz;
-- rollback: ALTER TABLE public.yamas_send_campanas DROP COLUMN IF EXISTS envio_iniciado_at;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) Tablas con RLS activa pero SIN políticas y con GRANT a anon: hoy el rol
--    anon no puede leerlas (RLS sin política = nada), pero el grant sobra y si
--    alguien agrega una política permisiva quedan abiertas. Solo las escribe
--    n8n con service role.
REVOKE ALL ON TABLE public.yamas_send_error_log        FROM anon;
REVOKE ALL ON TABLE public.yamas_send_lid_map          FROM anon;
REVOKE ALL ON TABLE public.yamas_send_templates_empresa FROM anon;
-- rollback: GRANT ALL ON TABLE public.<tabla> TO anon;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4) RPC SECURITY DEFINER ejecutables por anon (8 funciones yamas_send_*).
--    Todas validan auth.uid() adentro y devuelven 'sin_sesion' a anon, así que
--    hoy no filtran datos, pero no tienen por qué ser llamables sin sesión.
--    yamas_send_info_invitacion(p_token) SÍ la usa la pantalla pública de
--    invitación antes del login: NO revocarla.
REVOKE EXECUTE ON FUNCTION public.yamas_send_consumir_credito()                       FROM anon;
REVOKE EXECUTE ON FUNCTION public.yamas_send_crear_orden_compra(text)                  FROM anon;
REVOKE EXECUTE ON FUNCTION public.yamas_send_empresa_actualizar_datos_negocio(text,text,text,text,text,text,text,text,jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.yamas_send_etiquetar_mensaje()                       FROM anon;
REVOKE EXECUTE ON FUNCTION public.yamas_send_liberar_reserva_campana()                 FROM anon;
REVOKE EXECUTE ON FUNCTION public.yamas_send_reservar_creditos(uuid,integer)           FROM anon;
-- yamas_send_precios_creditos() la llama lib/creditos/precio.ts (puede correr
-- antes del login, en la pantalla de packs): se deja como está.
-- rollback: GRANT EXECUTE ON FUNCTION public.<fn>(<args>) TO anon;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5) yamas_inmo_* sin RLS (7 tablas: aprendizaje, clientes_chat_histories,
--    clientes_cobros, clientes_cobros_chat_histories, clientes_pedidos,
--    clientes_tokko, yamas_inmos_clientes_chat_histories) con GRANT ALL a
--    authenticated: cualquier usuario logueado de YamaSend puede leer y borrar
--    TODO (son tablas de Yamas Inmo, otro producto, en la misma base).
--    Activar RLS sin políticas las deja accesibles solo por service role. ANTES
--    confirmar con los workflows de Yamas Inmo que ninguno las toca con anon
--    key / usuario autenticado (los n8n usan service role: no les afecta).
-- ALTER TABLE public.yamas_inmo_aprendizaje                     ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.yamas_inmo_clientes_chat_histories         ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.yamas_inmo_clientes_cobros                 ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.yamas_inmo_clientes_cobros_chat_histories  ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.yamas_inmo_clientes_pedidos                ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.yamas_inmo_clientes_tokko                  ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.yamas_inmos_clientes_chat_histories        ENABLE ROW LEVEL SECURITY;
-- rollback: ALTER TABLE public.<tabla> DISABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7) CONTROL DE CALIDAD DE ENVÍOS (regla fija de Pato, 26/10). Tablas nuevas, las
--    escribe solo n8n (RLS activa sin políticas). PENDIENTE DE APLICAR (el asistente
--    no tiene permiso para DDL vía apply_migration). rollback: DROP TABLE.
CREATE TABLE IF NOT EXISTS public.yamas_send_linea_salud (
  tenant_id        text PRIMARY KEY,
  semaforo         text NOT NULL CHECK (semaforo IN ('VERDE','AMARILLO','ROJO')),
  motivos          jsonb NOT NULL DEFAULT '[]'::jsonb,   -- mueven el semáforo
  avisos           jsonb NOT NULL DEFAULT '[]'::jsonb,   -- informativos
  saldo_usd        numeric,
  lineas           jsonb NOT NULL DEFAULT '[]'::jsonb,   -- [{tel, calidad, estado, limite, waba, review, restr}]
  muestra          integer,                              -- mensajes template medidos (últimos 100)
  entregados_pct   numeric,
  leidos_pct       numeric,
  fallidos_pct     numeric,
  errores          jsonb NOT NULL DEFAULT '{}'::jsonb,   -- {codigo: cantidad} (131049, 131047, 131026...)
  checked_at       timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.yamas_send_linea_salud ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.yamas_send_linea_salud IS
  'Semáforo de salud de la línea de WhatsApp por tenant (YCloud: saldo, phoneNumbers, businessAccounts, últimos mensajes). Lo escribe el workflow "YamaSend — Salud de líneas por tenant". ROJO = el envío no arranca.';

CREATE TABLE IF NOT EXISTS public.yamas_send_wa_verificados (
  telefono         text PRIMARY KEY,                     -- solo dígitos, con 549 para AR (igual que yamas_send_leads.telefono)
  registrado       boolean NOT NULL,                     -- true = tiene WhatsApp; false = no tiene
  verificado_at    timestamptz NOT NULL DEFAULT now(),
  origen_tenant    text,
  fuente           text NOT NULL DEFAULT 'walookup'
);
CREATE INDEX IF NOT EXISTS idx_yamas_send_wa_verificados_fecha ON public.yamas_send_wa_verificados (verificado_at);
ALTER TABLE public.yamas_send_wa_verificados ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.yamas_send_wa_verificados IS
  'Resultado de WA Lookup por teléfono (vigencia 7 días). exists:false NO se guarda (indeterminado). El envío descarta registrado=false y verifica los que no tienen fila vigente.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 6) Higiene (WARN del asesor): search_path fijo en 6 funciones yamas_send_*.
ALTER FUNCTION public.yamas_send_valor_util                    SET search_path = public, pg_temp;
ALTER FUNCTION public.yamas_send_array_texto                   SET search_path = public, pg_temp;
ALTER FUNCTION public.fn_yamas_send_mensajes_set_auth_user_id  SET search_path = public, pg_temp;
ALTER FUNCTION public.yamas_send_lead_texto_fts                SET search_path = public, pg_temp;
ALTER FUNCTION public.yamas_send_normalizar_etiquetas          SET search_path = public, pg_temp;
ALTER FUNCTION public.yamas_send_es_contacto_interno           SET search_path = public, pg_temp;
-- (si alguna está sobrecargada, hay que indicar la firma: ALTER FUNCTION f(text) ...)
-- rollback: ALTER FUNCTION public.<fn> RESET search_path;
