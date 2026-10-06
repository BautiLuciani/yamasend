-- =====================================================================
-- Nombre manual de contactos (oct 2026)
-- Aplicada en Supabase (proyecto Yamas.AI) vía migración
--   yamas_send_nombre_manual_contactos
--
-- Permite que el usuario le ponga nombre a un contacto (sobre todo a los
-- "Sin nombre"). Mismo criterio que temperatura_manual: el ajuste del
-- usuario se guarda aparte y SIEMPRE gana sobre lo que traiga WhatsApp o el
-- análisis de chats.
--
-- Por qué en las dos tablas:
--   - yamas_send_leads.nombre    → pantalla Contactos, audiencias, listar/buscar.
--   - yamas_send_contactos.nombre → IA y Motor (chat_*, motor.*).
--
-- Por qué con trigger: el análisis (yamas_send_analisis_cerrar_item) y la
-- sincronización (yamas_send_upsert_contacto) vuelven a escribir "nombre".
-- El trigger repone nombre = nombre_manual en cada escritura, así no hay que
-- tocar ninguna de esas funciones ni los workflows de n8n.
-- =====================================================================

ALTER TABLE public.yamas_send_leads     ADD COLUMN IF NOT EXISTS nombre_manual text;
ALTER TABLE public.yamas_send_contactos ADD COLUMN IF NOT EXISTS nombre_manual text;

COMMENT ON COLUMN public.yamas_send_leads.nombre_manual IS
  'Nombre puesto por el usuario. Si no es null, el trigger trg_*_nombre_manual lo copia a nombre en cada escritura.';
COMMENT ON COLUMN public.yamas_send_contactos.nombre_manual IS
  'Nombre puesto por el usuario. Si no es null, el trigger trg_*_nombre_manual lo copia a nombre en cada escritura.';

CREATE OR REPLACE FUNCTION public.yamas_send_respetar_nombre_manual()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.nombre_manual IS NOT NULL AND btrim(NEW.nombre_manual) <> '' THEN
    NEW.nombre := NEW.nombre_manual;
  END IF;
  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS trg_leads_nombre_manual ON public.yamas_send_leads;
CREATE TRIGGER trg_leads_nombre_manual
  BEFORE INSERT OR UPDATE OF nombre, nombre_manual ON public.yamas_send_leads
  FOR EACH ROW EXECUTE FUNCTION public.yamas_send_respetar_nombre_manual();

DROP TRIGGER IF EXISTS trg_contactos_nombre_manual ON public.yamas_send_contactos;
CREATE TRIGGER trg_contactos_nombre_manual
  BEFORE INSERT OR UPDATE OF nombre, nombre_manual ON public.yamas_send_contactos
  FOR EACH ROW EXECUTE FUNCTION public.yamas_send_respetar_nombre_manual();


-- Renombra un contacto del tenant logueado (desde la ficha del contacto).
CREATE OR REPLACE FUNCTION public.yamas_send_renombrar_contacto(p_lead_id uuid, p_nombre text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_tenant text;
  v_nombre text;
  v_lead public.yamas_send_leads;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_autenticado');
  END IF;

  SELECT c.tenant_id INTO v_tenant FROM public.yamas_inmo_clientes c
   WHERE c.auth_user_id = auth.uid() LIMIT 1;
  IF v_tenant IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'sin_tenant');
  END IF;

  -- Mismo criterio que assertPermiso() y que yamas_send_motor_excluir: las
  -- cuentas sin fila en yamas_send_miembros tienen todo habilitado.
  IF EXISTS (SELECT 1 FROM public.yamas_send_miembros m WHERE m.auth_user_id = auth.uid())
     AND NOT public.yamas_send_tiene_permiso('importar_contactos') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'sin_permiso');
  END IF;

  v_nombre := left(btrim(regexp_replace(coalesce(p_nombre, ''), '\s+', ' ', 'g')), 80);
  IF v_nombre = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'nombre_vacio');
  END IF;

  SELECT * INTO v_lead FROM public.yamas_send_leads l
   WHERE l.id = p_lead_id AND l.tenant_id = v_tenant;
  IF v_lead.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_encontrado');
  END IF;

  UPDATE public.yamas_send_leads SET nombre_manual = v_nombre
   WHERE id = v_lead.id;

  -- El mismo contacto en la tabla que usan la IA y el Motor.
  UPDATE public.yamas_send_contactos c SET nombre_manual = v_nombre, updated_at = now()
   WHERE c.tenant_id = v_tenant
     AND (c.id = v_lead.contacto_id
          OR (v_lead.telefono IS NOT NULL AND c.telefono = v_lead.telefono)
          OR (v_lead.lid IS NOT NULL AND c.lid = v_lead.lid));

  RETURN jsonb_build_object('ok', true, 'nombre', v_nombre);
END $function$;

REVOKE ALL ON FUNCTION public.yamas_send_renombrar_contacto(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.yamas_send_renombrar_contacto(uuid, text) TO authenticated;
