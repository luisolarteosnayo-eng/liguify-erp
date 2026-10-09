-- migrate_v20.sql — Emisión de documentos: Recibos (sin valor fiscal) y Boletas/Facturas vía Nubefact
-- Misma funcionalidad que en Liguify Academias. La configuración fiscal (RUC emisor, series,
-- correlativos) es por EMPRESA (organización). El tipo de documento depende del medio de pago
-- (genera_sunat) y de lo que pida el cliente en cada pago (boleta por defecto / factura con RUC).

-- Medio de pago: si genera comprobante SUNAT (boleta/factura) o solo recibo interno
alter table public.medios_pago add column if not exists genera_sunat boolean not null default false;

-- Datos fiscales del emisor + series y correlativos (por organización)
alter table public.organizaciones
  add column if not exists ruc_emisor          text,
  add column if not exists razon_social_emisor text,
  add column if not exists direccion_fiscal    text,
  add column if not exists serie_boleta        text,
  add column if not exists serie_factura       text,
  add column if not exists correlativo_boleta  int,
  add column if not exists correlativo_factura int,
  add column if not exists correlativo_recibo  int;

-- Documento por pago
alter table public.pagos
  add column if not exists doc_solicitado text default 'boleta',   -- 'boleta' | 'factura' (lo que pide el cliente)
  add column if not exists doc_tipo       text,                    -- 'recibo' | 'boleta' | 'factura' (emitido)
  add column if not exists doc_serie      text,
  add column if not exists doc_numero     int,
  add column if not exists doc_pdf_url    text,
  add column if not exists doc_xml_url    text,
  add column if not exists sunat_estado   text,                    -- null | 'emitido' | 'error'
  add column if not exists sunat_error    text,
  add column if not exists emitido_at     timestamptz;
