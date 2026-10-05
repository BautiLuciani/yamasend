-- =====================================================================
-- Lista de contactos excluidos del Motor (oct 2026) — versión vigente
-- Aplicada en Supabase (proyecto Yamas.AI) vía migraciones:
--   yamas_send_motor_excluidos_listar, yamas_send_motor_excluir,
--   yamas_send_motor_excluir_fix_telefono_norm,
--   yamas_send_motor_excluidos_v2_solo_usuario, yamas_send_motor_excluir_v2
--
-- Reutiliza motor.numeros_internos, que el motor ya respetaba:
--   - motor.calcular_candidatos la chequea EN VIVO (E_INTERNO)
--   - motor.segmentar_yamasend_incremental sella episodios (es_interno /
--     'filtrado_interno'): al excluir se sellan los pendientes y al volver
--     a incluir se des-sellan (si no, quedaría excluido para siempre).
-- Desde la app solo se ven/tocan las filas categoria 'excluido_usuario';
-- los números internos cargados por un admin (ej. 'equipo') no.
-- Nota: motor.numeros_internos.telefono_norm es columna GENERADA.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.yamas_send_motor_excluidos()
RETURNS TABLE(telefono text, nombre text, motivo text, categoria text, excluido_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  -- Contactos que el USUARIO excluyó del Motor desde Contactos
  -- (categoria 'excluido_usuario'). Los números internos cargados por un
  -- admin (ej. categoria 'equipo') no se listan ni se pueden tocar desde acá.
  SELECT ni.telefono,
         coalesce(nullif(c.nombre, ''), nullif(c.push_name, '')) AS nombre,
         ni.motivo, ni.categoria, ni.created_at
    FROM motor.numeros_internos ni
    LEFT JOIN public.yamas_send_contactos c
      ON c.tenant_id = ni.tenant_id AND c.telefono = ni.telefono
   WHERE ni.activo
     AND ni.categoria = 'excluido_usuario'
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
-- logueado. Ver docs/migraciones/2026-10-motor-excluidos.sql en el repo.
-- v2: solo toca filas del usuario (categoria 'excluido_usuario'); al
-- excluir también frena los episodios pendientes (sin gastar extracción).
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

    -- Frenar episodios pendientes: mismo sellado que hace la segmentación
    -- con un número interno, para no gastar extracción con IA en ellos.
    UPDATE motor.episodios e
       SET es_interno = true,
           estado = 'filtrado_interno',
           updated_at = now()
     WHERE e.tenant_id = v_tenant AND e.telefono = ANY (v_validos)
       AND e.estado = 'pendiente';
  ELSE
    WITH up AS (
      UPDATE motor.numeros_internos ni SET activo = false
       WHERE ni.tenant_id = v_tenant AND ni.telefono = ANY (v_validos) AND ni.activo
         AND ni.categoria = 'excluido_usuario'
      RETURNING ni.telefono
    ), n AS (SELECT array_agg(telefono) AS tels, count(*) AS c FROM up)
    SELECT n.c, coalesce(n.tels, '{}'::text[]) INTO v_cambiados, v_validos FROM n;

    -- Des-sellar episodios SOLO de los que efectivamente se re-incluyeron.
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
    'recalculo_ok', v_recalc_ok
  );
END $function$;

REVOKE ALL ON FUNCTION public.yamas_send_motor_excluir(text[], boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.yamas_send_motor_excluir(text[], boolean) TO authenticated;
