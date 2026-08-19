-- ============================================================
-- VERIFICACION DE LAS 5 MIGRACIONES PENDIENTES
-- v1.77 · v1.80 · v1.83 · v1.87 · v1.91
--
-- Solo lectura. Devuelve una fila por chequeo con OK / FALTA / REVISAR.
-- Pegar entero y correr.
-- ============================================================

with chequeos as (

  -- ---------- v1.77 · botón "Reanudar" trabado ----------
  select 'v1.77' as version, 'paradas publicada en realtime' as chequeo,
         (select count(*) from pg_publication_tables
           where pubname = 'supabase_realtime' and tablename = 'paradas')::text as valor,
         '1' as esperado
  union all
  select 'v1.77', 'tareas pausadas SIN parada abierta (trabadas)',
         (select count(*) from tareas t
           where t.estado = 'pausada'
             and not exists (select 1 from paradas p where p.tarea_id = t.id and p.fin is null))::text,
         '0'

  -- ---------- v1.80 · anular fichas de laboratorio ----------
  union all
  select 'v1.80', 'columnas de anulación en laboratorio',
         (select count(*) from information_schema.columns
           where table_name = 'laboratorio'
             and column_name in ('anulada_en','anulada_por','motivo_anulacion'))::text,
         '3'
  union all
  select 'v1.80', 'el estado acepta el valor anulada',
         case when exists (
           select 1 from information_schema.columns
            where table_name = 'laboratorio' and column_name = 'estado'
              and data_type in ('text','character varying')
         ) then 'texto (ok)'
         when exists (
           select 1 from pg_enum e
             join pg_type t on t.oid = e.enumtypid
            where e.enumlabel = 'anulada'
         ) then 'enum con anulada (ok)'
         else 'ENUM SIN anulada' end,
         'ok'

  -- ---------- v1.83 · protocolo de ensayo ----------
  union all
  select 'v1.83', 'columna mediciones (protocolo) en laboratorio',
         (select count(*) from information_schema.columns
           where table_name = 'laboratorio' and column_name = 'mediciones')::text,
         '1'

  -- ---------- v1.84 / v1.87 · agenda ISO ----------
  union all
  select 'v1.84', 'columnas de la matriz en sgo_agenda_iso',
         (select count(*) from information_schema.columns
           where table_name = 'sgo_agenda_iso'
             and column_name in ('semanas','bloque','orden'))::text,
         '3'
  union all
  select 'v1.87', 'actividades de la agenda (36 del R.I.T − 2 de 5S − 1 unificada)',
         (select count(*) from sgo_agenda_iso)::text,
         '33'
  union all
  select 'v1.87', 'con el texto roto (Ã / Â)',
         (select count(*) from sgo_agenda_iso
           where titulo like '%Ã%' or titulo like '%Â%')::text,
         '0'
  union all
  select 'v1.87', 'auditorías 5S que debían borrarse',
         (select count(*) from sgo_agenda_iso where titulo ilike '%5S%')::text,
         '0'
  union all
  select 'v1.87', 'semanas marcadas en total',
         (select coalesce(sum(jsonb_array_length(coalesce(semanas,'[]'::jsonb))), 0)
            from sgo_agenda_iso)::text,
         '~110'

  -- ---------- v1.91 · descartar no conformidad ----------
  union all
  select 'v1.91', 'columnas de descarte de NC en paradas',
         (select count(*) from information_schema.columns
           where table_name = 'paradas'
             and column_name in ('nc_descartada','nc_descartada_por','nc_descartada_en','nc_motivo_descarte'))::text,
         '4'
)
select
  version,
  chequeo,
  valor,
  esperado,
  case
    when esperado like '~%'          then 'REVISAR'
    when valor = esperado            then 'OK'
    else                                  'FALTA'
  end as estado
from chequeos
order by version, chequeo;
