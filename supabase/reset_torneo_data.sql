-- reset_torneo_data.sql
-- Borra equipos y categorías de torneos para empezar de cero.
-- NO elimina torneos, clubes, medios de pago ni configuración.

delete from public.equipos;
delete from public.torneo_categorias;
