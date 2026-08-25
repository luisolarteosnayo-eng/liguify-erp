-- migrate_v18.sql — Imagen de Bienvenida por torneo
-- Plantilla (fondo) que se combina con el logo/nombre/categorías de cada equipo
-- para generar y descargar su imagen de bienvenida.

alter table public.torneos
  add column if not exists bienvenida_url text,   -- plantilla base (bucket 'torneos')
  add column if not exists bienvenida_cfg jsonb;  -- posiciones/tamaños de logo y textos (en %)
