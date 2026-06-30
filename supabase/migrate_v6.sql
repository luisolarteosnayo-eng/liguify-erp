-- migrate_v6.sql — Tabla de conceptos de ingresos/egresos para el formulario de fechas
-- Conceptos configurables (Tickets, Estacionamiento, Cancha, Transmisión, Ambulancia,
-- Arbitraje, Personal, ...). tipo: ingreso|egreso|ambos. fuente (solo egreso): banco|efectivo|ambos.

create table if not exists public.conceptos (
  id          bigint generated always as identity primary key,
  nombre      text not null,
  tipo        text not null default 'egreso' check (tipo in ('ingreso','egreso','ambos')),
  fuente      text not null default 'ambos'  check (fuente in ('banco','efectivo','ambos')),
  por_defecto boolean not null default true,   -- aparece siempre en el formulario
  activo      boolean not null default true,
  org_id      bigint not null references public.organizaciones(id) on delete cascade
);

alter table public.conceptos enable row level security;

drop policy if exists conceptos_select on public.conceptos;
create policy conceptos_select on public.conceptos for select
  using ( is_platform_admin() or org_id = current_org_id() );
drop policy if exists conceptos_all on public.conceptos;
create policy conceptos_all on public.conceptos for all
  using ( is_platform_admin() or org_id = current_org_id() )
  with check ( is_platform_admin() or org_id = current_org_id() );

-- Seed de conceptos por defecto para organizaciones existentes que aún no tengan ninguno
insert into public.conceptos (nombre, tipo, fuente, por_defecto, activo, org_id)
select d.nombre, d.tipo, d.fuente, true, true, o.id
from public.organizaciones o
cross join (values
  ('Tickets',        'ingreso', 'ambos'),
  ('Estacionamiento','ingreso', 'ambos'),
  ('Cancha',         'egreso',  'banco'),
  ('Transmisión',    'egreso',  'banco'),
  ('Ambulancia',     'egreso',  'banco'),
  ('Arbitraje',      'egreso',  'ambos'),
  ('Personal',       'egreso',  'efectivo')
) as d(nombre, tipo, fuente)
where not exists (select 1 from public.conceptos c where c.org_id = o.id);
