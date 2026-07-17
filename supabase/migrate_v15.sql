-- migrate_v15.sql — Pagos de torneos clasificatorios
-- Un pago ahora puede ser de un CLUB o de un TORNEO CLASIFICATORIO.

alter table public.pagos
  add column if not exists clasificatorio_id bigint references public.clasificatorios(id) on delete set null;

-- club_id deja de ser obligatorio (los pagos de clasificatorio no tienen club)
alter table public.pagos alter column club_id drop not null;
