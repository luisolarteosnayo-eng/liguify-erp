-- migrate_v4.sql — Cambiar unique constraint de torneo_categorias
-- para permitir misma categoría con distinta modalidad (ej. 2016 F7 y 2016 F9)

alter table public.torneo_categorias
  drop constraint if exists torneo_categorias_torneo_id_cat_id_key;

alter table public.torneo_categorias
  add constraint torneo_categorias_torneo_id_cat_id_modalidad_key
  unique (torneo_id, cat_id, modalidad);
