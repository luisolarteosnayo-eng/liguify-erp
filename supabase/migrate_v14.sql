-- migrate_v14.sql — Torneos Clasificatorios (externos que clasifican equipos y pagan su inscripción)

create table if not exists public.clasificatorios (
  id         bigint generated always as identity primary key,
  nombre     text not null,
  contacto   text,
  telefono   text,
  org_id     bigint not null references public.organizaciones(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.clasificatorios enable row level security;

drop policy if exists clasificatorios_select on public.clasificatorios;
create policy clasificatorios_select on public.clasificatorios for select
  using ( is_platform_admin() or org_id = current_org_id() );
drop policy if exists clasificatorios_all on public.clasificatorios;
create policy clasificatorios_all on public.clasificatorios for all
  using ( is_platform_admin() or org_id = current_org_id() )
  with check ( is_platform_admin() or org_id = current_org_id() );

-- Vínculo: un equipo puede haber sido clasificado (e inscrito/pagado) por un torneo clasificatorio.
-- Para el CLUB la inscripción es 0 (no la paga él); el precio que paga el clasificatorio va en clasif_precio.
alter table public.equipos
  add column if not exists clasificatorio_id bigint references public.clasificatorios(id) on delete set null,
  add column if not exists clasif_precio numeric(12,2);
