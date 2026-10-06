-- Etiquetas de contactos (acumulables: cliente + eukanuba + nuevo).
--
-- Cada contacto (yamas_send_leads) tiene un arreglo de etiquetas. Una audiencia
-- por etiquetas es "todos los contactos que tengan TODAS estas etiquetas".
--
-- "cliente" es una etiqueta de SISTEMA: la pone sola la sincronización a quien
-- recibió un mensaje del negocio que confirma una compra o un pago ("gracias por
-- tu compra", "comprobante", ...). Si ese contacto nunca había escrito, todavía no
-- tenía registro en yamas_send_leads: se crea con TODO el análisis vacío, solo con
-- la etiqueta. Es "cliente y nada más".
--
-- Todo es aditivo: no modifica ni borra datos existentes.

alter table public.yamas_send_leads
  add column if not exists etiquetas text[] not null default '{}';

create index if not exists idx_yamas_send_leads_etiquetas
  on public.yamas_send_leads using gin (etiquetas);

-- Minúsculas, espacios simples, hasta 30 caracteres, sin símbolos raros.
create or replace function public.yamas_send_normalizar_etiquetas(p text[])
returns text[]
language sql
immutable
as $$
  select coalesce(array_agg(distinct t order by t), '{}')
  from (
    select left(regexp_replace(lower(trim(x)), '\s+', ' ', 'g'), 30) as t
    from unnest(coalesce(p, '{}')) x
  ) q
  where t <> '' and t ~ '^[[:alnum:] áéíóúüñ+._-]+$';
$$;

-- Tenant de quien llama. Helper interno: nadie lo ejecuta directo.
create or replace function public.yamas_send_etiquetas_tenant()
returns text
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select c.tenant_id from public.yamas_inmo_clientes c where c.auth_user_id = auth.uid() limit 1;
$$;
revoke all on function public.yamas_send_etiquetas_tenant() from public, anon, authenticated;

-- Sugerencias de etiquetas que el usuario ignoró (no se vuelven a ofrecer).
create table if not exists public.yamas_send_etiquetas_config (
  tenant_id  text primary key,
  ignoradas  text[] not null default '{}',
  updated_at timestamptz not null default now()
);
alter table public.yamas_send_etiquetas_config enable row level security;
drop policy if exists tenant_isolation_select on public.yamas_send_etiquetas_config;
create policy tenant_isolation_select on public.yamas_send_etiquetas_config
  for select to authenticated
  using (tenant_id in (select c.tenant_id from public.yamas_inmo_clientes c where c.auth_user_id = auth.uid()));

-- Agrega etiquetas a varios contactos del tenant (máximo 20 etiquetas por contacto).
create or replace function public.yamas_send_etiquetas_agregar(p_lead_ids uuid[], p_etiquetas text[])
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_tenant text := public.yamas_send_etiquetas_tenant();
  v_tags text[];
  n int;
begin
  if v_tenant is null then return jsonb_build_object('ok', false, 'error', 'sin_permiso'); end if;
  v_tags := public.yamas_send_normalizar_etiquetas(p_etiquetas);
  if cardinality(v_tags) = 0 or cardinality(v_tags) > 10 then
    return jsonb_build_object('ok', false, 'error', 'etiquetas_invalidas');
  end if;
  if cardinality(coalesce(p_lead_ids, '{}')) = 0 or cardinality(p_lead_ids) > 2000 then
    return jsonb_build_object('ok', false, 'error', 'sin_contactos');
  end if;

  update public.yamas_send_leads l
     set etiquetas = (select array_agg(distinct x order by x) from unnest(l.etiquetas || v_tags) x)
   where l.tenant_id = v_tenant
     and l.id = any(p_lead_ids)
     and not (l.etiquetas @> v_tags)
     and (select count(distinct x) from unnest(l.etiquetas || v_tags) x) <= 20;
  get diagnostics n = row_count;
  return jsonb_build_object('ok', true, 'afectados', n);
end;
$$;

-- Quita etiquetas. "cliente" no se quita a mano: la pone y mantiene el sistema.
create or replace function public.yamas_send_etiquetas_quitar(p_lead_ids uuid[], p_etiquetas text[])
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_tenant text := public.yamas_send_etiquetas_tenant();
  v_tags text[];
  n int;
begin
  if v_tenant is null then return jsonb_build_object('ok', false, 'error', 'sin_permiso'); end if;
  v_tags := public.yamas_send_normalizar_etiquetas(p_etiquetas);
  if cardinality(v_tags) = 0 then return jsonb_build_object('ok', false, 'error', 'etiquetas_invalidas'); end if;
  if v_tags @> array['cliente'] then return jsonb_build_object('ok', false, 'error', 'etiqueta_de_sistema'); end if;
  if cardinality(coalesce(p_lead_ids, '{}')) = 0 or cardinality(p_lead_ids) > 2000 then
    return jsonb_build_object('ok', false, 'error', 'sin_contactos');
  end if;

  update public.yamas_send_leads l
     set etiquetas = array(select x from unnest(l.etiquetas) x where x <> all(v_tags))
   where l.tenant_id = v_tenant and l.id = any(p_lead_ids) and l.etiquetas && v_tags;
  get diagnostics n = row_count;
  return jsonb_build_object('ok', true, 'afectados', n);
end;
$$;

-- Renombra una etiqueta en todos los contactos (si el nombre nuevo ya existe, se unifican).
create or replace function public.yamas_send_etiquetas_renombrar(p_de text, p_a text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_tenant text := public.yamas_send_etiquetas_tenant();
  v_de text; v_a text; n int;
begin
  if v_tenant is null then return jsonb_build_object('ok', false, 'error', 'sin_permiso'); end if;
  v_de := (public.yamas_send_normalizar_etiquetas(array[p_de]))[1];
  v_a  := (public.yamas_send_normalizar_etiquetas(array[p_a]))[1];
  if v_de is null or v_a is null then return jsonb_build_object('ok', false, 'error', 'etiquetas_invalidas'); end if;
  if v_de = 'cliente' or v_a = 'cliente' then return jsonb_build_object('ok', false, 'error', 'etiqueta_de_sistema'); end if;

  update public.yamas_send_leads l
     set etiquetas = (select array_agg(distinct case when x = v_de then v_a else x end order by case when x = v_de then v_a else x end) from unnest(l.etiquetas) x)
   where l.tenant_id = v_tenant and l.etiquetas @> array[v_de];
  get diagnostics n = row_count;
  return jsonb_build_object('ok', true, 'afectados', n);
end;
$$;

-- Elimina una etiqueta de todos los contactos.
create or replace function public.yamas_send_etiquetas_eliminar(p_etiqueta text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_tenant text := public.yamas_send_etiquetas_tenant();
  v_t text; n int;
begin
  if v_tenant is null then return jsonb_build_object('ok', false, 'error', 'sin_permiso'); end if;
  v_t := (public.yamas_send_normalizar_etiquetas(array[p_etiqueta]))[1];
  if v_t is null then return jsonb_build_object('ok', false, 'error', 'etiquetas_invalidas'); end if;
  if v_t = 'cliente' then return jsonb_build_object('ok', false, 'error', 'etiqueta_de_sistema'); end if;

  update public.yamas_send_leads l set etiquetas = array_remove(l.etiquetas, v_t)
   where l.tenant_id = v_tenant and l.etiquetas @> array[v_t];
  get diagnostics n = row_count;
  return jsonb_build_object('ok', true, 'afectados', n);
end;
$$;

-- Recuerda sugerencias ignoradas.
create or replace function public.yamas_send_etiquetas_ignorar_sugerencia(p_etiquetas text[])
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_tenant text := public.yamas_send_etiquetas_tenant();
  v_tags text[];
begin
  if v_tenant is null then return jsonb_build_object('ok', false, 'error', 'sin_permiso'); end if;
  v_tags := public.yamas_send_normalizar_etiquetas(p_etiquetas);
  if cardinality(v_tags) = 0 then return jsonb_build_object('ok', false, 'error', 'etiquetas_invalidas'); end if;

  insert into public.yamas_send_etiquetas_config as c (tenant_id, ignoradas)
  values (v_tenant, v_tags)
  on conflict (tenant_id) do update
    set ignoradas = (select coalesce(array_agg(distinct x), '{}') from unnest(c.ignoradas || v_tags) x),
        updated_at = now();
  return jsonb_build_object('ok', true);
end;
$$;

-- Cuándo apareció cada contacto por primera vez (para sugerir "nuevo").
create or replace function public.yamas_send_primer_contacto()
returns table (lead_id uuid, primer_mensaje_at timestamptz)
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
declare v_tenant text := public.yamas_send_etiquetas_tenant();
begin
  if v_tenant is null then return; end if;
  return query
  select l.id, min(h.fecha)
  from public.yamas_send_leads l
  join public.yamas_send_mensajes_historico h on h.contacto_id = l.contacto_id and h.tenant_id = l.tenant_id
  where l.tenant_id = v_tenant and l.activo is not false
  group by l.id;
end;
$$;

-- Sincroniza la etiqueta "cliente" de un tenant: la pone a quien recibió una
-- confirmación de compra o pago, y crea el contacto (sin análisis) si no existía.
-- Idempotente. No toca contactos cuyo nombre es el del propio negocio (otras sucursales).
create or replace function public.yamas_send_clientes_sincronizar_tenant(p_tenant text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_negocio   text;
  v_regex     text := '(gracias por (tu|su) compra|(tu|su) pedido (fue|ya|est[aá]|se|ingres|sali|lleg)|comprobante|pago (recibido|acreditado|confirmado)|compra (confirmada|realizada|exitosa)|(te|le) (confirmo|confirmamos) (el|tu|su) (pago|pedido|compra))';
  v_creados   int := 0;
  v_etiquetados int := 0;
  v_total     int := 0;
begin
  select nullif(trim(c.nombre_empresa), '') into v_negocio
  from public.yamas_inmo_clientes c where c.tenant_id = p_tenant limit 1;

  with compras as (
    select h.contacto_id
    from public.yamas_send_mensajes_historico h
    where h.tenant_id = p_tenant and h.enviado_por_mi and h.contacto_id is not null
      and h.contenido ~* v_regex
    group by h.contacto_id
  ), base as (
    select c.id as contacto_id, c.telefono, c.lid, coalesce(c.nombre, c.push_name) as nombre,
           (select max(x.fecha) from public.yamas_send_mensajes_historico x where x.contacto_id = c.id) as ultimo
    from compras k
    join public.yamas_send_contactos c on c.id = k.contacto_id and c.tenant_id = p_tenant
    where coalesce(c.activo, true) and c.telefono is not null
      and (v_negocio is null or length(v_negocio) < 4 or coalesce(c.nombre, '') not ilike '%' || v_negocio || '%')
  ), ins as (
    insert into public.yamas_send_leads (tenant_id, contacto_id, telefono, lid, nombre, etiquetas, ultimo_mensaje_at, activo)
    select p_tenant, b.contacto_id, b.telefono, b.lid, b.nombre, array['cliente'], b.ultimo, true
    from base b
    where not exists (
      select 1 from public.yamas_send_leads l
      where l.tenant_id = p_tenant
        and (l.contacto_id = b.contacto_id or l.telefono = b.telefono or (b.lid is not null and l.lid = b.lid))
    )
    on conflict (tenant_id, telefono) do nothing
    returning 1
  ), upd as (
    update public.yamas_send_leads l
       set etiquetas = (select array_agg(distinct x order by x) from unnest(l.etiquetas || array['cliente']) x)
      from base b
     where l.tenant_id = p_tenant
       and (l.contacto_id = b.contacto_id or l.telefono = b.telefono)
       and not (l.etiquetas @> array['cliente'])
    returning 1
  )
  select (select count(*) from ins), (select count(*) from upd), (select count(*) from base)
    into v_creados, v_etiquetados, v_total;

  return jsonb_build_object('ok', true, 'creados', v_creados, 'etiquetados', v_etiquetados, 'clientes', v_total);
end;
$$;
revoke all on function public.yamas_send_clientes_sincronizar_tenant(text) from public, anon, authenticated;

-- Versión para la app (resuelve el tenant de la sesión).
create or replace function public.yamas_send_clientes_sincronizar()
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare v_tenant text := public.yamas_send_etiquetas_tenant();
begin
  if v_tenant is null then return jsonb_build_object('ok', false, 'error', 'sin_permiso'); end if;
  return public.yamas_send_clientes_sincronizar_tenant(v_tenant);
end;
$$;

revoke all on function public.yamas_send_etiquetas_agregar(uuid[], text[]) from public, anon;
revoke all on function public.yamas_send_etiquetas_quitar(uuid[], text[]) from public, anon;
revoke all on function public.yamas_send_etiquetas_renombrar(text, text) from public, anon;
revoke all on function public.yamas_send_etiquetas_eliminar(text) from public, anon;
revoke all on function public.yamas_send_etiquetas_ignorar_sugerencia(text[]) from public, anon;
revoke all on function public.yamas_send_primer_contacto() from public, anon;
revoke all on function public.yamas_send_clientes_sincronizar() from public, anon;
grant execute on function public.yamas_send_etiquetas_agregar(uuid[], text[]) to authenticated;
grant execute on function public.yamas_send_etiquetas_quitar(uuid[], text[]) to authenticated;
grant execute on function public.yamas_send_etiquetas_renombrar(text, text) to authenticated;
grant execute on function public.yamas_send_etiquetas_eliminar(text) to authenticated;
grant execute on function public.yamas_send_etiquetas_ignorar_sugerencia(text[]) to authenticated;
grant execute on function public.yamas_send_primer_contacto() to authenticated;
grant execute on function public.yamas_send_clientes_sincronizar() to authenticated;
