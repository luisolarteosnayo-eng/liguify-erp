-- ============================================================================
--  LIGUIFY ERP — Datos de ejemplo para luisolarteosnayo@gmail.com
--  REQUISITO: primero regístrate con ese correo en la app (crea auth.users).
--  Luego ejecuta este script en: Supabase → SQL Editor → New query → Run.
--  Crea la organización "Liga Olarte" (propia del admin) + torneo, equipos y
--  pagos en distintos estados. Te deja como Admin de Plataforma + Organizador.
-- ============================================================================
do $$
declare
  v_uid  uuid;
  v_org  bigint;
  cat1   bigint; cat2 bigint;
  clubA  bigint; clubB bigint; clubC bigint;
  torn   bigint;
begin
  select id into v_uid from auth.users where email = 'luisolarteosnayo@gmail.com';
  if v_uid is null then
    raise exception 'No existe el usuario. Regístrate primero con luisolarteosnayo@gmail.com en la app.';
  end if;

  -- Organización propia del admin -------------------------------------------
  insert into public.organizaciones(nombre, contacto, email, ruc, telefono, plan, activo, es_propia, owner_user_id)
    values('Liga Olarte','Luis Olarte','luisolarteosnayo@gmail.com','20123456789','+51 999 111 222','plus',true,true,v_uid)
    returning id into v_org;

  -- Perfil: Admin de Plataforma + Organizador de su org ---------------------
  update public.profiles
     set org_id = v_org, rol = 'organizador', es_admin_plataforma = true,
         pendiente = false, nombre = 'Luis Olarte'
   where id = v_uid;

  -- Catálogos ----------------------------------------------------------------
  insert into public.categorias(nombre,aforo,fechas,org_id) values ('Sub-2016',10,6,v_org) returning id into cat1;
  insert into public.categorias(nombre,aforo,fechas,org_id) values ('Sub-2014', 8,6,v_org) returning id into cat2;

  insert into public.medios_pago(nombre,tipo,icon,activo,org_id) values
    ('BCP','transferencia','🏦',true,v_org),
    ('Yape','billetera','📲',true,v_org),
    ('Efectivo','efectivo','💵',true,v_org),
    ('Tarjeta de Crédito','tarjeta','💳',true,v_org);

  insert into public.complejos(nombre,direccion,distrito,org_id) values
    ('Complejo Municipal','Av. Principal 123','San Miguel',v_org);

  insert into public.clubes(nombre,delegado,telefono,provincia,org_id) values ('Tigres FC','Carlos Pérez','999111222','Lima',  v_org) returning id into clubA;
  insert into public.clubes(nombre,delegado,telefono,provincia,org_id) values ('Leones',   'Ana Gómez',   '999333444','Lima',  v_org) returning id into clubB;
  insert into public.clubes(nombre,delegado,telefono,provincia,org_id) values ('Águilas',  'Pedro Ruiz',  '999555666','Callao',v_org) returning id into clubC;

  -- Torneo + montos por categoría -------------------------------------------
  insert into public.torneos(nombre,sede,esquema,estado,inicio,fin,label,org_id)
    values('Copa Apertura 2026','Complejo Municipal','inscripcion_arbitraje','activo','2026-03-01','2026-07-31','Mar 2026 — Jul 2026',v_org)
    returning id into torn;
  insert into public.torneo_categorias(torneo_id,cat_id,modalidad,aforo,fechas,inscripcion,arbitraje,org_id) values
    (torn,cat1,'F7', 10,6,250, 80,v_org),
    (torn,cat2,'F11', 8,6,300,100,v_org);

  -- Equipos (cargos = inscripción + arbitraje × fechas) ---------------------
  insert into public.equipos(torneo_id,club_id,cat_id,nombre,inscripcion,arbitraje,fechas,monto,estado,org_id) values
    (torn,clubA,cat1,'',      250, 80,6,250+80*6, 'activo',v_org),
    (torn,clubB,cat1,'Cara A',250, 80,6,250+80*6, 'activo',v_org),
    (torn,clubC,cat2,'',      300,100,6,300+100*6,'activo',v_org);

  -- Pagos en distintos estados ----------------------------------------------
  insert into public.pagos(torneo_id,club_id,monto,medio,fecha,nro_op,descripcion,estado,org_id,created_by) values
    (torn,clubA,200,'BCP', '2026-03-05','OP-1001','Adelanto inscripción','aprobado', v_org,v_uid),
    (torn,clubB,150,'Yape','2026-03-06','OP-1002','Abono parcial',        'pendiente',v_org,v_uid),
    (torn,clubC,300,'BCP', '2026-03-07','OP-1003','Inscripción',          'pendiente',v_org,v_uid);
  update public.pagos set processed_by = v_uid, processed_at = now()
   where org_id = v_org and estado = 'aprobado';

  raise notice 'OK · Datos de ejemplo creados para la organización % (Liga Olarte).', v_org;
end $$;
