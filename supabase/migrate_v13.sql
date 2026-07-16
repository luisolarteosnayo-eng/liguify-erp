-- migrate_v13.sql — Proveedores y Costos del torneo
-- Proveedores: catálogo por organización (servicios por concepto + 2 cuentas bancarias).
-- Costos: costos únicos del torneo (Medallas, Trofeos, ...) con adelantos y saldo por pagar.

create table if not exists public.proveedores (
  id            bigint generated always as identity primary key,
  nombre        text not null,
  ruc_dni       text,
  telefono      text,
  concepto_ids  bigint[] not null default '{}',   -- servicios que provee (conceptos)
  banco1_nombre text, banco1_cuenta text,
  banco2_nombre text, banco2_cuenta text,
  org_id        bigint not null references public.organizaciones(id) on delete cascade,
  created_at    timestamptz not null default now()
);

create table if not exists public.costos (
  id           bigint generated always as identity primary key,
  torneo_id    bigint not null references public.torneos(id) on delete cascade,
  concepto_id  bigint references public.conceptos(id)   on delete set null,
  proveedor_id bigint references public.proveedores(id) on delete set null,
  descripcion  text,
  monto        numeric(12,2) not null default 0,        -- costo total acordado
  adelantos    jsonb not null default '[]',             -- [{fecha, monto}]
  org_id       bigint not null references public.organizaciones(id) on delete cascade,
  created_at   timestamptz not null default now()
);
create index if not exists idx_costos_torneo on public.costos(torneo_id);

alter table public.proveedores enable row level security;
alter table public.costos      enable row level security;

drop policy if exists proveedores_select on public.proveedores;
create policy proveedores_select on public.proveedores for select
  using ( is_platform_admin() or org_id = current_org_id() );
drop policy if exists proveedores_all on public.proveedores;
create policy proveedores_all on public.proveedores for all
  using ( is_platform_admin() or org_id = current_org_id() )
  with check ( is_platform_admin() or org_id = current_org_id() );

drop policy if exists costos_select on public.costos;
create policy costos_select on public.costos for select
  using ( is_platform_admin() or org_id = current_org_id() );
drop policy if exists costos_all on public.costos;
create policy costos_all on public.costos for all
  using ( is_platform_admin() or org_id = current_org_id() )
  with check ( is_platform_admin() or org_id = current_org_id() );
