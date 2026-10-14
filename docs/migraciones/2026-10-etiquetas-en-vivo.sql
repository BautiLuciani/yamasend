-- =====================================================================
-- Etiquetas en vivo por producto (oct 2026) — NO APLICADA TODAVÍA
--
-- Hoy una etiqueta de producto ("eukanuba", "royal canin") se aplica a los
-- contactos que ya hablaron del tema en el momento en que alguien acepta la
-- sugerencia. Esto la mantiene VIVA: cuando entra un mensaje nuevo de un
-- contacto que menciona el producto, la etiqueta se le pone en el acto.
--
-- Cómo funciona (todo en la base, sin n8n ni IA, en milisegundos):
--   yamas_send_etiquetas_auto          reglas: etiqueta + frases que la activan.
--   yamas_send_etiquetas_auto_sincronizar_tenant
--       arma las reglas desde el catálogo de productos del negocio: una frase
--       del catálogo (palabra o par de palabras) se vuelve regla SOLO si ya
--       existe como etiqueta del tenant (la creó o la aceptó alguien) y no
--       fue ignorada. Agrega variantes tipográficas ("ukanuba").
--   trg_etiquetar_mensaje              AFTER INSERT en el historial: mira los
--       mensajes ENTRANTES de las últimas 24 h y etiqueta al contacto.
--
-- Cuidados:
--  * Solo mensajes entrantes y recientes: importar historial viejo (el sync
--    carga miles) NO etiqueta con mensajes de hace meses.
--  * Una etiqueta que el usuario ignoró (yamas_send_etiquetas_config.ignoradas)
--    no se vuelve regla.
--  * Respeta el tope de 20 etiquetas por contacto.
--  * Nunca rompe el ingreso de mensajes: el trigger atrapa cualquier error.
--  * El contacto que escribe y todavía no tenía fila de lead se crea "sin
--    analizar" (igual que hace la sincronización de clientes) para que la
--    etiqueta no se pierda hasta el próximo análisis.
-- =====================================================================

create table if not exists public.yamas_send_etiquetas_auto (
  tenant_id  text not null,
  etiqueta   text not null,
  frases     text[] not null,            -- ya normalizadas: minúsculas, sin acentos
  activa     boolean not null default true,
  origen     text not null default 'producto',
  updated_at timestamptz not null default now(),
  primary key (tenant_id, etiqueta)
);

alter table public.yamas_send_etiquetas_auto enable row level security;
create policy etiquetas_auto_select on public.yamas_send_etiquetas_auto
  for select to authenticated
  using (tenant_id in (select c.tenant_id from public.yamas_inmo_clientes c where c.auth_user_id = auth.uid()));
-- Escribe solo la función de sincronización (security definer).

-- Texto de un mensaje, listo para comparar: minúsculas, sin acentos, sin símbolos.
create or replace function public.yamas_send_texto_normalizado(p text)
returns text language sql immutable
set search_path to 'public', 'pg_temp'
as $$
  select ' ' || btrim(regexp_replace(lower(public.unaccent(coalesce(p, ''))), '[^a-z0-9 ]+', ' ', 'g')) || ' ';
$$;

-- Frase + variantes tipográficas simples (primera letra de más o de menos:
-- "eukanuba" / "ukanuba"). Largo mínimo para no generar ruido.
create or replace function public.yamas_send_frase_variantes(p_frase text)
returns text[] language plpgsql immutable
set search_path to 'public', 'pg_temp'
as $$
declare
  v_base text := btrim(regexp_replace(lower(public.unaccent(p_frase)), '[^a-z0-9 ]+', ' ', 'g'));
  v_out  text[] := array[v_base];
begin
  if v_base !~ ' ' and length(v_base) >= 7 then
    v_out := v_out || substr(v_base, 2);                 -- eukanuba -> ukanuba
    v_out := v_out || regexp_replace(v_base, '^e', '');  -- (no-op si no empieza con e)
  end if;
  return (select array_agg(distinct x) from unnest(v_out) x where length(x) >= 4);
end;
$$;

create or replace function public.yamas_send_etiquetas_auto_sincronizar_tenant(p_tenant text)
returns jsonb
language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_stop      text[] := array['para','con','sin','por','los','las','una','uno','del','que','pack','kilo','kilos',
    'gramos','unidad','unidades','adulto','adultos','cachorro','cachorros','pequeno','pequena','pequenos',
    'mediano','mediana','grande','grandes','gigante','small','medium','maxi','mini','puppy','junior',
    'senior','premium','super','especial','natural','producto','productos','alimento','alimentos',
    'comida','articulo','articulos','accesorio','accesorios'];
  v_ignoradas text[];
  v_n         int := 0;
begin
  select coalesce(c.ignoradas, '{}') into v_ignoradas
    from public.yamas_send_etiquetas_config c where c.tenant_id = p_tenant;
  v_ignoradas := coalesce(v_ignoradas, '{}');

  with prod as (
    select public.yamas_send_texto_normalizado(p ->> 'nombre') as t
      from public.yamas_inmo_clientes c,
           lateral jsonb_array_elements(case when jsonb_typeof(c.productos) = 'array' then c.productos else '[]'::jsonb end) p
     where c.tenant_id = p_tenant
  ), palabras as (
    select w, ord, t from prod, lateral unnest(string_to_array(btrim(t), ' ')) with ordinality as u(w, ord)
  ), candidatas as (
    select w as frase from palabras where length(w) >= 4 and w <> all (v_stop)
    union
    select a.w || ' ' || b.w
      from palabras a join palabras b on b.t = a.t and b.ord = a.ord + 1
     where length(a.w) >= 3 and length(b.w) >= 3 and a.w <> all (v_stop) and b.w <> all (v_stop)
  ), existentes as (
    select nombre as etiqueta from public.yamas_send_etiquetas_catalogo where tenant_id = p_tenant
    union
    select distinct x from public.yamas_send_leads l, lateral unnest(l.etiquetas) x where l.tenant_id = p_tenant
  ), reglas as (
    select e.etiqueta, public.yamas_send_frase_variantes(c.frase) as frases
      from candidatas c
      join existentes e on public.yamas_send_texto_normalizado(e.etiqueta) = ' ' || c.frase || ' '
     where e.etiqueta <> all (v_ignoradas) and e.etiqueta <> 'cliente'
  ), up as (
    insert into public.yamas_send_etiquetas_auto (tenant_id, etiqueta, frases, updated_at)
    select p_tenant, r.etiqueta, r.frases, now() from reglas r where r.frases is not null
    on conflict (tenant_id, etiqueta)
      do update set frases = excluded.frases, activa = true, updated_at = now()
    returning 1
  )
  select count(*) into v_n from up;

  -- Una regla cuya etiqueta ya no existe o quedó ignorada se apaga.
  update public.yamas_send_etiquetas_auto a
     set activa = false, updated_at = now()
   where a.tenant_id = p_tenant and a.activa
     and (a.etiqueta = any (v_ignoradas)
          or not exists (select 1 from public.yamas_send_etiquetas_catalogo k where k.tenant_id = p_tenant and k.nombre = a.etiqueta)
             and not exists (select 1 from public.yamas_send_leads l where l.tenant_id = p_tenant and l.etiquetas @> array[a.etiqueta]));

  return jsonb_build_object('ok', true, 'reglas', v_n);
end;
$$;

revoke all on function public.yamas_send_etiquetas_auto_sincronizar_tenant(text) from public, anon, authenticated;

-- Versión para la app (el tenant sale de la sesión): se llama al abrir
-- Contactos, junto con la sincronización de clientes.
create or replace function public.yamas_send_etiquetas_auto_sincronizar()
returns jsonb
language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $$
declare v_tenant text := public.yamas_send_etiquetas_tenant();
begin
  if v_tenant is null then return jsonb_build_object('ok', false, 'error', 'sin_permiso'); end if;
  return public.yamas_send_etiquetas_auto_sincronizar_tenant(v_tenant);
end;
$$;

revoke all on function public.yamas_send_etiquetas_auto_sincronizar() from public, anon;
grant execute on function public.yamas_send_etiquetas_auto_sincronizar() to authenticated;

-- ---------------------------------------------------------------------
-- El trigger: un mensaje entrante nuevo etiqueta al contacto.
-- ---------------------------------------------------------------------
create or replace function public.yamas_send_etiquetar_mensaje()
returns trigger
language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_txt  text;
  v_tags text[];
begin
  if NEW.enviado_por_mi or NEW.contenido is null or length(NEW.contenido) < 4
     or NEW.fecha < now() - interval '24 hours' or NEW.tenant_id is null then
    return NEW;
  end if;

  v_txt := public.yamas_send_texto_normalizado(NEW.contenido);

  select array_agg(distinct a.etiqueta) into v_tags
    from public.yamas_send_etiquetas_auto a
   where a.tenant_id = NEW.tenant_id and a.activa
     and exists (
       select 1 from unnest(a.frases) f
        where v_txt like '% ' || f || ' %' or v_txt like '% ' || f || 's %'
     );

  if v_tags is null then return NEW; end if;

  -- Si todavía no hay fila de lead para este contacto, se crea "sin analizar".
  if not exists (
    select 1 from public.yamas_send_leads l
     where l.tenant_id = NEW.tenant_id
       and (l.contacto_id = NEW.contacto_id or l.telefono = NEW.telefono
            or (NEW.lid is not null and l.lid = NEW.lid))
  ) and NEW.telefono is not null then
    insert into public.yamas_send_leads (tenant_id, contacto_id, telefono, lid, nombre, etiquetas, ultimo_mensaje_at, activo)
    select NEW.tenant_id, NEW.contacto_id, NEW.telefono, NEW.lid,
           coalesce(c.nombre, c.push_name), '{}', NEW.fecha, true
      from public.yamas_send_contactos c
     where c.id = NEW.contacto_id and c.tenant_id = NEW.tenant_id and coalesce(c.activo, true)
    on conflict (tenant_id, telefono) do nothing;
  end if;

  update public.yamas_send_leads l
     set etiquetas = (select array_agg(distinct x order by x) from unnest(l.etiquetas || v_tags) x)
   where l.tenant_id = NEW.tenant_id
     and (l.contacto_id = NEW.contacto_id or l.telefono = NEW.telefono
          or (NEW.lid is not null and l.lid = NEW.lid))
     and not (l.etiquetas @> v_tags)
     and (select count(distinct x) from unnest(l.etiquetas || v_tags) x) <= 20;

  return NEW;
exception when others then
  return NEW;   -- etiquetar nunca debe frenar el ingreso de mensajes
end;
$$;

drop trigger if exists trg_etiquetar_mensaje on public.yamas_send_mensajes_historico;
create trigger trg_etiquetar_mensaje
  after insert on public.yamas_send_mensajes_historico
  for each row
  when (not new.enviado_por_mi)
  execute function public.yamas_send_etiquetar_mensaje();

-- Reglas al día: cada hora para todas las cuentas con catálogo.
create or replace function public.yamas_send_etiquetas_auto_sincronizar_todos()
returns int language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $$
declare r record; n int := 0;
begin
  for r in select distinct c.tenant_id from public.yamas_inmo_clientes c
            where c.tenant_id is not null and jsonb_typeof(c.productos) = 'array' and jsonb_array_length(c.productos) > 0
  loop
    perform public.yamas_send_etiquetas_auto_sincronizar_tenant(r.tenant_id);
    n := n + 1;
  end loop;
  return n;
end;
$$;
revoke all on function public.yamas_send_etiquetas_auto_sincronizar_todos() from public, anon, authenticated;

select cron.schedule('yamas-send-etiquetas-auto', '7 * * * *', $cron$select public.yamas_send_etiquetas_auto_sincronizar_todos()$cron$);
-- Deshacer: drop trigger trg_etiquetar_mensaje on public.yamas_send_mensajes_historico;
--           select cron.unschedule('yamas-send-etiquetas-auto');
