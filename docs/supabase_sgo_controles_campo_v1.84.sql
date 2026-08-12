-- ============================================================
-- v1.84 - SGO CONTROLES DE CAMPO / 5S
-- Plantilla R.I.T. 9.2/12, ejecución estructurada, evidencia
-- fotográfica privada y agenda inicial para Producción/Logística.
-- Ejecutar una sola vez después de v1.67.
-- ============================================================

begin;

alter table public.sgo_controles_programados
  drop constraint if exists sgo_controles_programados_tipo_check;
alter table public.sgo_controles_programados
  add constraint sgo_controles_programados_tipo_check check (
    tipo in ('proceso_productivo','semielaborado','administrativo','auditoria_iso',
      'auditoria_logistica','auditoria_campo','seguridad','ambiente')
  );

alter table public.sgo_controles_programados
  add column if not exists plantilla_campo_id text;

alter table public.sgo_control_ejecuciones
  add column if not exists auditoria_campo jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'sgo_control_ejecuciones_auditoria_campo_check'
      and conrelid = 'public.sgo_control_ejecuciones'::regclass
  ) then
    alter table public.sgo_control_ejecuciones
      add constraint sgo_control_ejecuciones_auditoria_campo_check check (
        auditoria_campo is null or (
          jsonb_typeof(auditoria_campo) = 'object'
          and auditoria_campo ->> 'tipo' = '5s'
          and auditoria_campo ? 'auditor'
          and auditoria_campo ? 'usuarioAcceso'
          and auditoria_campo ? 'respuestas'
          and jsonb_typeof(auditoria_campo -> 'respuestas') = 'array'
        )
      );
  end if;
end $$;

-- Las auditorías de campo admiten controles extraordinarios en una misma fecha.
drop index if exists public.uq_sgo_control_ejecuciones_programadas;
create unique index uq_sgo_control_ejecuciones_programadas
  on public.sgo_control_ejecuciones (control_id, fecha_programada)
  where auditoria_logistica is null and auditoria_campo is null;

create index if not exists idx_sgo_controles_plantilla_campo
  on public.sgo_controles_programados (plantilla_campo_id, area_id, activo)
  where plantilla_campo_id is not null;
create index if not exists idx_sgo_ejecuciones_campo_fecha
  on public.sgo_control_ejecuciones (ejecutado_en desc)
  where auditoria_campo is not null;
create index if not exists idx_sgo_ejecuciones_campo_json
  on public.sgo_control_ejecuciones using gin (auditoria_campo jsonb_path_ops)
  where auditoria_campo is not null;

-- Agenda inicial. El usuario puede cambiar fecha, frecuencia y responsable
-- desde la PWA sin alterar la plantilla ni el historial.
insert into public.sgo_controles_programados (
  id, titulo, tipo, area_id, pilar, norma, requisito, instrucciones,
  responsable, frecuencia, proxima_fecha, tolerancia_dias, activo,
  creado_por, actualizado_por, plantilla_campo_id
) values
  ('sgo-campo-5s-bobinado_rural', 'Control semanal 5S - BOBINADO RURAL', 'auditoria_campo', 'bobinado_rural', 'mejora', 'sgo_integral', 'R.I.T. 9.2/12', 'Evaluar las cinco S, documentar hallazgos y asignar acciones verificables.', 'Lara', 'semanal', current_date, 1, true, 'migracion_v1.84', 'migracion_v1.84', 'rit-9-2-12-5s'),
  ('sgo-campo-5s-bobinado_distribucion', 'Control semanal 5S - BOBINADO DISTRIBUCION', 'auditoria_campo', 'bobinado_distribucion', 'mejora', 'sgo_integral', 'R.I.T. 9.2/12', 'Evaluar las cinco S, documentar hallazgos y asignar acciones verificables.', 'Lara', 'semanal', current_date, 1, true, 'migracion_v1.84', 'migracion_v1.84', 'rit-9-2-12-5s'),
  ('sgo-campo-5s-montaje_distribucion', 'Control semanal 5S - MONTAJE DISTRIBUCION', 'auditoria_campo', 'montaje_distribucion', 'mejora', 'sgo_integral', 'R.I.T. 9.2/12', 'Evaluar las cinco S, documentar hallazgos y asignar acciones verificables.', 'Lara', 'semanal', current_date, 1, true, 'migracion_v1.84', 'migracion_v1.84', 'rit-9-2-12-5s'),
  ('sgo-campo-5s-montaje_rural', 'Control semanal 5S - MONTAJE RURAL', 'auditoria_campo', 'montaje_rural', 'mejora', 'sgo_integral', 'R.I.T. 9.2/12', 'Evaluar las cinco S, documentar hallazgos y asignar acciones verificables.', 'Lara', 'semanal', current_date, 1, true, 'migracion_v1.84', 'migracion_v1.84', 'rit-9-2-12-5s'),
  ('sgo-campo-5s-herreria_pintura', 'Control semanal 5S - HERRERIA Y PINTURA', 'auditoria_campo', 'herreria_pintura', 'mejora', 'sgo_integral', 'R.I.T. 9.2/12', 'Evaluar las cinco S, documentar hallazgos y asignar acciones verificables.', 'Lara', 'semanal', current_date, 1, true, 'migracion_v1.84', 'migracion_v1.84', 'rit-9-2-12-5s'),
  ('sgo-campo-5s-laminado', 'Control semanal 5S - LAMINADO', 'auditoria_campo', 'laminado', 'mejora', 'sgo_integral', 'R.I.T. 9.2/12', 'Evaluar las cinco S, documentar hallazgos y asignar acciones verificables.', 'Lara', 'semanal', current_date, 1, true, 'migracion_v1.84', 'migracion_v1.84', 'rit-9-2-12-5s'),
  ('sgo-campo-5s-logistica_operativa', 'Control semanal 5S - LOGISTICA OPERATIVA', 'auditoria_campo', 'logistica_operativa', 'mejora', 'sgo_integral', 'R.I.T. 9.2/12', 'Evaluar las cinco S, documentar hallazgos y asignar acciones verificables.', 'Nicolás', 'semanal', current_date, 1, true, 'migracion_v1.84', 'migracion_v1.84', 'rit-9-2-12-5s')
on conflict (id) do update set
  plantilla_campo_id = excluded.plantilla_campo_id,
  tipo = excluded.tipo,
  requisito = excluded.requisito;

comment on column public.sgo_controles_programados.plantilla_campo_id is
  'Identificador estable de la plantilla versionada usada por el control de campo.';
comment on column public.sgo_control_ejecuciones.auditoria_campo is
  'Informe inmutable: identidad real, cuenta de acceso, versión, respuestas, puntajes y eventos generados.';

-- Bucket privado. Se guardan paths; la PWA genera URLs firmadas temporales.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('sgo-evidencias', 'sgo-evidencias', false, 8388608, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists sgo_evidencias_select on storage.objects;
drop policy if exists sgo_evidencias_insert on storage.objects;
create policy sgo_evidencias_select on storage.objects for select to authenticated
  using (
    bucket_id = 'sgo-evidencias'
    and exists (select 1 from public.usuarios u where u.auth_id = auth.uid() and u.activo and u.rol::text in ('sgo','planificador'))
  );
create policy sgo_evidencias_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'sgo-evidencias'
    and exists (select 1 from public.usuarios u where u.auth_id = auth.uid() and u.activo and u.rol::text in ('sgo','planificador'))
  );

-- La bitácora acepta las mismas entidades; el contenido JSON queda registrado
-- dentro de la ejecución inmutable ya auditada por el trigger v1.65.

do $$ begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'sgo_control_ejecuciones'
  ) then
    alter publication supabase_realtime add table public.sgo_control_ejecuciones;
  end if;
end $$;

notify pgrst, 'reload schema';
commit;

select 'SGO controles de campo v1.84 instalado' as resultado;
