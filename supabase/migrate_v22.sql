-- migrate_v22.sql — Cobranzas por WhatsApp (Cloud API de Meta), mismo esquema que Academias
-- pero en el esquema public y por organización. Comparte número y secretos con Academias;
-- la plantilla es distinta (cobranza_torneos) y el webhook enruta por teléfono.

-- Organización: WhatsApp propio para respuestas (auto-reply) y medios de cobro en una línea ({{5}} de la plantilla)
alter table public.organizaciones
  add column if not exists whatsapp_respuestas text,
  add column if not exists medios_cobro        text;

-- Club: teléfono normalizado (solo dígitos) para emparejar entrantes/salientes + último recordatorio
alter table public.clubes
  add column if not exists telefono_norm text generated always as (regexp_replace(coalesce(telefono,''), '\D', '', 'g')) stored,
  add column if not exists ultimo_recordatorio date;
create index if not exists idx_clubes_tel_norm on public.clubes(telefono_norm);
-- Equipos: el contacto pagador también puede responder con su propio celular
alter table public.equipos
  add column if not exists contacto_tel_norm text generated always as (regexp_replace(coalesce(contacto_telefono,''), '\D', '', 'g')) stored;
create index if not exists idx_equipos_contacto_tel_norm on public.equipos(contacto_tel_norm);

-- Bandeja
create table if not exists public.wsp_conversaciones (
  id                 bigint generated always as identity primary key,
  org_id             bigint references public.organizaciones(id) on delete cascade,  -- null = teléfono no identificado
  club_id            bigint references public.clubes(id) on delete set null,
  telefono           text not null,
  nombre             text,
  ultimo_mensaje     text,
  ultimo_mensaje_at  timestamptz,
  ultimo_entrante_at timestamptz,
  no_leidos          int not null default 0,
  created_at         timestamptz not null default now(),
  unique (telefono, org_id)
);
create index if not exists idx_wsp_conv_org on public.wsp_conversaciones(org_id, ultimo_mensaje_at desc);

create table if not exists public.wsp_mensajes (
  id              bigint generated always as identity primary key,
  conversacion_id bigint not null references public.wsp_conversaciones(id) on delete cascade,
  org_id          bigint references public.organizaciones(id) on delete cascade,
  direccion       text not null check (direccion in ('in','out')),
  tipo            text not null default 'texto',          -- texto | imagen | documento | plantilla
  cuerpo          text,
  media_path      text,                                   -- 'vstore:wsp/<conv>/<archivo>' en el bucket privado 'vouchers'
  wa_id           text unique,                            -- id de Meta (dedupe + estados)
  enviado_por     text,                                   -- usuario / 'auto' / null (entrante)
  estado          text,                                   -- sent | delivered | read | failed
  created_at      timestamptz not null default now()
);
create index if not exists idx_wsp_msj_conv on public.wsp_mensajes(conversacion_id, created_at);

alter table public.wsp_conversaciones enable row level security;
alter table public.wsp_mensajes       enable row level security;
drop policy if exists wsp_conv_all on public.wsp_conversaciones;
create policy wsp_conv_all on public.wsp_conversaciones for all to authenticated
  using ( is_platform_admin() or org_id = current_org_id() ) with check ( is_platform_admin() or org_id = current_org_id() );
drop policy if exists wsp_msj_all on public.wsp_mensajes;
create policy wsp_msj_all on public.wsp_mensajes for all to authenticated
  using ( is_platform_admin() or org_id = current_org_id() ) with check ( is_platform_admin() or org_id = current_org_id() );
