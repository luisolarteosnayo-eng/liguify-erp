-- migrate_v8.sql — Estados de torneo: agregar 'en_ejecucion'
-- Estados: activo (al crear) → en_ejecucion (en juego) → cerrado (finalizado)

alter table public.torneos
  drop constraint if exists torneos_estado_check;

alter table public.torneos
  add constraint torneos_estado_check
  check (estado in ('activo','en_ejecucion','cerrado'));
