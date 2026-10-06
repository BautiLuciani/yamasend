-- Autocompleta "Datos de la empresa" con lo que la IA detectó en los chats.
--
-- Regla: solo se llenan celdas VACÍAS. Nunca se pisa algo que el usuario
-- escribió. Solo entra lo que tiene confianza >= 0.5.
--
-- Productos: solo entran solos cuando la lista está VACÍA (primera carga).
-- Después, los productos nuevos o con otro precio llegan a la app como
-- novedades para aceptar o ignorar (ver lib/perfil/novedades.ts).
--
-- Cada campo llenado queda marcado como 'aplicado' en
-- yamas_send_perfil_negocio.decisiones. Un campo ya marcado NO se vuelve a
-- llenar: si el usuario lo borra a propósito, queda vacío.
--
-- No toca cuentas que pertenecen a una organización: ahí los datos del negocio
-- los administra la empresa (ver yamas_send_mi_perfil_datos_negocio).
--
-- La función por tenant la llama el workflow n8n "Perfil del negocio (IA)" por
-- conexión directa a Postgres, y la versión sin argumentos la llama la app al
-- abrir Perfil (resuelve el tenant de la sesión).

create or replace function public.yamas_send_perfil_negocio_autocompletar(p_tenant text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_estado     text;
  v_perfil     jsonb;
  v_decisiones jsonb;
  v_user       uuid;
  v_campos     text[] := array['nombre_empresa','rubro','descripcion_negocio','publico_objetivo','zona_cobertura','diferenciales','tono_comunicacion'];
  c            text;
  v_nuevo      text;
  v_actual     text;
  v_dec        jsonb := '{}'::jsonb;
  v_llenados   text[] := '{}';
  v_prod       jsonb;
  v_agregar    jsonb;
  v_n_agregar  int := 0;
begin
  select p.estado, p.perfil, p.decisiones into v_estado, v_perfil, v_decisiones
  from public.yamas_send_perfil_negocio p
  where p.tenant_id = p_tenant;

  if v_estado is distinct from 'listo' then
    return jsonb_build_object('ok', false, 'error', 'sin_perfil_listo');
  end if;

  select c0.auth_user_id into v_user
  from public.yamas_inmo_clientes c0
  where c0.tenant_id = p_tenant
  limit 1;

  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'sin_cliente');
  end if;

  if exists (
    select 1 from public.yamas_send_miembros m
    where m.auth_user_id = v_user and m.org_id is not null and m.estado = 'activo'
  ) then
    return jsonb_build_object('ok', true, 'omitido', 'organizacion');
  end if;

  foreach c in array v_campos loop
    -- Ya se completó (o se decidió) antes: no se vuelve a llenar.
    if jsonb_exists(v_decisiones, c) then
      continue;
    end if;

    v_nuevo := nullif(trim(v_perfil -> c ->> 'valor'), '');
    if v_nuevo is null or coalesce((v_perfil -> c ->> 'confianza')::numeric, 0) < 0.5 then
      continue;
    end if;

    execute format(
      'select nullif(trim(coalesce(%I, '''')), '''') from public.yamas_inmo_clientes where auth_user_id = $1',
      c
    ) into v_actual using v_user;

    if v_actual is null then
      execute format('update public.yamas_inmo_clientes set %I = $1 where auth_user_id = $2', c)
        using v_nuevo, v_user;
      v_dec := v_dec || jsonb_build_object(c, 'aplicado');
      v_llenados := v_llenados || c;
    end if;
  end loop;

  select coalesce(productos, '[]'::jsonb) into v_prod
  from public.yamas_inmo_clientes where auth_user_id = v_user;

  if jsonb_array_length(v_prod) = 0 and not jsonb_exists(v_decisiones, 'productos') then
    select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('nombre', nombre, 'precio', precio, 'descripcion', descripcion))),
           count(*)
      into v_agregar, v_n_agregar
    from (
      select distinct on (k) k, nombre, precio, descripcion from (
        select
          regexp_replace(lower(translate(trim(p ->> 'nombre'), 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunaeiouun')), '\s+', ' ', 'g') as k,
          trim(p ->> 'nombre') as nombre,
          nullif(trim(p ->> 'precio'), '') as precio,
          nullif(trim(p ->> 'descripcion'), '') as descripcion,
          coalesce((p ->> 'confianza')::numeric, 0) as conf
        from jsonb_array_elements(coalesce(v_perfil -> 'productos', '[]'::jsonb)) p
      ) q
      where nombre <> '' and conf >= 0.5
      order by k, conf desc
      limit 200
    ) l;

    if v_agregar is not null and v_n_agregar > 0 then
      update public.yamas_inmo_clientes set productos = v_agregar where auth_user_id = v_user;
      v_dec := v_dec || jsonb_build_object('productos', 'aplicado');
    end if;
  end if;

  if v_dec <> '{}'::jsonb then
    update public.yamas_send_perfil_negocio
       set decisiones = decisiones || v_dec, updated_at = now()
     where tenant_id = p_tenant;
  end if;

  return jsonb_build_object('ok', true, 'campos', to_jsonb(v_llenados), 'productos_agregados', v_n_agregar);
end;
$$;

revoke all on function public.yamas_send_perfil_negocio_autocompletar(text) from public, anon, authenticated;

-- Versión para la app: resuelve el tenant de la sesión. Idempotente.
create or replace function public.yamas_send_perfil_autocompletar()
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare v_tenant text := public.yamas_send_etiquetas_tenant();
begin
  if v_tenant is null then return jsonb_build_object('ok', false, 'error', 'sin_permiso'); end if;
  return public.yamas_send_perfil_negocio_autocompletar(v_tenant);
end;
$$;

revoke all on function public.yamas_send_perfil_autocompletar() from public, anon;
grant execute on function public.yamas_send_perfil_autocompletar() to authenticated;
