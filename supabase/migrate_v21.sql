-- migrate_v21.sql — Logo de la empresa (sale en la cabecera de los recibos internos)
alter table public.organizaciones add column if not exists logo_url text;
