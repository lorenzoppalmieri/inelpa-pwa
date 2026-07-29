-- ============================================================
-- v1.54 - FUENTES AUTOMATICAS PARA KPI SGO
-- Ejecutar despues de supabase_sgo_indicadores_v1.53.sql.
-- ============================================================

alter table sgo_indicadores add column if not exists origen text not null default 'manual';
alter table sgo_indicadores add column if not exists clave_calculo text;

alter table sgo_indicadores drop constraint if exists sgo_indicadores_origen_check;
alter table sgo_indicadores add constraint sgo_indicadores_origen_check
  check (origen in ('manual','automatico'));

alter table sgo_indicadores drop constraint if exists sgo_indicadores_clave_calculo_check;
alter table sgo_indicadores add constraint sgo_indicadores_clave_calculo_check check (
  clave_calculo is null or clave_calculo in (
    'produccion_cumplimiento','produccion_retrabajos','laboratorio_fpy',
    'logistica_cumplimiento','costo_no_calidad','acciones_en_fecha'
  )
);

alter table sgo_indicadores drop constraint if exists sgo_indicador_fuente_coherente;
alter table sgo_indicadores add constraint sgo_indicador_fuente_coherente check (
  (origen = 'manual' and clave_calculo is null) or
  (origen = 'automatico' and clave_calculo is not null)
);

-- Los valores automáticos se calculan en la PWA desde las entidades operativas;
-- valor_actual queda reservado para indicadores manuales.
update sgo_indicadores set origen = 'manual', clave_calculo = null where origen is null;
