# Conexión a Supabase — Guía de configuración

Liguify ERP · Esquema + Autenticación. Sigue los pasos en orden.

---

## 1. Crear el proyecto (gratis)

1. Entra a **https://supabase.com** → **Start your project** → inicia sesión con GitHub o correo.
2. **New project**:
   - **Name**: `liguify-erp`
   - **Database Password**: genera una fuerte y **guárdala** (la usarás para backups/SQL directo).
   - **Region**: la más cercana (ej. *South America (São Paulo)*).
   - **Plan**: Free.
3. Espera ~2 minutos a que se aprovisione la base de datos.

## 2. Cargar el esquema

1. En el menú lateral: **SQL Editor** → **New query**.
2. Abre `supabase/schema.sql` (este repo), copia **todo** el contenido y pégalo.
3. Pulsa **Run**. Debe decir *Success. No rows returned*. Esto crea tablas, RLS y triggers.

## 3. Obtener las llaves (URL + anon key)

1. Menú lateral → **Project Settings** (⚙️) → **API**.
2. Copia:
   - **Project URL** → `https://xxxxxxxx.supabase.co`
   - **Project API keys → anon / public** → `eyJhbGciOi...`
3. Pega ambos en `js/supabase-config.js` (ver paso 5).

> La **anon key** es pública y segura para el frontend: la seguridad real la imponen las políticas RLS del paso 2. **Nunca** uses la `service_role` key en el navegador.

## 4. Activar autenticación

1. Menú → **Authentication** → **Providers**.
   - **Email**: ya viene activado. (En *Email* puedes desactivar "Confirm email" durante pruebas para entrar sin verificar el correo.)
   - **Google**: actívalo si lo quieres. Necesitas un *OAuth Client ID/Secret* de Google Cloud Console y agregar la *redirect URL* que Supabase te muestra. (Opcional al inicio: puedes empezar solo con Email.)
2. Menú → **Authentication** → **URL Configuration** → en **Site URL** y **Redirect URLs** agrega la URL desde donde abrirás la app (ej. `http://localhost:5500` si usas Live Server, o tu dominio).

## 5. Conectar el frontend

1. Abre `js/supabase-config.js` y reemplaza los placeholders:
   ```js
   window.SUPABASE_URL = 'https://TU-PROYECTO.supabase.co';
   window.SUPABASE_ANON_KEY = 'TU-ANON-KEY';
   ```
2. En `index.html`, dentro del `<head>` (o antes de tu `<script>` principal), agrega:
   ```html
   <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
   <script src="js/supabase-config.js"></script>
   <script src="js/supabase-api.js"></script>
   ```

## 6. Crearte como Administrador de Plataforma

1. Regístrate una vez desde la app (o en **Authentication → Users → Add user**) con `luisolarteosnayo@gmail.com`.
2. Ve a **SQL Editor** y ejecuta (ajusta el correo si cambia):
   ```sql
   update public.profiles
     set es_admin_plataforma = true, rol = 'organizador', pendiente = false, nombre = 'Luis Olarte'
   where email = 'luisolarteosnayo@gmail.com';
   ```

## 7. (Opcional) Storage para vouchers

1. Menú → **Storage** → **New bucket** → nombre `vouchers`, **Public** desactivado.
2. Política de subida (SQL Editor):
   ```sql
   create policy "vouchers_rw" on storage.objects for all to authenticated
     using ( bucket_id = 'vouchers' ) with check ( bucket_id = 'vouchers' );
   ```

---

### Verificación rápida
- En **Table Editor** debes ver las 11 tablas (`organizaciones`, `profiles`, `torneos`, `equipos`, `pagos`, …).
- Al registrar un usuario, en `profiles` aparece una fila con `pendiente = true`.
- Sin sesión, ninguna consulta devuelve datos (RLS activo) ✓.

Cuando tengas la URL + anon key pegadas, avísame y conecto el login real de la app.
