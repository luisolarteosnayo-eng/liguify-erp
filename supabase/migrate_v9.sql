-- migrate_v9.sql — Imagen de cabecera del torneo
-- Se usa como banner en el Estado de Cuenta (y en la imagen descargable).

-- 1. Columna con la URL de la imagen
alter table public.torneos add column if not exists header_url text;

-- 2. Bucket público de Storage para las cabeceras
insert into storage.buckets (id, name, public)
values ('torneos', 'torneos', true)
on conflict (id) do nothing;

-- 3. Políticas de Storage: lectura pública, escritura/actualización para autenticados
drop policy if exists torneos_storage_read on storage.objects;
create policy torneos_storage_read on storage.objects for select
  using ( bucket_id = 'torneos' );

drop policy if exists torneos_storage_insert on storage.objects;
create policy torneos_storage_insert on storage.objects for insert to authenticated
  with check ( bucket_id = 'torneos' );

drop policy if exists torneos_storage_update on storage.objects;
create policy torneos_storage_update on storage.objects for update to authenticated
  using ( bucket_id = 'torneos' )
  with check ( bucket_id = 'torneos' );
