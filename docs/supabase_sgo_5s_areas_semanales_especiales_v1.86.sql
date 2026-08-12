-- ============================================================
-- v1.86 - SGO / 5S: áreas semanales y auditorías especiales
-- - Logística se audita como ABASTECIMIENTO y DESPACHO.
-- - Producción incorpora CARPINTERÍA y CORTE AISLACIÓN.
-- - Todas las áreas 5S quedan con frecuencia semanal.
-- - Las auditorías especiales se crean desde la PWA como
--   controles `unico` y no alteran la agenda semanal.
-- Idempotente. No modifica ejecuciones ni informes históricos.
-- Seguridad: el servidor sólo permite crear esos controles extraordinarios
-- cuando la cuenta autenticada corresponde al usuario Lorenzo.
-- ============================================================

begin;

alter table public.sgo_controles_programados
  drop constraint if exists sgo_controles_programados_area_id_check;
alter table public.sgo_controles_programados
  add constraint sgo_controles_programados_area_id_check check (area_id in (
    'bobinado_rural','bobinado_distribucion','montaje_distribucion','montaje_rural',
    'herreria_pintura','laminado','carpinteria','corte_aislacion','administracion',
    'logistica_operativa','logistica_despacho','logistica_administrativa','mantenimiento',
    'automatismo','it','planificacion_produccion','laboratorio','gerencia_directorio','diseno'
  ));

alter table public.sgo_eventos drop constraint if exists sgo_eventos_area_id_check;
alter table public.sgo_eventos add constraint sgo_eventos_area_id_check check (
  area_id is null or area_id in (
    'bobinado_rural','bobinado_distribucion','montaje_distribucion','montaje_rural',
    'herreria_pintura','laminado','carpinteria','corte_aislacion','administracion',
    'logistica_operativa','logistica_despacho','mantenimiento','automatismo','it',
    'planificacion_produccion','laboratorio','gerencia_directorio','diseno'
  ));

alter table public.sgo_eventos drop constraint if exists sgo_eventos_area_origen_check;
alter table public.sgo_eventos add constraint sgo_eventos_area_origen_check check (
  area_origen_id is null or area_origen_id in (
    'bobinado_rural','bobinado_distribucion','montaje_distribucion','montaje_rural',
    'herreria_pintura','laminado','carpinteria','corte_aislacion','administracion',
    'logistica_operativa','logistica_despacho','logistica_administrativa','mantenimiento',
    'automatismo','it','planificacion_produccion','laboratorio','gerencia_directorio','diseno'
  ));

alter table public.sgo_indicadores drop constraint if exists sgo_indicadores_area_id_check;
alter table public.sgo_indicadores add constraint sgo_indicadores_area_id_check check (area_id in (
  'bobinado_rural','bobinado_distribucion','montaje_distribucion','montaje_rural',
  'herreria_pintura','laminado','carpinteria','corte_aislacion','administracion',
  'logistica_operativa','logistica_despacho','mantenimiento','automatismo','it',
  'planificacion_produccion','laboratorio','gerencia_directorio','diseno'
));

alter table public.sgo_garantias_iso drop constraint if exists sgo_garantias_area_responsable_check;
alter table public.sgo_garantias_iso add constraint sgo_garantias_area_responsable_check check (
  area_responsable_id is null or area_responsable_id in (
    'bobinado_rural','bobinado_distribucion','montaje_distribucion','montaje_rural',
    'herreria_pintura','laminado','carpinteria','corte_aislacion','administracion',
    'logistica_operativa','logistica_despacho','logistica_administrativa','mantenimiento',
    'automatismo','it','planificacion_produccion','laboratorio','gerencia_directorio','diseno'
  ));

drop policy if exists sgo_controles_insert on public.sgo_controles_programados;
create policy sgo_controles_insert on public.sgo_controles_programados for insert to authenticated
  with check (
    exists (
      select 1 from public.usuarios u
      where u.auth_id = (select auth.uid()) and u.activo
        and u.rol::text in ('sgo','planificador')
    )
    and (
      frecuencia <> 'unico'
      or exists (
        select 1 from public.usuarios u
        where u.auth_id = (select auth.uid()) and u.activo and lower(u.usuario) = 'lorenzo'
      )
    )
  );

drop policy if exists sgo_controles_update on public.sgo_controles_programados;
create policy sgo_controles_update on public.sgo_controles_programados for update to authenticated
  using (
    exists (
      select 1 from public.usuarios u
      where u.auth_id = (select auth.uid()) and u.activo and lower(u.usuario) = 'lorenzo'
    )
  )
  with check (
    exists (
      select 1 from public.usuarios u
      where u.auth_id = (select auth.uid()) and u.activo and lower(u.usuario) = 'lorenzo'
    )
  );

-- La antigua LOGÍSTICA OPERATIVA pasa a llamarse ABASTECIMIENTO conservando su id.
update public.sgo_controles_programados set
  titulo = 'Control semanal 5S - ABASTECIMIENTO',
  responsable = 'Nicolás', frecuencia = 'semanal', tolerancia_dias = 1, activo = true,
  actualizado_en = now(), actualizado_por = 'migracion_v1.86'
where id = 'sgo-campo-5s-logistica_operativa';

-- La agenda base existente también se fija como semanal sin mover su próxima fecha.
update public.sgo_controles_programados set
  frecuencia = 'semanal', tolerancia_dias = 1, activo = true,
  actualizado_en = now(), actualizado_por = 'migracion_v1.86'
where plantilla_campo_id = 'rit-9-2-12-5s' and frecuencia <> 'unico';

insert into public.sgo_controles_programados (
  id, titulo, tipo, area_id, pilar, norma, requisito, instrucciones,
  responsable, frecuencia, proxima_fecha, tolerancia_dias, activo,
  creado_por, actualizado_por, plantilla_campo_id
) values
  ('sgo-campo-5s-logistica_despacho', 'Control semanal 5S - DESPACHO', 'auditoria_campo', 'logistica_despacho', 'mejora', 'sgo_integral', 'R.I.T. 9.2/12', 'Evaluar las cinco S, documentar hallazgos y asignar acciones verificables.', 'Nicolás', 'semanal', current_date, 1, true, 'migracion_v1.86', 'migracion_v1.86', 'rit-9-2-12-5s'),
  ('sgo-campo-5s-carpinteria', 'Control semanal 5S - CARPINTERÍA', 'auditoria_campo', 'carpinteria', 'mejora', 'sgo_integral', 'R.I.T. 9.2/12', 'Evaluar las cinco S, documentar hallazgos y asignar acciones verificables.', 'Lara', 'semanal', current_date, 1, true, 'migracion_v1.86', 'migracion_v1.86', 'rit-9-2-12-5s'),
  ('sgo-campo-5s-corte_aislacion', 'Control semanal 5S - CORTE AISLACIÓN', 'auditoria_campo', 'corte_aislacion', 'mejora', 'sgo_integral', 'R.I.T. 9.2/12', 'Evaluar las cinco S, documentar hallazgos y asignar acciones verificables.', 'Lara', 'semanal', current_date, 1, true, 'migracion_v1.86', 'migracion_v1.86', 'rit-9-2-12-5s')
on conflict (id) do update set
  titulo = excluded.titulo, area_id = excluded.area_id, responsable = excluded.responsable,
  frecuencia = 'semanal', tolerancia_dias = 1, activo = true,
  plantilla_campo_id = excluded.plantilla_campo_id,
  actualizado_en = now(), actualizado_por = 'migracion_v1.86';

notify pgrst, 'reload schema';
commit;

select id, titulo, area_id, responsable, frecuencia, proxima_fecha, activo
from public.sgo_controles_programados
where plantilla_campo_id = 'rit-9-2-12-5s'
order by responsable, area_id;
