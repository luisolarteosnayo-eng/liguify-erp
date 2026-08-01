-- migrate_v17.sql — Contacto/pagador a nivel de Equipo y de Pago
-- El contacto (delegado que paga) puede variar por categoría dentro de un mismo club.
-- La deuda sigue consolidada por club, pero la cobranza se hace por contacto.

-- Cada equipo guarda su propio contacto pagador (hereda del club si no se especifica).
alter table public.equipos
  add column if not exists contacto           text,
  add column if not exists contacto_telefono  text;

-- Cada pago registra a qué contacto se le cobró (para el desglose por pagador).
alter table public.pagos
  add column if not exists contacto text;
