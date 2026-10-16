-- =====================================================================
-- Campañas recurrentes (oct 2026) — APLICADA el 2026-10-15
--
-- Una "serie" (yamas_send_campanas_recurrentes) describe cuándo se repite una
-- campaña: todos los lunes a las 11, cada 15 días, el 1 de cada mes. Cada
-- ocurrencia es una campaña normal en yamas_send_campanas con status
-- 'programada' y fecha_programada, así que créditos, Realtime, la lista de
-- Campañas y el scheduler que dispara las programadas funcionan sin cambios.
--
-- Qué hace cada pieza:
--   yamas_send_recurrente_proxima   calcula la próxima fecha de una serie.
--   yamas_send_recurrente_crear     RPC de la app: valida y crea la serie.
--   yamas_send_recurrentes_generar  corre por pg_cron: crea la campaña de
--                                   cada ocurrencia que vence en la próxima
--                                   hora y reserva sus créditos.
--
-- IMPORTANTE (dependencia fuera de este archivo): las campañas
-- 'programada' las dispara el workflow de n8n "YamaSend — Scheduler Campañas
-- Programadas" (cada 10 min). Al 2026-10-14 figura INACTIVO en la instancia
-- yamasai: hay que activarlo (o tener otro mecanismo) para que las
-- ocurrencias salgan. Este archivo no depende de n8n para crearlas.
--
-- Cuidados:
--  * La serie se crea con la lista y el template vigentes, pero los
--    contactos se releen de la lista en CADA ocurrencia (si la audiencia
--    creció, la campaña de la semana que viene la incluye).
--  * Si algo falla (template ya no aprobado, lista borrada, sin saldo), la
--    ocurrencia NO se crea, se guarda el motivo en ultimo_error y la serie
--    sigue en la fecha siguiente; no se pierde ni se pausa sola.
--  * unique (recurrencia_id, fecha_programada): correr dos veces la función
--    no duplica campañas.
-- =====================================================================

create table if not exists public.yamas_send_campanas_recurrentes (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         text not null,
  nombre            text not null check (char_length(nombre) between 1 and 120),
  lista_id          uuid not null,
  template_id       uuid not null,
  frecuencia        text not null check (frecuencia in ('semanal', 'cada_n_dias', 'mensual')),
  dias_semana       int[] not null default '{}',   -- 1 = lunes … 7 = domingo
  intervalo_dias    int check (intervalo_dias is null or intervalo_dias between 1 and 90),
  dia_mes           int check (dia_mes is null or dia_mes between 1 and 28),
  hora              time not null,
  zona              text not null default 'America/Argentina/Buenos_Aires',
  activa            boolean not null default true,
  proxima_ejecucion timestamptz,
  ultima_ejecucion  timestamptz,
  ultima_campana_id uuid,
  ocurrencias       int not null default 0,
  max_ocurrencias   int check (max_ocurrencias is null or max_ocurrencias > 0),
  fin_at            timestamptz,
  ultimo_error      text,
  creado_por        text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint recurrentes_semanal_dias check (
    frecuencia <> 'semanal' or (cardinality(dias_semana) between 1 and 7 and dias_semana <@ array[1,2,3,4,5,6,7])
  ),
  constraint recurrentes_n_dias check (frecuencia <> 'cada_n_dias' or intervalo_dias is not null),
  constraint recurrentes_mensual check (frecuencia <> 'mensual' or dia_mes is not null)
);

create index if not exists idx_recurrentes_tenant on public.yamas_send_campanas_recurrentes (tenant_id);
create index if not exists idx_recurrentes_vencen
  on public.yamas_send_campanas_recurrentes (proxima_ejecucion) where activa;

alter table public.yamas_send_campanas_recurrentes enable row level security;

-- Mismo criterio que yamas_send_campanas: cada cuenta ve y maneja las suyas.
create policy recurrentes_select on public.yamas_send_campanas_recurrentes
  for select to authenticated
  using (tenant_id in (select c.tenant_id from public.yamas_inmo_clientes c where c.auth_user_id = auth.uid()));
create policy recurrentes_update on public.yamas_send_campanas_recurrentes
  for update to authenticated
  using (tenant_id in (select c.tenant_id from public.yamas_inmo_clientes c where c.auth_user_id = auth.uid()))
  with check (tenant_id in (select c.tenant_id from public.yamas_inmo_clientes c where c.auth_user_id = auth.uid()));
create policy recurrentes_delete on public.yamas_send_campanas_recurrentes
  for delete to authenticated
  using (tenant_id in (select c.tenant_id from public.yamas_inmo_clientes c where c.auth_user_id = auth.uid()));
-- Las altas van por yamas_send_recurrente_crear (valida y calcula la fecha):
-- no hay policy de insert a propósito.

alter table public.yamas_send_campanas
  add column if not exists recurrencia_id uuid
  references public.yamas_send_campanas_recurrentes (id) on delete set null;

create unique index if not exists uq_campanas_recurrencia_fecha
  on public.yamas_send_campanas (recurrencia_id, fecha_programada) where recurrencia_id is not null;

-- ---------------------------------------------------------------------
-- Próxima fecha de una serie, estrictamente posterior a p_desde.
--   semanal      el próximo día de la semana elegido, a la hora indicada.
--   cada_n_dias  p_desde + N días, a la hora indicada.
--   mensual      el día del mes elegido (1-28), a la hora indicada.
-- Todo en la zona horaria de la serie (respeta cambios de hora).
-- ---------------------------------------------------------------------
create or replace function public.yamas_send_recurrente_proxima(
  p_frecuencia text, p_dias_semana int[], p_intervalo_dias int, p_dia_mes int,
  p_hora time, p_zona text, p_desde timestamptz
) returns timestamptz
language plpgsql stable
set search_path to 'public', 'pg_temp'
as $$
declare
  v_local timestamp := p_desde at time zone p_zona;
  v_dia   date;
  v_cand  timestamptz;
  i       int;
begin
  if p_frecuencia = 'semanal' then
    for i in 0..7 loop
      v_dia := v_local::date + i;
      if extract(isodow from v_dia)::int = any (p_dias_semana) then
        v_cand := (v_dia + p_hora) at time zone p_zona;
        if v_cand > p_desde then return v_cand; end if;
      end if;
    end loop;
    return null;
  elsif p_frecuencia = 'cada_n_dias' then
    return ((v_local::date + p_intervalo_dias) + p_hora) at time zone p_zona;
  elsif p_frecuencia = 'mensual' then
    v_dia  := make_date(extract(year from v_local)::int, extract(month from v_local)::int, p_dia_mes);
    v_cand := (v_dia + p_hora) at time zone p_zona;
    if v_cand <= p_desde then
      v_dia  := (v_dia + interval '1 month')::date;
      v_cand := (v_dia + p_hora) at time zone p_zona;
    end if;
    return v_cand;
  end if;
  return null;
end;
$$;

-- ---------------------------------------------------------------------
-- Alta de una serie desde la app. El tenant sale de la sesión.
-- p_inicio (opcional): no arrancar antes de esa fecha.
-- ---------------------------------------------------------------------
create or replace function public.yamas_send_recurrente_crear(
  p_nombre text, p_lista_id uuid, p_template_id uuid, p_frecuencia text,
  p_dias_semana int[], p_intervalo_dias int, p_dia_mes int, p_hora time,
  p_zona text default 'America/Argentina/Buenos_Aires',
  p_inicio timestamptz default null, p_max_ocurrencias int default null, p_fin_at timestamptz default null
) returns jsonb
language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_tenant text := public.yamas_send_etiquetas_tenant();
  v_ok     boolean;
  v_desde  timestamptz;
  v_prox   timestamptz;
  v_id     uuid;
begin
  if v_tenant is null then return jsonb_build_object('ok', false, 'error', 'sin_permiso'); end if;
  if p_hora is null then return jsonb_build_object('ok', false, 'error', 'hora_invalida'); end if;
  if p_frecuencia not in ('semanal', 'cada_n_dias', 'mensual') then
    return jsonb_build_object('ok', false, 'error', 'frecuencia_invalida');
  end if;
  begin
    perform now() at time zone coalesce(p_zona, 'x');
  exception when others then
    return jsonb_build_object('ok', false, 'error', 'zona_invalida');
  end;

  select exists (select 1 from public.yamas_send_listas l where l.id = p_lista_id and l.tenant_id = v_tenant) into v_ok;
  if not v_ok then return jsonb_build_object('ok', false, 'error', 'lista_no_encontrada'); end if;
  select exists (select 1 from public.yamas_send_templates t
                  where t.id = p_template_id and t.tenant_id = v_tenant and t.status = 'verificado') into v_ok;
  if not v_ok then return jsonb_build_object('ok', false, 'error', 'template_no_aprobado'); end if;

  if p_frecuencia = 'cada_n_dias' and p_inicio is not null then
    v_prox := p_inicio;
  else
    v_desde := greatest(now(), coalesce(p_inicio, now()) - interval '1 second');
    if p_frecuencia = 'cada_n_dias' then
      -- "cada N días": la primera es la próxima vez que sea esa hora.
      v_prox := public.yamas_send_recurrente_proxima('cada_n_dias', '{}', 0, null, p_hora, p_zona, v_desde);
    else
      v_prox := public.yamas_send_recurrente_proxima(p_frecuencia, coalesce(p_dias_semana, '{}'), p_intervalo_dias, p_dia_mes, p_hora, p_zona, v_desde);
    end if;
  end if;
  if v_prox is null then return jsonb_build_object('ok', false, 'error', 'sin_fecha'); end if;

  insert into public.yamas_send_campanas_recurrentes
    (tenant_id, nombre, lista_id, template_id, frecuencia, dias_semana, intervalo_dias, dia_mes,
     hora, zona, proxima_ejecucion, max_ocurrencias, fin_at, creado_por)
  values
    (v_tenant, left(trim(p_nombre), 120), p_lista_id, p_template_id, p_frecuencia,
     coalesce(p_dias_semana, '{}'), p_intervalo_dias, p_dia_mes, p_hora, p_zona, v_prox,
     p_max_ocurrencias, p_fin_at, auth.uid()::text)
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id, 'proxima', v_prox);
exception when check_violation then
  return jsonb_build_object('ok', false, 'error', 'datos_invalidos');
end;
$$;

revoke all on function public.yamas_send_recurrente_crear(text, uuid, uuid, text, int[], int, int, time, text, timestamptz, int, timestamptz) from public, anon;
grant execute on function public.yamas_send_recurrente_crear(text, uuid, uuid, text, int[], int, int, time, text, timestamptz, int, timestamptz) to authenticated;

-- ---------------------------------------------------------------------
-- Generador: lo corre pg_cron. Solo service_role/postgres.
-- Crea la campaña de cada ocurrencia que vence dentro de la próxima hora
-- (así los créditos quedan apartados con tiempo) y adelanta la serie.
-- ---------------------------------------------------------------------
create or replace function public.yamas_send_recurrentes_generar()
returns jsonb
language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  r          record;
  v_ids      uuid[];
  v_lista    text;
  v_tpl      record;
  v_cliente  record;
  v_miembro  record;
  v_habilit  boolean;
  v_camp     uuid;
  v_res      jsonb;
  v_err      text;
  v_prox     timestamptz;
  v_creadas  int := 0;
  v_fallidas int := 0;
begin
  for r in
    select * from public.yamas_send_campanas_recurrentes
     where activa and proxima_ejecucion is not null and proxima_ejecucion <= now() + interval '1 hour'
     order by proxima_ejecucion
     limit 100
     for update skip locked
  loop
    v_err := null; v_camp := null;
    begin
      -- ¿terminó la serie?
      if (r.max_ocurrencias is not null and r.ocurrencias >= r.max_ocurrencias)
         or (r.fin_at is not null and r.proxima_ejecucion > r.fin_at) then
        update public.yamas_send_campanas_recurrentes set activa = false, updated_at = now() where id = r.id;
        continue;
      end if;

      select l.contactos_ids, l.nombre into v_ids, v_lista
        from public.yamas_send_listas l where l.id = r.lista_id and l.tenant_id = r.tenant_id;
      if v_lista is null then v_err := 'La audiencia ya no existe.'; end if;

      if v_err is null then
        select t.nombre, t.status into v_tpl
          from public.yamas_send_templates t where t.id = r.template_id and t.tenant_id = r.tenant_id;
        if v_tpl.nombre is null or v_tpl.status <> 'verificado' then
          v_err := 'El template ya no está aprobado.';
        end if;
      end if;

      if v_err is null and coalesce(cardinality(v_ids), 0) = 0 then
        v_err := 'La audiencia no tiene contactos.';
      end if;

      if v_err is null then
        select c.wabaid, c.ycloud_api into v_cliente
          from public.yamas_inmo_clientes c where c.tenant_id = r.tenant_id limit 1;
        if v_cliente.wabaid is null or v_cliente.ycloud_api is null then
          v_err := 'La cuenta no tiene WhatsApp configurado.';
        end if;
      end if;

      if v_err is null then
        insert into public.yamas_send_campanas
          (tenant_id, nombre, lista_id, template_id, lista_nombre, template_nombre,
           contactos_ids, contactos_count, waba_id, status, fecha_programada, origen,
           recurrencia_id, creado_por)
        values
          (r.tenant_id,
           r.nombre || ' · ' || to_char(r.proxima_ejecucion at time zone r.zona, 'DD/MM'),
           r.lista_id, r.template_id, v_lista, v_tpl.nombre,
           v_ids, cardinality(v_ids), v_cliente.wabaid, 'programada', r.proxima_ejecucion, 'manual',
           r.id, 'recurrencia')
        on conflict (recurrencia_id, fecha_programada) where recurrencia_id is not null do nothing
        returning id into v_camp;

        -- Créditos: misma primitiva que usa la app, pero con el miembro del
        -- tenant explícito (acá no hay sesión de usuario).
        if v_camp is not null then
          select m.id, m.org_id, m.auth_user_id into v_miembro
            from public.yamas_send_miembros m
           where m.tenant_id = r.tenant_id and m.rol = 'empleado' limit 1;
          select coalesce(cc.creditos_habilitados, false) into v_habilit
            from public.yamas_send_config_creditos cc where cc.id;

          if v_miembro.id is not null then
            select o_resultado into v_res
              from public.yamas_send__reservar_creditos_interno(
                     v_miembro.id, v_miembro.org_id, r.tenant_id, v_camp, cardinality(v_ids), v_miembro.auth_user_id);
            if coalesce((v_res ->> 'ok')::boolean, false) is not true then
              v_err := case v_res ->> 'error'
                         when 'saldo_insuficiente' then 'No alcanzan los créditos (necesitás ' || cardinality(v_ids) || ').'
                         else 'No se pudieron reservar los créditos.' end;
              delete from public.yamas_send_campanas where id = v_camp;
              v_camp := null;
            end if;
          elsif coalesce(v_habilit, false) then
            v_err := 'La cuenta no tiene créditos asignados.';
            delete from public.yamas_send_campanas where id = v_camp;
            v_camp := null;
          end if;
        end if;
      end if;
    exception when others then
      v_err := 'Error inesperado: ' || sqlerrm;
    end;

    -- La serie avanza siempre: una ocurrencia fallida no frena las siguientes.
    v_prox := public.yamas_send_recurrente_proxima(
      r.frecuencia, r.dias_semana, r.intervalo_dias, r.dia_mes, r.hora, r.zona, r.proxima_ejecucion);

    update public.yamas_send_campanas_recurrentes
       set proxima_ejecucion = v_prox,
           ultima_ejecucion  = case when v_camp is not null then r.proxima_ejecucion else ultima_ejecucion end,
           ultima_campana_id = coalesce(v_camp, ultima_campana_id),
           ocurrencias       = ocurrencias + (case when v_camp is not null then 1 else 0 end),
           ultimo_error      = v_err,
           updated_at        = now()
     where id = r.id;

    if v_camp is not null then v_creadas := v_creadas + 1; else v_fallidas := v_fallidas + 1; end if;
  end loop;

  return jsonb_build_object('ok', true, 'creadas', v_creadas, 'fallidas', v_fallidas);
end;
$$;

revoke all on function public.yamas_send_recurrentes_generar() from public, anon, authenticated;

-- Cada 5 minutos. (Aplicar con la migración; deshacer: select cron.unschedule('yamas-send-recurrentes');)
select cron.schedule('yamas-send-recurrentes', '*/5 * * * *', $cron$select public.yamas_send_recurrentes_generar()$cron$);
