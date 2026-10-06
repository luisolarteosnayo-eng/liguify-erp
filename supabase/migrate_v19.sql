-- migrate_v19.sql — Datos fiscales del club (para emitir boleta o factura)

alter table public.clubes
  add column if not exists dni          text,   -- DNI del contacto (boleta)
  add column if not exists ruc          text,   -- RUC del club (factura)
  add column if not exists razon_social text;   -- razón social (factura)
