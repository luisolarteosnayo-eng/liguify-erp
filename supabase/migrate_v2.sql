-- ============================================================================
--  LIGUIFY ERP — Migración v2
--  Ejecutar en: Supabase → SQL Editor → New query → Run
--  Aplica sobre la BD existente (idempotente).
-- ============================================================================

-- 1. Fecha límite de pago en torneos
alter table public.torneos
  add column if not exists fecha_venc date;

-- 2. Equipos invitados (sin costo)
alter table public.equipos
  add column if not exists invitado boolean not null default false;

-- 3. Permitir monto = 0 en pagos (equipos invitados pueden registrar $0)
alter table public.pagos
  drop constraint if exists pagos_monto_check;
alter table public.pagos
  add constraint pagos_monto_check check (monto >= 0);

-- ============================================================================
--  DIAGNÓSTICO: usuarios y organizaciones para revisar mary@canchasperu1.com
-- ============================================================================

-- Ver qué organización tiene mary y si está dentro de otra org
select
  u.email,
  p.nombre,
  p.rol,
  p.org_id,
  o.nombre as org_nombre,
  o.es_propia,
  o.owner_user_id
from auth.users u
join public.profiles p on p.id = u.id
left join public.organizaciones o on o.id = p.org_id
where u.email = 'mary@canchasperu1.com';

-- ============================================================================
--  FIX para mary@canchasperu1.com si su org_id apunta a Liga Olarte:
--  Ejecuta solo si el query anterior muestra org_id de Liga Olarte.
-- ============================================================================
-- Si mary tiene su propia org (owner_user_id = su uid), déjala así.
-- Si por error su profile.org_id apunta a la org de Luis, corrígelo:

/*  -- DESCOMENTAR solo si es necesario:
do $$
declare
  v_mary_uid uuid;
  v_mary_org bigint;
begin
  select u.id into v_mary_uid from auth.users u where u.email='mary@canchasperu1.com';
  if v_mary_uid is null then raise notice 'mary no encontrada'; return; end if;

  -- Buscar si mary tiene una org propia (donde ella es owner)
  select id into v_mary_org from public.organizaciones
    where owner_user_id = v_mary_uid limit 1;

  if v_mary_org is null then
    -- mary no tiene org propia: crear una para ella o dejarla sin org
    raise notice 'mary no tiene org propia. Crea una manualmente o desactívala.';
  else
    -- Apuntar su profile a su propia org
    update public.profiles set org_id = v_mary_org where id = v_mary_uid;
    raise notice 'Profile de mary actualizado a org %', v_mary_org;
  end if;
end $$;
*/

-- ============================================================================
--  FIN — Revisa los resultados del SELECT antes de ejecutar cualquier UPDATE
-- ============================================================================
