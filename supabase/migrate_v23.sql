-- migrate_v23.sql — Estado de seguimiento de cobranza en la bandeja de WhatsApp (igual que Academias)
--   sin_respuesta  → el cliente escribió y nadie lo atiende (lo pone el webhook al entrar un mensaje)
--   pago · pagara_cancha · pendiente_pago (lo pone el recordatorio) · baja
alter table public.wsp_conversaciones add column if not exists marcada text;
alter table public.wsp_conversaciones drop constraint if exists wsp_conversaciones_marcada_check;
alter table public.wsp_conversaciones add constraint wsp_conversaciones_marcada_check
  check (marcada is null or marcada in ('sin_respuesta','pago','pagara_cancha','pendiente_pago','baja'));
