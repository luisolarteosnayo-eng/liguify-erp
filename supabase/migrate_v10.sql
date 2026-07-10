-- migrate_v10.sql — Vendedor que inscribió cada equipo
-- Permite medir el desempeño por vendedor (equipos registrados por usuario).

alter table public.equipos
  add column if not exists created_by uuid references public.profiles(id);
