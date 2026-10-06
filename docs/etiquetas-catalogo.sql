-- Catálogo de etiquetas: permite CREAR una etiqueta personalizada antes de
-- ponérsela a algún contacto (con solo yamas_send_leads.etiquetas, una etiqueta
-- existe únicamente mientras algún contacto la tenga).
--
-- La lista de etiquetas que ve el usuario es la unión del catálogo y las que
-- están en uso. Renombrar y eliminar mantienen el catálogo al día.
-- Aditivo: no modifica datos existentes.

create table if not exists public.yamas_send_etiquetas_catalogo (
  tenant_id  text not null,
  nombre     text not null,
  created_at timestamptz not null default now(),
  primary key (tenant_id, nombre)
);
alter table public.yamas_send_etiquetas_catalogo enable row level security;
drop policy if exists tenant_isolation_select on public.yamas_send_etiquetas_catalogo;
create policy tenant_isolation_select on public.yamas_send_etiquetas_catalogo
  for select to authenticated
  using (tenant_id in (select c.tenant_id from public.yamas_inmo_clientes c where c.auth_user_id = auth.uid()));

-- Crea una etiqueta (máximo 100 por cuenta). "cliente" es del sistema.
create or replace function public.yamas_send_etiquetas_crear(p_nombre text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_tenant text := public.yamas_send_etiquetas_tenant();
  v_n text;
begin
  if v_tenant is null then return jsonb_build_object('ok', false, 'error', 'sin_permiso'); end if;
  v_n := (public.yamas_send_normalizar_etiquetas(array[p_nombre]))[1];
  if v_n is null then return jsonb_build_object('ok', false, 'error', 'etiquetas_invalidas'); end if;
  if v_n = 'cliente' then return jsonb_build_object('ok', false, 'error', 'etiqueta_de_sistema'); end if;
  if (select count(*) from public.yamas_send_etiquetas_catalogo where tenant_id = v_tenant) >= 100 then
    return jsonb_build_object('ok', false, 'error', 'demasiadas_etiquetas');
  end if;

  insert into public.yamas_send_etiquetas_catalogo (tenant_id, nombre)
  values (v_tenant, v_n)
  on conflict do nothing;
  return jsonb_build_object('ok', true, 'nombre', v_n);
end;
$$;

-- Renombrar: también en el catálogo (y funciona con etiquetas sin contactos).
create or replace function public.yamas_send_etiquetas_renombrar(p_de text, p_a text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_tenant text := public.yamas_send_etiquetas_tenant();
  v_de text; v_a text; n int; en_catalogo boolean;
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

  select exists (select 1 from public.yamas_send_etiquetas_catalogo where tenant_id = v_tenant and nombre = v_de) into en_catalogo;
  if n = 0 and not en_catalogo then return jsonb_build_object('ok', false, 'error', 'no_existe'); end if;

  delete from public.yamas_send_etiquetas_catalogo where tenant_id = v_tenant and nombre = v_de;
  insert into public.yamas_send_etiquetas_catalogo (tenant_id, nombre) values (v_tenant, v_a) on conflict do nothing;
  return jsonb_build_object('ok', true, 'afectados', n);
end;
$$;

-- Eliminar: de todos los contactos y del catálogo.
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
  delete from public.yamas_send_etiquetas_catalogo where tenant_id = v_tenant and nombre = v_t;
  return jsonb_build_object('ok', true, 'afectados', n);
end;
$$;

revoke all on function public.yamas_send_etiquetas_crear(text) from public, anon;
revoke all on function public.yamas_send_etiquetas_renombrar(text, text) from public, anon;
revoke all on function public.yamas_send_etiquetas_eliminar(text) from public, anon;
grant execute on function public.yamas_send_etiquetas_crear(text) to authenticated;
grant execute on function public.yamas_send_etiquetas_renombrar(text, text) to authenticated;
grant execute on function public.yamas_send_etiquetas_eliminar(text) to authenticated;
