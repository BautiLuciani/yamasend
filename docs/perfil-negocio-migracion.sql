-- Perfil inteligente del negocio.
--
-- Una fila por tenant con el perfil que la IA infiere de las conversaciones de
-- WhatsApp (rubro, productos, zona, etc.). Lo escribe el workflow de n8n
-- "YamaSend — Perfil del negocio (IA)" por conexión directa a Postgres (ignora
-- RLS). El usuario solo puede LEER su fila y registrar su decisión por campo a
-- través de la RPC de abajo: no hay políticas de INSERT/UPDATE/DELETE a propósito.
--
-- No toca yamas_inmo_clientes ni yamas_send_organizaciones: el perfil inferido
-- es una PROPUESTA; pasa a "Datos de la empresa" recién cuando el usuario la
-- aplica desde la app (actualizarDatosNegocioAction).
--
-- Migración aditiva: no modifica ni borra nada existente.

create table if not exists public.yamas_send_perfil_negocio (
  tenant_id            text primary key,
  estado               text not null default 'generando'
                         check (estado in ('generando', 'listo', 'error')),
  -- Forma de `perfil` (la valida el workflow, no la base):
  -- {
  --   "nombre_empresa":    { "valor": "", "confianza": 0-1, "evidencia": ["..."] },
--   "rubro":             { ... },
  --   "descripcion_negocio": { ... },
  --   "publico_objetivo":  { ... },
  --   "zona_cobertura":    { "valor": "", "ubicaciones": ["CABA", "..."], ... },
  --   "diferenciales":     { ... },
  --   "tono_comunicacion": { ... },
  --   "productos": [ { "nombre": "", "precio": "", "descripcion": "",
  --                    "confianza": 0-1, "evidencia": ["..."] } ]
  -- }
  perfil               jsonb not null default '{}'::jsonb,
  -- Decisión del usuario por campo: { "rubro": "aplicado", "productos": "descartado" }
  decisiones           jsonb not null default '{}'::jsonb,
  mensajes_analizados  integer not null default 0,
  error                text,
  generado_at          timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

alter table public.yamas_send_perfil_negocio enable row level security;

drop policy if exists tenant_isolation_select on public.yamas_send_perfil_negocio;
create policy tenant_isolation_select
  on public.yamas_send_perfil_negocio
  for select
  to authenticated
  using (
    tenant_id in (
      select c.tenant_id
      from public.yamas_inmo_clientes c
      where c.auth_user_id = auth.uid()
    )
  );

-- Registra si el usuario aplicó o descartó un campo del perfil inferido.
-- p_decision = null limpia la decisión. SECURITY DEFINER porque la tabla no
-- tiene política de UPDATE; el tenant se resuelve acá, nunca viene del cliente.
create or replace function public.yamas_send_perfil_negocio_decidir(
  p_campo    text,
  p_decision text
) returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_tenant text;
begin
  if p_campo is null or p_campo not in (
    'nombre_empresa', 'rubro', 'descripcion_negocio', 'publico_objetivo',
    'zona_cobertura', 'diferenciales', 'tono_comunicacion', 'productos'
  ) then
    return jsonb_build_object('ok', false, 'error', 'campo_invalido');
  end if;

  if p_decision is not null and p_decision not in ('aplicado', 'descartado') then
    return jsonb_build_object('ok', false, 'error', 'decision_invalida');
  end if;

  select c.tenant_id into v_tenant
  from public.yamas_inmo_clientes c
  where c.auth_user_id = auth.uid();

  if v_tenant is null then
    return jsonb_build_object('ok', false, 'error', 'sin_permiso');
  end if;

  update public.yamas_send_perfil_negocio
     set decisiones = case
           when p_decision is null then decisiones - p_campo
           else decisiones || jsonb_build_object(p_campo, p_decision)
         end,
         updated_at = now()
   where tenant_id = v_tenant;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'sin_perfil');
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.yamas_send_perfil_negocio_decidir(text, text) from public, anon;
grant execute on function public.yamas_send_perfil_negocio_decidir(text, text) to authenticated;

comment on table public.yamas_send_perfil_negocio is
  'Perfil del negocio inferido por IA a partir de las conversaciones de WhatsApp. Una fila por tenant. Lo escribe el workflow n8n "Perfil del negocio (IA)"; el usuario solo lo lee y decide por campo (aplicado/descartado) vía yamas_send_perfil_negocio_decidir.';
