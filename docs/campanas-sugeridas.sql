-- Compras detectadas en los chats del tenant logueado.
--
-- YamaSend no tiene registro de ventas, así que "compró" se infiere de los
-- mensajes ENVIADOS por el dueño que confirman una compra o un pago ("gracias
-- por tu compra", "comprobante", "pago acreditado", "tu pedido ya salió"...).
-- Una compra = un día distinto con alguna de esas confirmaciones, para que dos
-- mensajes seguidos de la misma venta no cuenten doble.
--
-- Alimenta las campañas sugeridas (clientes que no compran hace 2 semanas,
-- mejores compradores). Solo devuelve leads activos del tenant de quien llama.
create or replace function public.yamas_send_compradores_detectados()
returns table (
  lead_id uuid,
  nombre text,
  telefono text,
  compras integer,
  primera_compra timestamptz,
  ultima_compra timestamptz,
  ultima_campana_enviada_at timestamptz
)
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_tenant text;
begin
  select c.tenant_id into v_tenant
  from public.yamas_inmo_clientes c
  where c.auth_user_id = auth.uid();

  if v_tenant is null then
    return;
  end if;

  return query
  select
    l.id,
    l.nombre,
    l.telefono,
    count(distinct h.fecha::date)::integer,
    min(h.fecha),
    max(h.fecha),
    l.ultima_campana_enviada_at
  from public.yamas_send_leads l
  join public.yamas_send_mensajes_historico h
    on h.tenant_id = l.tenant_id
   and ((h.telefono is not null and h.telefono = l.telefono)
     or (h.lid is not null and h.lid = l.lid))
  where l.tenant_id = v_tenant
    and l.activo is not false
    and h.enviado_por_mi
    and h.contenido ~* '(gracias por (tu|su) compra|(tu|su) pedido (fue|ya|est[aá]|se|ingres|sali|lleg)|comprobante|pago (recibido|acreditado|confirmado)|compra (confirmada|realizada|exitosa)|(te|le) (confirmo|confirmamos) (el|tu|su) (pago|pedido|compra))'
  group by l.id, l.nombre, l.telefono, l.ultima_campana_enviada_at;
end;
$$;

revoke all on function public.yamas_send_compradores_detectados() from public, anon;
grant execute on function public.yamas_send_compradores_detectados() to authenticated;
