-- migrate_v12.sql — Persistencia de Equipos Interesados / Prospectos
-- Antes vivían solo en memoria (se perdían al recargar). Ahora se guardan en BD.

create table if not exists public.prospectos (
  id          bigint generated always as identity primary key,
  torneo_id   bigint not null references public.torneos(id) on delete cascade,
  club_id     bigint references public.clubes(id) on delete set null,
  club_nombre text not null,
  cat_ids     bigint[] not null default '{}',   -- categorías de interés
  delegado    text,
  telefono    text,
  nota        text,
  created_by  uuid references public.profiles(id),
  org_id      bigint not null references public.organizaciones(id) on delete cascade,
  created_at  timestamptz not null default now()
);

create index if not exists idx_prospectos_torneo on public.prospectos(torneo_id);

alter table public.prospectos enable row level security;

drop policy if exists prospectos_select on public.prospectos;
create policy prospectos_select on public.prospectos for select
  using ( is_platform_admin() or org_id = current_org_id() );

drop policy if exists prospectos_all on public.prospectos;
create policy prospectos_all on public.prospectos for all
  using ( is_platform_admin() or org_id = current_org_id() )
  with check ( is_platform_admin() or org_id = current_org_id() );
