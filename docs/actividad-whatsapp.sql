-- Actividad de WhatsApp (cabecera de Contactos): cuántos te escribieron, cuántos
-- mensajes recibiste y cuántos contactos aparecieron por primera vez en la
-- ventana de las últimas p_horas (24 o 168). El tenant sale de la sesión.
create or replace function public.yamas_send_actividad(p_horas int)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_tenant text := public.yamas_send_etiquetas_tenant();
  v_desde timestamptz;
  v_escribieron int;
  v_mensajes int;
  v_nuevos int;
begin
  if v_tenant is null then
    return jsonb_build_object('ok', false, 'error', 'sin_perfil');
  end if;
  if p_horas not in (24, 168) then
    return jsonb_build_object('ok', false, 'error', 'ventana_invalida');
  end if;
  v_desde := now() - make_interval(hours => p_horas);

  select count(distinct contacto_id), count(*)
    into v_escribieron, v_mensajes
  from public.yamas_send_mensajes_historico
  where tenant_id = v_tenant and enviado_por_mi is not true and fecha >= v_desde;

  select count(*) into v_nuevos
  from (
    select contacto_id
    from public.yamas_send_mensajes_historico
    where tenant_id = v_tenant and contacto_id is not null
    group by contacto_id
    having min(fecha) >= v_desde
  ) t;

  return jsonb_build_object('ok', true, 'escribieron', v_escribieron, 'mensajes', v_mensajes, 'nuevos', v_nuevos);
end;
$$;

revoke all on function public.yamas_send_actividad(int) from public, anon;
grant execute on function public.yamas_send_actividad(int) to authenticated;
