-- ============================================================================
-- ERP: el operador registra logo y email del club al inscribir el equipo.
-- Nuevas columnas en public.clubes; el logo se guarda en el bucket público
-- 'torneos' bajo {org_id}/clubes/ (misma política que las cabeceras de torneo).
-- Ejecutar en Supabase SQL Editor.
-- ============================================================================

alter table public.clubes
  add column if not exists email    text,
  add column if not exists logo_url text;

notify pgrst, 'reload schema';
