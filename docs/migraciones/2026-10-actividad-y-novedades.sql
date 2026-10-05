-- =====================================================================
-- Card "Actividad de WhatsApp" + avisos del sidebar (oct 2026) — vigente
-- Aplicadas en Supabase (proyecto Yamas.AI) vía migraciones:
--   yamas_send_actividad_whatsapp, yamas_send_actividad_whatsapp_v2_nuevos_entrantes,
--   yamas_send_novedades, yamas_send_novedades_v2_eventos,
--   yamas_send_novedades_v3_desvinculado
-- Ambas resuelven el tenant con auth.uid() (patrón de
-- yamas_send_analisis_solicitar) y solo las puede ejecutar authenticated.
-- La app las llama desde el navegador (cliente de Supabase con la sesión),
-- no con server actions, para no encolar polling delante de los clicks.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.yamas_send_actividad_whatsapp()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
-- Resumen de actividad de WhatsApp del tenant logueado para la card de
-- Contactos (reemplaza al viejo botón "Analizar"). Se calcula sobre el
-- historial de mensajes (tiempo real), no sobre yamas_send_leads.
--  - escribieron: contactos distintos con al menos un mensaje ENTRANTE en el período
--  - mensajes:    mensajes entrantes en el período
--  - nuevos:      contactos que te escribieron POR PRIMERA VEZ en el período
--                 (su primer mensaje de la historia es entrante y cae en el
--                 período; no cuenta a quien le escribiste vos primero)
-- Excluye los números de motor.numeros_internos activos (no son clientes).
DECLARE
  v_tenant text;
  v_res jsonb := '{}'::jsonb;
  v_horas int;
  v_desde timestamptz;
  v_clave text;
BEGIN
  IF auth.uid() IS NULL THEN RETURN NULL; END IF;
  SELECT c.tenant_id INTO v_tenant FROM public.yamas_inmo_clientes c
   WHERE c.auth_user_id = auth.uid() LIMIT 1;
  IF v_tenant IS NULL THEN RETURN NULL; END IF;

  FOR v_clave, v_horas IN SELECT * FROM (VALUES ('h24', 24), ('d7', 168)) t(k, h) LOOP
    v_desde := now() - make_interval(hours => v_horas);
    v_res := v_res || jsonb_build_object(v_clave, (
      WITH recientes AS (
        SELECT h.telefono, h.enviado_por_mi, h.fecha
          FROM public.yamas_send_mensajes_historico h
         WHERE h.tenant_id = v_tenant AND h.fecha > v_desde
           AND h.telefono IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM motor.numeros_internos ni
                            WHERE ni.tenant_id = v_tenant AND ni.activo AND ni.telefono = h.telefono)
      ), primero AS (
        SELECT DISTINCT ON (r.telefono) r.telefono, r.enviado_por_mi
          FROM recientes r
         ORDER BY r.telefono, r.fecha ASC
      )
      SELECT jsonb_build_object(
        'escribieron', (SELECT count(DISTINCT r.telefono) FROM recientes r WHERE NOT r.enviado_por_mi),
        'mensajes',    (SELECT count(*) FROM recientes r WHERE NOT r.enviado_por_mi),
        'nuevos',      (SELECT count(*) FROM primero pr
                         WHERE NOT pr.enviado_por_mi
                           AND NOT EXISTS (
                             SELECT 1 FROM public.yamas_send_mensajes_historico p
                              WHERE p.tenant_id = v_tenant AND p.telefono = pr.telefono
                                AND p.fecha <= v_desde))
      )
    ));
  END LOOP;

  RETURN v_res || jsonb_build_object('generado_at', now());
END $function$;

REVOKE ALL ON FUNCTION public.yamas_send_actividad_whatsapp() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.yamas_send_actividad_whatsapp() TO authenticated;


CREATE OR REPLACE FUNCTION public.yamas_send_novedades()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
-- Último momento en que pasó "algo nuevo" en cada sección del panel, para
-- los avisos (puntitos) del sidebar. Se basa en EVENTOS (log de actividad
-- que escribe n8n, primer mensaje entrante) y no en updated_at, que cambia
-- por cualquier edición y daba avisos falsos.
--   templates: Meta aprobó / rechazó (activity_log template_estado, n8n)
--   campanas:  campaña completada (activity_log campana_completada, n8n);
--              "error" si tuvo mensajes con error
--   contactos: alguien te escribió por primera vez (primer mensaje del
--              contacto, entrante, recibido en tiempo real: no importaciones)
--   dashboard: respondieron un mensaje de campaña, o se desvinculó el WhatsApp
-- whatsapp_desvinculado: hubo conexión y ya no está conectada (no cuenta
--   sesiones que nunca terminaron de vincularse).
DECLARE
  v_tenant text;
BEGIN
  IF auth.uid() IS NULL THEN RETURN NULL; END IF;
  SELECT c.tenant_id INTO v_tenant FROM public.yamas_inmo_clientes c
   WHERE c.auth_user_id = auth.uid() LIMIT 1;
  IF v_tenant IS NULL THEN RETURN NULL; END IF;

  RETURN jsonb_build_object(
    'ahora', now(),
    'templates_aprobado_at', (
      SELECT max(a.created_at) FROM public.yamas_send_activity_log a
       WHERE a.tenant_id = v_tenant AND a.tipo = 'template_estado'
         AND a.metadata->>'status' = 'verificado'),
    'templates_rechazado_at', (
      SELECT max(a.created_at) FROM public.yamas_send_activity_log a
       WHERE a.tenant_id = v_tenant AND a.tipo = 'template_estado'
         AND a.metadata->>'status' = 'rechazado'),
    'campanas_enviada_at', (
      SELECT max(a.created_at) FROM public.yamas_send_activity_log a
       WHERE a.tenant_id = v_tenant AND a.tipo = 'campana_completada'),
    'campanas_error_at', (
      SELECT max(a.created_at) FROM public.yamas_send_activity_log a
       WHERE a.tenant_id = v_tenant AND a.tipo = 'campana_completada'
         AND coalesce(nullif(a.metadata->>'mensajes_error', '')::int, 0) > 0),
    'contactos_nuevo_at', (
      SELECT max(h.created_at)
        FROM public.yamas_send_mensajes_historico h
       WHERE h.tenant_id = v_tenant
         AND NOT h.enviado_por_mi
         AND h.telefono IS NOT NULL
         AND h.fecha > now() - interval '7 days'
         -- recibido en tiempo real (una importación trae fechas viejas)
         AND h.created_at - h.fecha < interval '1 hour'
         -- es el primer mensaje que existe con ese contacto
         AND NOT EXISTS (SELECT 1 FROM public.yamas_send_mensajes_historico p
                          WHERE p.tenant_id = v_tenant AND p.telefono = h.telefono
                            AND p.fecha < h.fecha)
         AND NOT EXISTS (SELECT 1 FROM motor.numeros_internos ni
                          WHERE ni.tenant_id = v_tenant AND ni.activo AND ni.telefono = h.telefono)),
    'dashboard_respuesta_at', (
      SELECT max(m.respondido_at) FROM public.yamas_send_mensajes m
       WHERE m.tenant_id = v_tenant),
    'dashboard_sistema_at', (
      SELECT max(a.created_at) FROM public.yamas_send_activity_log a
       WHERE a.tenant_id = v_tenant AND a.tipo = 'whatsapp_desconectado'),
    'whatsapp_desvinculado', coalesce((
      SELECT s.estado <> 'conectada' AND (s.fecha_conexion IS NOT NULL OR s.fecha_desconexion IS NOT NULL OR s.ultimo_analisis_at IS NOT NULL)
        FROM public.yamas_send_waha_sessions s
       WHERE s.tenant_id = v_tenant ORDER BY s.updated_at DESC NULLS LAST LIMIT 1), false)
  );
END $function$;

REVOKE ALL ON FUNCTION public.yamas_send_novedades() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.yamas_send_novedades() TO authenticated;
