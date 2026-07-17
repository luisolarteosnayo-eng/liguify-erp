-- migrate_v16.sql — Texto de Condiciones por torneo (aparece al pie del Estado de Cuenta)

alter table public.torneos
  add column if not exists condiciones text;
