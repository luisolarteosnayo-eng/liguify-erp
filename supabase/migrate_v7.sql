-- migrate_v7.sql — Persistencia de "Ingresos por Fecha" (antes solo en memoria)
-- Guarda el detalle financiero de cada jornada como JSON, por torneo y número de fecha.

create table if not exists public.ingresos_fecha (
  id           bigint generated always as identity primary key,
  torneo_id    bigint not null references public.torneos(id) on delete cascade,
  n_fecha      int not null,                 -- número de fecha dentro del torneo (1,2,3,...)
  fecha_exacta date,                          -- fecha calendario de la jornada
  data         jsonb not null default '{}',  -- {entradas_arr, pagosEntradas, arbitraje, banco, efectivo, otrosExtras, gastosExtras, ...}
  org_id       bigint not null references public.organizaciones(id) on delete cascade,
  updated_at   timestamptz not null default now(),
  unique (torneo_id, n_fecha)
);

create index if not exists idx_ingresos_fecha_torneo on public.ingresos_fecha(torneo_id);

alter table public.ingresos_fecha enable row level security;

drop policy if exists ingresos_fecha_select on public.ingresos_fecha;
create policy ingresos_fecha_select on public.ingresos_fecha for select
  using ( is_platform_admin() or org_id = current_org_id() );
drop policy if exists ingresos_fecha_all on public.ingresos_fecha;
create policy ingresos_fecha_all on public.ingresos_fecha for all
  using ( is_platform_admin() or org_id = current_org_id() )
  with check ( is_platform_admin() or org_id = current_org_id() );
