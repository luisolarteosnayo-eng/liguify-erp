-- ============================================================================
--  LIGUIFY ERP — Esquema Supabase (PostgreSQL)
--  MVP financiero de torneos · multi-tenant por organización (org_id)
--  Ejecutar en: Supabase → SQL Editor → New query → pegar todo → Run
-- ============================================================================
--  Convenciones:
--   · Montos en NUMERIC(12,2) (NUNCA float) — soles S/.
--   · Aislamiento por organización vía Row Level Security (RLS)
--   · El Administrador de Plataforma (es_admin_plataforma) ve todo
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. ORGANIZACIONES (tenants)
-- ---------------------------------------------------------------------------
create table if not exists public.organizaciones (
  id            bigint generated always as identity primary key,
  nombre        text not null,
  contacto      text,
  email         text,
  ruc           text,
  telefono      text,
  plan          text not null default 'free' check (plan in ('free','silver','plus')),
  plan_vence    date,
  activo        boolean not null default true,
  es_propia     boolean not null default false,   -- organización propia del admin
  owner_user_id uuid,                              -- auth.users.id del organizador dueño
  fecha_reg     date not null default current_date,
  created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 2. PROFILES (extiende auth.users)
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id                  uuid primary key references auth.users(id) on delete cascade,
  nombre              text,
  email               text,
  rol                 text check (rol in ('organizador','operador','tesorero')),
  org_id              bigint references public.organizaciones(id) on delete set null,
  es_admin_plataforma boolean not null default false,
  metodo              text default 'email',        -- 'email' | 'google'
  activo              boolean not null default true,
  pendiente           boolean not null default false,
  created_at          timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 3. CATÁLOGOS por organización
-- ---------------------------------------------------------------------------
create table if not exists public.categorias (
  id      bigint generated always as identity primary key,
  nombre  text not null,
  aforo   int default 8,
  fechas  int default 6,
  org_id  bigint not null references public.organizaciones(id) on delete cascade
);

create table if not exists public.complejos (
  id        bigint generated always as identity primary key,
  nombre    text not null,
  direccion text,
  distrito  text,
  org_id    bigint not null references public.organizaciones(id) on delete cascade
);

create table if not exists public.medios_pago (
  id                 bigint generated always as identity primary key,
  nombre             text not null,
  tipo               text default 'transferencia',  -- transferencia | billetera | efectivo | tarjeta
  icon               text,
  activo             boolean not null default true,
  para_inscripciones boolean not null default true,
  para_fechas        boolean not null default true,
  org_id             bigint not null references public.organizaciones(id) on delete cascade
);

create table if not exists public.clubes (
  id        bigint generated always as identity primary key,
  nombre    text not null,
  delegado  text,
  telefono  text,
  provincia text default 'Lima',
  org_id    bigint not null references public.organizaciones(id) on delete cascade
);

-- ---------------------------------------------------------------------------
-- 4. TORNEOS y su configuración de categorías
-- ---------------------------------------------------------------------------
create table if not exists public.torneos (
  id      bigint generated always as identity primary key,
  nombre  text not null,
  sede    text,
  esquema text not null default 'inscripcion_arbitraje'
          check (esquema in ('inscripcion_arbitraje','solo_inscripcion')),
  estado  text not null default 'activo' check (estado in ('activo','cerrado')),
  inicio  date,
  fin     date,
  label   text,
  fecha_venc date,                     -- fecha límite de pago (heredada a pagos pendientes)
  snap    jsonb,                       -- snapshot al cerrar el torneo
  org_id  bigint not null references public.organizaciones(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Montos de referencia por categoría dentro de un torneo (el array "cats")
create table if not exists public.torneo_categorias (
  id          bigint generated always as identity primary key,
  torneo_id   bigint not null references public.torneos(id) on delete cascade,
  cat_id      bigint not null references public.categorias(id) on delete restrict,
  modalidad   text default 'F7',
  aforo       int default 8,
  fechas      int default 6,
  inscripcion numeric(12,2) default 0,
  arbitraje   numeric(12,2) default 0,
  org_id      bigint not null references public.organizaciones(id) on delete cascade,
  unique (torneo_id, cat_id, modalidad)
);

-- ---------------------------------------------------------------------------
-- 5. EQUIPOS (instancia de un club en una categoría de un torneo)
--    Nunca se eliminan: solo se inactivan (trazabilidad de pagos).
-- ---------------------------------------------------------------------------
create table if not exists public.equipos (
  id          bigint generated always as identity primary key,
  torneo_id   bigint not null references public.torneos(id) on delete cascade,
  club_id     bigint not null references public.clubes(id) on delete restrict,
  cat_id      bigint not null references public.categorias(id) on delete restrict,
  modalidad   text default '',          -- 'F7' | 'F9' | etc. (heredado de torneo_categorias)
  nombre      text default '',          -- sub-nombre opcional ("Cara A", "Cara B")
  inscripcion numeric(12,2) default 0,
  arbitraje   numeric(12,2) default 0,
  fechas      int default 0,
  monto       numeric(12,2) default 0,  -- inscripcion + arbitraje * fechas
  invitado    boolean not null default false,  -- equipo invitado: sin costo
  estado      text not null default 'activo' check (estado in ('activo','inactivo')),
  org_id      bigint not null references public.organizaciones(id) on delete cascade,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 6. PAGOS — auditoría inmutable (sin reversión en el piloto)
-- ---------------------------------------------------------------------------
create table if not exists public.pagos (
  id           bigint generated always as identity primary key,
  torneo_id    bigint not null references public.torneos(id) on delete restrict,
  club_id      bigint not null references public.clubes(id) on delete restrict,
  monto        numeric(12,2) not null check (monto >= 0),
  medio        text,
  fecha        date not null default current_date,
  nro_op       text,
  descripcion  text,
  voucher_url  text,                    -- imagen del voucher (Storage)
  estado       text not null default 'pendiente'
               check (estado in ('pendiente','aprobado','rechazado')),
  motivo       text,                    -- razón de rechazo
  created_by   uuid references public.profiles(id),   -- operador que registró
  created_at   timestamptz not null default now(),
  processed_by uuid references public.profiles(id),   -- tesorero que procesó
  processed_at timestamptz,
  org_id       bigint not null references public.organizaciones(id) on delete cascade
);

-- Log append-only de cambios de estado de pago (auditoría adicional)
create table if not exists public.pago_log (
  id         bigint generated always as identity primary key,
  pago_id    bigint not null references public.pagos(id) on delete cascade,
  accion     text not null,            -- 'registrado' | 'aprobado' | 'rechazado'
  actor      uuid references public.profiles(id),
  motivo     text,
  ts         timestamptz not null default now(),
  org_id     bigint not null references public.organizaciones(id) on delete cascade
);

-- Índices útiles
create index if not exists idx_equipos_torneo on public.equipos(torneo_id);
create index if not exists idx_equipos_club   on public.equipos(club_id);
create index if not exists idx_pagos_club     on public.pagos(club_id);
create index if not exists idx_pagos_torneo   on public.pagos(torneo_id);
create index if not exists idx_profiles_org   on public.profiles(org_id);

-- ============================================================================
--  ROW LEVEL SECURITY (aislamiento multi-tenant)
-- ============================================================================

-- Helpers: org del usuario actual y si es admin de plataforma.
-- SECURITY DEFINER para poder leer profiles sin recursión de RLS.
create or replace function public.current_org_id()
returns bigint language sql stable security definer set search_path = public as $$
  select org_id from public.profiles where id = auth.uid();
$$;

create or replace function public.is_platform_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(es_admin_plataforma, false) from public.profiles where id = auth.uid();
$$;

-- Activar RLS en todas las tablas
alter table public.organizaciones    enable row level security;
alter table public.profiles          enable row level security;
alter table public.categorias        enable row level security;
alter table public.complejos         enable row level security;
alter table public.medios_pago       enable row level security;
alter table public.clubes            enable row level security;
alter table public.torneos           enable row level security;
alter table public.torneo_categorias enable row level security;
alter table public.equipos           enable row level security;
alter table public.pagos             enable row level security;
alter table public.pago_log          enable row level security;

-- ---- PROFILES: ve el propio, los de su org, y el admin ve todos ----
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select
  using ( id = auth.uid() or is_platform_admin() or org_id = current_org_id() );
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update
  using ( id = auth.uid() or is_platform_admin() or org_id = current_org_id() )
  with check ( id = auth.uid() or is_platform_admin() or org_id = current_org_id() );
drop policy if exists profiles_insert on public.profiles;
create policy profiles_insert on public.profiles for insert
  with check ( id = auth.uid() or is_platform_admin() );

-- ---- ORGANIZACIONES: admin ve/edita todas; el usuario ve solo la suya ----
-- SELECT: admin, miembros de la org, y el dueño (para ver la org recién creada
-- durante el onboarding, antes de que su profile tenga org_id).
drop policy if exists orgs_select on public.organizaciones;
create policy orgs_select on public.organizaciones for select
  using ( is_platform_admin() or id = current_org_id() or owner_user_id = auth.uid() );
-- UPDATE/DELETE: admin o miembros de la org.
drop policy if exists orgs_all on public.organizaciones;
drop policy if exists orgs_update on public.organizaciones;
create policy orgs_update on public.organizaciones for update
  using ( is_platform_admin() or id = current_org_id() or owner_user_id = auth.uid() )
  with check ( is_platform_admin() or id = current_org_id() or owner_user_id = auth.uid() );
-- Onboarding: cualquier usuario autenticado puede crear una organización.
drop policy if exists orgs_insert on public.organizaciones;
create policy orgs_insert on public.organizaciones for insert to authenticated
  with check ( true );

-- ---- Plantilla de aislamiento por org_id para las tablas de datos ----
do $$
declare t text;
begin
  foreach t in array array[
    'categorias','complejos','medios_pago','clubes',
    'torneos','torneo_categorias','equipos','pagos','pago_log'
  ] loop
    execute format($f$
      drop policy if exists %1$s_select on public.%1$s;
      create policy %1$s_select on public.%1$s for select
        using ( is_platform_admin() or org_id = current_org_id() );
      drop policy if exists %1$s_all on public.%1$s;
      create policy %1$s_all on public.%1$s for all
        using ( is_platform_admin() or org_id = current_org_id() )
        with check ( is_platform_admin() or org_id = current_org_id() );
    $f$, t);
  end loop;
end $$;

-- ============================================================================
--  TRIGGER: crear profile automáticamente al registrarse un usuario
-- ============================================================================
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, nombre, metodo, pendiente)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email,'@',1)),
    coalesce(new.raw_app_meta_data->>'provider', 'email'),
    true   -- queda pendiente hasta completar onboarding (org + rol)
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================================
--  FIN. Siguiente paso: marcar tu usuario como Admin de Plataforma
--  (ver SETUP.md, paso 6) y configurar Storage para vouchers.
-- ============================================================================
