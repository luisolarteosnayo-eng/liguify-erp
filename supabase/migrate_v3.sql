-- migrate_v3.sql — Agregar columnas para_inscripciones y para_fechas a medios_pago
alter table public.medios_pago
  add column if not exists para_inscripciones boolean not null default true,
  add column if not exists para_fechas        boolean not null default true;
