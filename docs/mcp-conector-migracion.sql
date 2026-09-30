-- Aplicada en el proyecto Supabase "Yamas.AI" el 2026-09-30
-- (migración yamas_send_mcp_confirmaciones). Se guarda acá como referencia.
BEGIN;

CREATE TABLE IF NOT EXISTS public.yamas_send_mcp_confirmaciones (
  codigo_hash text PRIMARY KEY,
  auth_user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('template', 'campana')),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.yamas_send_mcp_confirmaciones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mcp_confirmaciones_insert_propias"
  ON public.yamas_send_mcp_confirmaciones
  FOR INSERT TO authenticated
  WITH CHECK (auth_user_id = auth.uid());

CREATE POLICY "mcp_confirmaciones_select_propias"
  ON public.yamas_send_mcp_confirmaciones
  FOR SELECT TO authenticated
  USING (auth_user_id = auth.uid());

REVOKE ALL ON public.yamas_send_mcp_confirmaciones FROM anon;
GRANT SELECT, INSERT ON public.yamas_send_mcp_confirmaciones TO authenticated;

CREATE INDEX IF NOT EXISTS yamas_send_mcp_confirmaciones_user_idx
  ON public.yamas_send_mcp_confirmaciones (auth_user_id, created_at DESC);

COMMENT ON TABLE public.yamas_send_mcp_confirmaciones IS
  'Códigos de confirmación ya consumidos por el conector MCP. Evita doble envío de campañas/templates desde Claude o ChatGPT.';

COMMIT;
