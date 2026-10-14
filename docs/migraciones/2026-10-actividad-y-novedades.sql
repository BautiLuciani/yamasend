-- =====================================================================
-- Card "Actividad de WhatsApp" + avisos del sidebar (oct 2026) — vigente
-- Aplicadas en Supabase (proyecto Yamas.AI) vía migraciones:
--   yamas_send_actividad_whatsapp, yamas_send_actividad_whatsapp_v2_nuevos_entrantes,
--   yamas_send_novedades, yamas_send_novedades_v2_eventos,
--   yamas_send_novedades_v3_desvinculado, yamas_send_novedades_v4_estados
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
-- Datos para los avisos (puntitos) del sidebar. v4: para templates y
-- campañas devuelve el ESTADO ACTUAL de cada uno (categorizado) y el
-- navegador lo compara contra la "foto" de la última visita: así detecta
-- "Meta lo aprobó/rechazó" o "la campaña programada terminó" sin depender de
-- qué workflow cambie el estado ni de updated_at (que cambia por cualquier
-- edición) y sin cambios de esquema.
--   templates_estados: {id: aprobado|rechazado|pendiente}
--   campanas_estados:  {id: enviado|error|pendiente}, solo campañas que no
--                      dispara el usuario en el momento (programadas o del motor)
--   contactos_nuevo_at: alguien te escribió por primera vez (primer mensaje
--                      del contacto, entrante, recibido en tiempo real)
--   dashboard_respuesta_at: respondieron un mensaje de campaña
--   whatsapp_desvinculado: hubo conexión y ya no está conectada
DECLARE
  v_tenant text;
BEGIN
  IF auth.uid() IS NULL THEN RETURN NULL; END IF;
  SELECT c.tenant_id INTO v_tenant FROM public.yamas_inmo_clientes c
   WHERE c.auth_user_id = auth.uid() LIMIT 1;
  IF v_tenant IS NULL THEN RETURN NULL; END IF;

  RETURN jsonb_build_object(
    'ahora', now(),
    'templates_estados', coalesce((
      SELECT jsonb_object_agg(t.id::text,
               CASE WHEN upper(coalesce(t.status, '')) IN ('VERIFICADO', 'APPROVED') THEN 'aprobado'
                    WHEN upper(coalesce(t.status, '')) IN ('RECHAZADO', 'REJECTED') THEN 'rechazado'
                    ELSE 'pendiente' END)
        FROM (SELECT id, status FROM public.yamas_send_templates
               WHERE tenant_id = v_tenant
               ORDER BY created_at DESC NULLS LAST LIMIT 500) t), '{}'::jsonb),
    'campanas_estados', coalesce((
      SELECT jsonb_object_agg(c.id::text,
               CASE WHEN c.status = 'enviado' THEN 'enviado'
                    WHEN c.status = 'error' THEN 'error'
                    ELSE 'pendiente' END)
        FROM (SELECT id, status FROM public.yamas_send_campanas
               WHERE tenant_id = v_tenant
                 AND (fecha_programada IS NOT NULL OR coalesce(origen, 'manual') <> 'manual')
                 AND status <> 'cancelado'
               ORDER BY created_at DESC NULLS LAST LIMIT 500) c), '{}'::jsonb),
    'contactos_nuevo_at', (
      SELECT max(h.created_at)
        FROM public.yamas_send_mensajes_historico h
       WHERE h.tenant_id = v_tenant
         AND NOT h.enviado_por_mi
         AND h.telefono IS NOT NULL
         AND h.fecha > now() - interval '7 days'
         AND h.created_at - h.fecha < interval '1 hour'
         AND NOT EXISTS (SELECT 1 FROM public.yamas_send_mensajes_historico p
                          WHERE p.tenant_id = v_tenant AND p.telefono = h.telefono
                            AND p.fecha < h.fecha)
         AND NOT EXISTS (SELECT 1 FROM motor.numeros_internos ni
                          WHERE ni.tenant_id = v_tenant AND ni.activo AND ni.telefono = h.telefono)),
    'dashboard_respuesta_at', (
      SELECT max(m.respondido_at) FROM public.yamas_send_mensajes m
       WHERE m.tenant_id = v_tenant),
    'whatsapp_desvinculado', coalesce((
      SELECT s.estado <> 'conectada' AND (s.fecha_conexion IS NOT NULL OR s.fecha_desconexion IS NOT NULL OR s.ultimo_analisis_at IS NOT NULL)
        FROM public.yamas_send_waha_sessions s
       WHERE s.tenant_id = v_tenant ORDER BY s.updated_at DESC NULLS LAST LIMIT 1), false)
  );
END $function$;

REVOKE ALL ON FUNCTION public.yamas_send_novedades() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.yamas_send_novedades() TO authenticated;
