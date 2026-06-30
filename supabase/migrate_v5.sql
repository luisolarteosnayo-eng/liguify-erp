-- migrate_v5.sql — Agregar columna modalidad a equipos
alter table public.equipos
  add column if not exists modalidad text default '';
