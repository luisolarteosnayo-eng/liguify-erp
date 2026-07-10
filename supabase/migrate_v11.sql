-- migrate_v11.sql — Comisión de venta por categoría del torneo
-- Monto de comisión que gana el vendedor por cada inscripción en esa categoría.

alter table public.torneo_categorias
  add column if not exists comision numeric(12,2) default 0;
