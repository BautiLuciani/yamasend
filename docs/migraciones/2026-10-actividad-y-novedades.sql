-- =====================================================================
-- Card "Actividad de WhatsApp" + avisos del sidebar (oct 2026)
-- Aplicadas en Supabase (proyecto Yamas.AI) vía migraciones:
--   yamas_send_actividad_whatsapp, yamas_send_novedades
-- Ambas resuelven el tenant con auth.uid() (patrón de
-- yamas_send_analisis_solicitar) y solo las puede ejecutar authenticated.
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
-- historial de mensajes, que se actualiza en tiempo real, y NO sobre
-- yamas_send_leads (que solo se refresca al re-analizar).
--  - escribieron: contactos distintos con al menos un mensaje ENTRANTE en el período
--  - mensajes:    mensajes entrantes en el período
--  - nuevos:      contactos cuyo PRIMER mensaje cae en el período (no usa
--                 created_at: la importación inicial crea todo de golpe)
-- Excluye los números de motor.numeros_internos activos (lista "excluidos
-- del motor"): no son clientes.
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
      WITH excl AS (
        SELECT ni.telefono FROM motor.numeros_internos ni
         WHERE ni.tenant_id = v_tenant AND ni.activo
      ), recientes AS (
        SELECT h.telefono, h.enviado_por_mi
          FROM public.yamas_send_mensajes_historico h
         WHERE h.tenant_id = v_tenant AND h.fecha > v_desde
           AND h.telefono IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM excl WHERE excl.telefono = h.telefono)
      )
      SELECT jsonb_build_object(
        'escribieron', (SELECT count(DISTINCT r.telefono) FROM recientes r WHERE NOT r.enviado_por_mi),
        'mensajes',    (SELECT count(*) FROM recientes r WHERE NOT r.enviado_por_mi),
        'nuevos',      (SELECT count(*) FROM (SELECT DISTINCT r.telefono FROM recientes r) t
                         WHERE NOT EXISTS (
                           SELECT 1 FROM public.yamas_send_mensajes_historico p
                            WHERE p.tenant_id = v_tenant AND p.telefono = t.telefono
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
-- los avisos (puntitos) del sidebar. El cliente compara contra la última
-- vez que el usuario visitó cada sección. Solo eventos que NO dispara el
-- propio usuario con un click (esos ya los ve en el momento):
--   templates: Meta aprobó / rechazó un template
--   campanas:  una campaña terminó de enviarse / falló
--   contactos: llegó un contacto nuevo (te escribió alguien nuevo)
--   dashboard: respondieron un mensaje de campaña, o hubo un evento del
--              sistema (WhatsApp conectado/desconectado, análisis)
-- whatsapp_estado: para el aviso de atención si se desvinculó el celular.
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
      SELECT max(coalesce(t.aprobado_at, t.updated_at)) FROM public.yamas_send_templates t
       WHERE t.tenant_id = v_tenant AND t.status IN ('verificado', 'APPROVED')),
    'templates_rechazado_at', (
      SELECT max(t.updated_at) FROM public.yamas_send_templates t
       WHERE t.tenant_id = v_tenant AND t.status = 'rechazado'),
    'campanas_enviada_at', (
      SELECT max(coalesce(c.updated_at, c.enviado_at)) FROM public.yamas_send_campanas c
       WHERE c.tenant_id = v_tenant AND c.status = 'enviado'),
    'campanas_error_at', (
      SELECT max(c.updated_at) FROM public.yamas_send_campanas c
       WHERE c.tenant_id = v_tenant AND c.status = 'error'),
    'contactos_nuevo_at', (
      SELECT max(c.created_at) FROM public.yamas_send_contactos c
       WHERE c.tenant_id = v_tenant
         AND NOT EXISTS (SELECT 1 FROM motor.numeros_internos ni
                          WHERE ni.tenant_id = v_tenant AND ni.activo AND ni.telefono = c.telefono)),
    'dashboard_respuesta_at', (
      SELECT max(m.respondido_at) FROM public.yamas_send_mensajes m
       WHERE m.tenant_id = v_tenant),
    'dashboard_sistema_at', (
      SELECT max(a.created_at) FROM public.yamas_send_activity_log a
       WHERE a.tenant_id = v_tenant
         AND a.tipo IN ('whatsapp_conectado', 'whatsapp_desconectado', 'contactos_importados', 'ia_analisis')),
    'whatsapp_estado', (
      SELECT s.estado FROM public.yamas_send_waha_sessions s
       WHERE s.tenant_id = v_tenant ORDER BY s.updated_at DESC NULLS LAST LIMIT 1)
  );
END $function$;

REVOKE ALL ON FUNCTION public.yamas_send_novedades() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.yamas_send_novedades() TO authenticated;
