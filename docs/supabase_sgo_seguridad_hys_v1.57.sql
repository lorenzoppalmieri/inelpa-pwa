-- SGO Integral · ficha específica de Higiene y Seguridad
-- Ejecutar una sola vez en Supabase > SQL Editor.

begin;

alter table public.sgo_eventos
  add column if not exists seguridad jsonb;

comment on column public.sgo_eventos.seguridad is
  'Datos estructurados de investigación HyS para accidentes/incidentes, cuasi accidentes y observaciones preventivas.';

commit;
