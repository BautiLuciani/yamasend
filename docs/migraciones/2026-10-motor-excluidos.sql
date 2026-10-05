-- =====================================================================
-- Lista de contactos excluidos del Motor (oct 2026)
-- Aplicada en Supabase (proyecto Yamas.AI) vía migraciones:
--   yamas_send_motor_excluidos_listar, yamas_send_motor_excluir
-- Reutiliza motor.numeros_internos, que el motor ya respetaba:
--   - motor.calcular_candidatos la chequea EN VIVO (E_INTERNO)
--   - motor.segmentar_yamasend_incremental sella episodios (es_interno /
--     'filtrado_interno'), por eso al volver a incluir se des-sellan.
-- Nota: motor.numeros_internos.telefono_norm es columna GENERADA.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.yamas_send_motor_excluidos()
RETURNS TABLE(telefono text, nombre text, motivo text, categoria text, excluido_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT ni.telefono,
         coalesce(nullif(c.nombre, ''), nullif(c.push_name, '')) AS nombre,
         ni.motivo, ni.categoria, ni.created_at
    FROM motor.numeros_internos ni
    LEFT JOIN public.yamas_send_contactos c
      ON c.tenant_id = ni.tenant_id AND c.telefono = ni.telefono
   WHERE ni.activo
     AND ni.tenant_id = (SELECT cl.tenant_id FROM public.yamas_inmo_clientes cl
                          WHERE cl.auth_user_id = auth.uid() LIMIT 1)
   ORDER BY ni.created_at DESC;
$function$;

REVOKE ALL ON FUNCTION public.yamas_send_motor_excluidos() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.yamas_send_motor_excluidos() TO authenticated;


CREATE OR REPLACE FUNCTION public.yamas_send_motor_excluir(p_telefonos text[], p_excluir boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
-- Agrega (p_excluir=true) o saca (false) contactos de la lista de números
-- que el Motor no tiene en cuenta (motor.numeros_internos), para el tenant
-- logueado. Pensado para la acción "Excluir del motor" de Contactos
-- (ej: sucursales propias, proveedores, el equipo: no son clientes).
DECLARE
  v_tenant text;
  v_tels text[];
  v_validos text[];
  v_cambiados int := 0;
  v_recalc_ok boolean := true;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_autenticado');
  END IF;

  SELECT c.tenant_id INTO v_tenant FROM public.yamas_inmo_clientes c
   WHERE c.auth_user_id = auth.uid() LIMIT 1;
  IF v_tenant IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'sin_tenant');
  END IF;

  -- Mismo criterio que assertPermiso() de la app: las cuentas anteriores al
  -- sistema de roles (sin fila en yamas_send_miembros) tienen todo habilitado.
  IF EXISTS (SELECT 1 FROM public.yamas_send_miembros m WHERE m.auth_user_id = auth.uid())
     AND NOT public.yamas_send_tiene_permiso('importar_contactos') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'sin_permiso');
  END IF;

  SELECT array_agg(DISTINCT t) INTO v_tels
    FROM (SELECT regexp_replace(x, '\D', '', 'g') AS t
            FROM unnest(coalesce(p_telefonos, '{}'::text[])) x) s
   WHERE t <> '';

  IF v_tels IS NULL OR array_length(v_tels, 1) IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'sin_contactos');
  END IF;
  IF array_length(v_tels, 1) > 1000 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'demasiados_contactos');
  END IF;

  -- Solo números que realmente son contactos de este tenant.
  SELECT array_agg(t) INTO v_validos FROM unnest(v_tels) t
   WHERE EXISTS (SELECT 1 FROM public.yamas_send_contactos c WHERE c.tenant_id = v_tenant AND c.telefono = t)
      OR EXISTS (SELECT 1 FROM public.yamas_send_leads l WHERE l.tenant_id = v_tenant AND l.telefono = t)
      OR EXISTS (SELECT 1 FROM motor.numeros_internos ni WHERE ni.tenant_id = v_tenant AND ni.telefono = t);

  IF v_validos IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'sin_contactos');
  END IF;

  IF p_excluir THEN
    WITH up AS (
      INSERT INTO motor.numeros_internos AS ni
        (tenant_id, telefono, motivo, categoria, activo, nota)
      SELECT v_tenant, t, 'Excluido por el usuario desde Contactos', 'excluido_usuario', true, NULL
        FROM unnest(v_validos) t
      ON CONFLICT (tenant_id, telefono) DO UPDATE
        SET activo = true,
            motivo = excluded.motivo,
            categoria = excluded.categoria
        WHERE NOT ni.activo
      RETURNING 1
    )
    SELECT count(*) INTO v_cambiados FROM up;
  ELSE
    WITH up AS (
      UPDATE motor.numeros_internos ni SET activo = false
       WHERE ni.tenant_id = v_tenant AND ni.telefono = ANY (v_validos) AND ni.activo
      RETURNING 1
    )
    SELECT count(*) INTO v_cambiados FROM up;

    -- Des-sellar episodios: vuelven a pasar por el pipeline normal (el
    -- filtro estructural y la extracción los procesan en la próxima vuelta).
    UPDATE motor.episodios e
       SET es_interno = false,
           estado = CASE WHEN e.estado = 'filtrado_interno' THEN 'pendiente' ELSE e.estado END,
           updated_at = now()
     WHERE e.tenant_id = v_tenant AND e.telefono = ANY (v_validos)
       AND (e.es_interno OR e.estado = 'filtrado_interno');
  END IF;

  -- Recalcular el WHO para que el cambio se vea ya (y no recién cuando
  -- entre un mensaje nuevo). Si falla, la lista igual queda guardada.
  IF v_cambiados > 0 THEN
    BEGIN
      PERFORM motor.calcular_candidatos_v2(v_tenant, now(), 'v1');
    EXCEPTION WHEN others THEN
      v_recalc_ok := false;
    END;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'cambiados', v_cambiados,
    'ignorados', array_length(v_tels, 1) - array_length(v_validos, 1),
    'recalculo_ok', v_recalc_ok
  );
END $function$;

REVOKE ALL ON FUNCTION public.yamas_send_motor_excluir(text[], boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.yamas_send_motor_excluir(text[], boolean) TO authenticated;
