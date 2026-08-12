-- v1.87 - Agenda ISO + Tareas SGO. Idempotente.
begin;

create table if not exists public.sgo_agenda_iso (
  id text primary key, titulo text not null, categoria text not null check (categoria in ('auditoria_externa','auditoria_interna','informe','legal_hys','medicion','reunion','otro')),
  normas text[] not null default '{}', requisito text, area text, responsable text not null,
  frecuencia text not null check (frecuencia in ('unica','mensual','trimestral','semestral','anual')),
  fecha_objetivo date, aviso_dias integer not null default 30 check (aviso_dias >= 0),
  estado text not null default 'sin_programar' check (estado in ('sin_programar','planificada','en_curso','esperando_tercero','esperando_evidencia','completada','verificada','reprogramada','no_aplica')),
  criticidad text not null default 'media' check (criticidad in ('baja','media','alta','critica')),
  evidencia_esperada text, evidencia text, resultado text, observaciones text, fuente text,
  completada_en timestamptz, completada_por text, verificada_en timestamptz, verificada_por text, verificacion text,
  creado_en timestamptz not null default now(), creado_por text not null,
  actualizado_en timestamptz not null default now(), actualizado_por text not null,
  check (normas <@ array['iso_9001','iso_45001','iso_14001','sgi']::text[])
);
create index if not exists idx_sgo_agenda_iso_fecha on public.sgo_agenda_iso (fecha_objetivo, estado);
create index if not exists idx_sgo_agenda_iso_responsable on public.sgo_agenda_iso (responsable, estado);
create index if not exists idx_sgo_agenda_iso_normas on public.sgo_agenda_iso using gin (normas);

create table if not exists public.sgo_tareas (
  id text primary key, titulo text not null, objetivo text not null, descripcion text not null,
  asignado_a text not null check (asignado_a in ('azul','nicolas.sgo','lara')),
  importancia text not null check (importancia in ('baja','media','alta','critica')),
  tiempo_estimado_min integer not null check (tiempo_estimado_min > 0), fecha_limite date,
  estado text not null default 'asignada' check (estado in ('asignada','tomada','en_proceso','finalizada','verificada','cancelada')),
  plan_resolucion text, tomada_en timestamptz, tomada_por text, conclusion text,
  finalizada_en timestamptz, finalizada_por text, verificada_en timestamptz, verificada_por text,
  creado_en timestamptz not null default now(), creado_por text not null,
  actualizado_en timestamptz not null default now(), actualizado_por text not null
);
create index if not exists idx_sgo_tareas_bandeja on public.sgo_tareas (asignado_a, estado, fecha_limite);

create table if not exists public.sgo_tarea_comentarios (
  id text primary key, tarea_id text not null references public.sgo_tareas(id) on delete cascade,
  autor text not null, texto text not null, tipo text not null check (tipo in ('comentario','plan','conclusion','verificacion')),
  creado_en timestamptz not null default now()
);
create index if not exists idx_sgo_tarea_comentarios_tarea on public.sgo_tarea_comentarios (tarea_id, creado_en);

grant select, insert, update, delete on public.sgo_agenda_iso to authenticated;
grant select, insert, update, delete on public.sgo_tareas to authenticated;
grant select, insert on public.sgo_tarea_comentarios to authenticated;
alter table public.sgo_agenda_iso enable row level security;
alter table public.sgo_tareas enable row level security;
alter table public.sgo_tarea_comentarios enable row level security;

drop policy if exists sgo_agenda_iso_select on public.sgo_agenda_iso;
create policy sgo_agenda_iso_select on public.sgo_agenda_iso for select to authenticated using (
  exists (select 1 from public.usuarios u where u.auth_id=(select auth.uid()) and u.activo and u.rol::text in ('sgo','planificador'))
);
drop policy if exists sgo_agenda_iso_insert on public.sgo_agenda_iso;
create policy sgo_agenda_iso_insert on public.sgo_agenda_iso for insert to authenticated with check (
  exists (select 1 from public.usuarios u where u.auth_id=(select auth.uid()) and u.activo and lower(u.usuario) in ('lorenzo','azul'))
);
drop policy if exists sgo_agenda_iso_update on public.sgo_agenda_iso;
create policy sgo_agenda_iso_update on public.sgo_agenda_iso for update to authenticated using (
  exists (select 1 from public.usuarios u where u.auth_id=(select auth.uid()) and u.activo and lower(u.usuario) in ('lorenzo','azul'))
) with check (
  exists (select 1 from public.usuarios u where u.auth_id=(select auth.uid()) and u.activo and lower(u.usuario) in ('lorenzo','azul'))
);
drop policy if exists sgo_agenda_iso_delete on public.sgo_agenda_iso;
create policy sgo_agenda_iso_delete on public.sgo_agenda_iso for delete to authenticated using (
  exists (select 1 from public.usuarios u where u.auth_id=(select auth.uid()) and u.activo and lower(u.usuario)='lorenzo')
);

create or replace function public.sgo_proteger_agenda_iso() returns trigger language plpgsql set search_path=public as $$
declare actor text;
begin
  select lower(u.usuario) into actor from public.usuarios u where u.auth_id=(select auth.uid()) and u.activo limit 1;
  if actor is null and session_user in ('postgres','service_role','supabase_admin') then return new; end if;
  if actor='azul' and (new.verificada_en is distinct from old.verificada_en or new.verificada_por is distinct from old.verificada_por or new.verificacion is distinct from old.verificacion or new.estado='verificada') then
    raise exception 'Solo Lorenzo puede verificar una actividad ISO.';
  end if;
  return new;
end $$;
drop trigger if exists trg_sgo_proteger_agenda_iso on public.sgo_agenda_iso;
create trigger trg_sgo_proteger_agenda_iso before update on public.sgo_agenda_iso for each row execute function public.sgo_proteger_agenda_iso();

drop policy if exists sgo_tareas_select on public.sgo_tareas;
create policy sgo_tareas_select on public.sgo_tareas for select to authenticated using (
  exists (select 1 from public.usuarios u where u.auth_id=(select auth.uid()) and u.activo and u.rol::text in ('sgo','planificador'))
);
drop policy if exists sgo_tareas_insert on public.sgo_tareas;
create policy sgo_tareas_insert on public.sgo_tareas for insert to authenticated with check (
  exists (select 1 from public.usuarios u where u.auth_id=(select auth.uid()) and u.activo and lower(u.usuario)='lorenzo')
);
drop policy if exists sgo_tareas_update on public.sgo_tareas;
create policy sgo_tareas_update on public.sgo_tareas for update to authenticated using (
  exists (select 1 from public.usuarios u where u.auth_id=(select auth.uid()) and u.activo and (lower(u.usuario)='lorenzo' or lower(u.usuario)=sgo_tareas.asignado_a))
) with check (
  exists (select 1 from public.usuarios u where u.auth_id=(select auth.uid()) and u.activo and (lower(u.usuario)='lorenzo' or lower(u.usuario)=sgo_tareas.asignado_a))
);
drop policy if exists sgo_tareas_delete on public.sgo_tareas;
create policy sgo_tareas_delete on public.sgo_tareas for delete to authenticated using (
  exists (select 1 from public.usuarios u where u.auth_id=(select auth.uid()) and u.activo and lower(u.usuario)='lorenzo')
);

create or replace function public.sgo_proteger_tarea() returns trigger language plpgsql set search_path=public as $$
declare actor text;
begin
  select lower(u.usuario) into actor from public.usuarios u where u.auth_id=(select auth.uid()) and u.activo limit 1;
  if actor is null and session_user in ('postgres','service_role','supabase_admin') then return new; end if;
  if actor <> 'lorenzo' then
    if new.asignado_a is distinct from old.asignado_a or new.titulo is distinct from old.titulo or new.objetivo is distinct from old.objetivo or new.descripcion is distinct from old.descripcion or new.importancia is distinct from old.importancia or new.tiempo_estimado_min is distinct from old.tiempo_estimado_min or new.fecha_limite is distinct from old.fecha_limite then
      raise exception 'Solo Lorenzo puede modificar la definición de la tarea.';
    end if;
    if new.estado in ('verificada','cancelada') or new.verificada_en is distinct from old.verificada_en or new.verificada_por is distinct from old.verificada_por then
      raise exception 'Solo Lorenzo puede verificar o cancelar la tarea.';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_sgo_proteger_tarea on public.sgo_tareas;
create trigger trg_sgo_proteger_tarea before update on public.sgo_tareas for each row execute function public.sgo_proteger_tarea();

drop policy if exists sgo_tarea_comentarios_select on public.sgo_tarea_comentarios;
create policy sgo_tarea_comentarios_select on public.sgo_tarea_comentarios for select to authenticated using (
  exists (select 1 from public.usuarios u where u.auth_id=(select auth.uid()) and u.activo and u.rol::text in ('sgo','planificador'))
);
drop policy if exists sgo_tarea_comentarios_insert on public.sgo_tarea_comentarios;
create policy sgo_tarea_comentarios_insert on public.sgo_tarea_comentarios for insert to authenticated with check (
  autor=(select lower(u.usuario) from public.usuarios u where u.auth_id=(select auth.uid()) and u.activo limit 1)
  and exists (select 1 from public.sgo_tareas t join public.usuarios u on u.auth_id=(select auth.uid()) and u.activo where t.id=tarea_id and (lower(u.usuario)='lorenzo' or lower(u.usuario)=t.asignado_a))
);

-- Carga inicial: obligaciones identificadas en R.I.T. 6.2/05 (hoja 2026).
insert into public.sgo_agenda_iso (id,titulo,categoria,normas,responsable,frecuencia,fecha_objetivo,aviso_dias,estado,criticidad,evidencia_esperada,fuente,creado_por,actualizado_por) values
('agenda-2026-auditoria-iso','Auditoría ISO','auditoria_externa',array['iso_9001','iso_45001','iso_14001'],'Azul','anual',null,60,'sin_programar','critica','Plan de auditoría, informe y certificados','R.I.T. 6.2/05 · hoja 2026','migracion_v1.87','migracion_v1.87'),
('agenda-2026-auditoria-sgi','Auditoría interna SGI','auditoria_interna',array['iso_9001','iso_45001','iso_14001','sgi'],'Azul','anual','2026-02-06',30,'planificada','alta','Programa, listas de verificación e informe','R.I.T. 6.2/05 · hoja 2026','migracion_v1.87','migracion_v1.87'),
('agenda-2026-compras','Auditoría interna Compras','auditoria_interna',array['iso_9001','sgi'],'Azul','anual',null,30,'sin_programar','alta','Informe y hallazgos','R.I.T. 6.2/05 · hoja 2026','migracion_v1.87','migracion_v1.87'),
('agenda-2026-ventas','Auditoría interna Ventas','auditoria_interna',array['iso_9001','sgi'],'Azul','anual',null,30,'sin_programar','alta','Informe y hallazgos','R.I.T. 6.2/05 · hoja 2026','migracion_v1.87','migracion_v1.87'),
('agenda-2026-diseno','Auditoría interna Diseño','auditoria_interna',array['iso_9001','sgi'],'Azul','anual',null,30,'sin_programar','alta','Informe y hallazgos','R.I.T. 6.2/05 · hoja 2026','migracion_v1.87','migracion_v1.87'),
('agenda-2026-rrhh','Auditoría interna Recursos Humanos','auditoria_interna',array['iso_9001','iso_45001','iso_14001','sgi'],'Azul','anual',null,30,'sin_programar','alta','Informe y hallazgos','R.I.T. 6.2/05 · hoja 2026','migracion_v1.87','migracion_v1.87'),
('agenda-2026-produccion-lab','Auditoría interna Producción / Laboratorio','auditoria_interna',array['iso_9001','iso_45001','iso_14001','sgi'],'Azul','anual',null,30,'sin_programar','alta','Informe y hallazgos','R.I.T. 6.2/05 · hoja 2026','migracion_v1.87','migracion_v1.87'),
('agenda-2026-mant-autom','Auditoría interna Mantenimiento / Automatismo','auditoria_interna',array['iso_9001','iso_45001','iso_14001','sgi'],'Azul','anual',null,30,'sin_programar','alta','Informe y hallazgos','R.I.T. 6.2/05 · hoja 2026','migracion_v1.87','migracion_v1.87'),
('agenda-2026-contabilidad','Auditoría interna Contabilidad','auditoria_interna',array['iso_9001','sgi'],'Azul','anual',null,30,'sin_programar','media','Informe y hallazgos','R.I.T. 6.2/05 · hoja 2026','migracion_v1.87','migracion_v1.87'),
('agenda-2026-its','Auditoría interna IT','auditoria_interna',array['iso_9001','sgi'],'Azul','anual',null,30,'sin_programar','alta','Informe y hallazgos','R.I.T. 6.2/05 · hoja 2026','migracion_v1.87','migracion_v1.87'),
('agenda-2026-direccion','Auditoría interna Dirección','auditoria_interna',array['iso_9001','iso_45001','iso_14001','sgi'],'Azul','anual',null,30,'sin_programar','alta','Informe y hallazgos','R.I.T. 6.2/05 · hoja 2026','migracion_v1.87','migracion_v1.87'),
('agenda-2026-logistica','Auditoría interna Logística','auditoria_interna',array['iso_9001','iso_45001','iso_14001','sgi'],'Azul','anual',null,30,'sin_programar','alta','Informe y hallazgos','R.I.T. 6.2/05 · hoja 2026','migracion_v1.87','migracion_v1.87'),
('agenda-2026-sst','Auditoría interna SST','auditoria_interna',array['iso_45001','sgi'],'Azul','anual',null,30,'sin_programar','critica','Informe y hallazgos','R.I.T. 6.2/05 · hoja 2026','migracion_v1.87','migracion_v1.87'),
('agenda-2026-sga','Auditoría interna SGA','auditoria_interna',array['iso_14001','sgi'],'Azul','anual',null,30,'sin_programar','critica','Informe y hallazgos','R.I.T. 6.2/05 · hoja 2026','migracion_v1.87','migracion_v1.87'),
('agenda-2026-revision-direccion','Informe de Revisión por la Dirección','informe',array['iso_9001','iso_45001','iso_14001','sgi'],'Azul','anual','2026-03-06',30,'planificada','critica','Informe y acta de revisión','R.I.T. 6.2/05 · hoja 2026','migracion_v1.87','migracion_v1.87'),
('agenda-2026-mejora-nc','Informe de mejora continua y no conformidades','informe',array['iso_9001','iso_45001','iso_14001','sgi'],'Azul','trimestral','2026-01-23',15,'planificada','alta','Informe de tendencias y estado de acciones','R.I.T. 6.2/05 · hoja 2026','migracion_v1.87','migracion_v1.87'),
('agenda-2026-garantias-sap','Informe de transformadores en garantía (SAP B1)','informe',array['iso_9001'],'Azul','semestral','2026-07-31',30,'planificada','alta','Informe emitido desde SAP B1','R.I.T. 6.2/05 · gestión operativa en SAP B1','migracion_v1.87','migracion_v1.87'),
('agenda-2026-comite-mixto','Reunión Comité Mixto','reunion',array['iso_45001','sgi'],'Azul','trimestral',null,15,'sin_programar','alta','Acta y seguimiento de acuerdos','R.I.T. 6.2/05 · hoja 2026','migracion_v1.87','migracion_v1.87'),
('agenda-2026-svcc','Actualización SVCC','legal_hys',array['iso_45001'],'Azul','anual','2026-04-01',60,'planificada','critica','Presentación / constancia actualizada','R.I.T. 6.2/05 · actualizar antes del 1 de abril','migracion_v1.87','migracion_v1.87'),
('agenda-2026-rgl','Actualización RGL','legal_hys',array['iso_45001'],'Azul','anual',null,60,'sin_programar','critica','Relevamiento actualizado','R.I.T. 6.2/05 · hoja 2026','migracion_v1.87','migracion_v1.87'),
('agenda-2026-ntear','Actualización NTEAR','legal_hys',array['iso_45001'],'Azul','anual',null,60,'sin_programar','critica','Nómina actualizada','R.I.T. 6.2/05 · hoja 2026','migracion_v1.87','migracion_v1.87'),
('agenda-2026-ruido','Medición de ruido','medicion',array['iso_45001'],'Azul','anual',null,60,'sin_programar','alta','Protocolo e informe de medición','R.I.T. 6.2/05 · hoja 2026','migracion_v1.87','migracion_v1.87'),
('agenda-2026-iluminacion','Medición de iluminación','medicion',array['iso_45001'],'Azul','anual',null,60,'sin_programar','alta','Protocolo e informe de medición','R.I.T. 6.2/05 · hoja 2026','migracion_v1.87','migracion_v1.87'),
('agenda-2026-vibraciones','Medición de vibraciones cuerpo entero / mano-brazo','medicion',array['iso_45001'],'Azul','anual',null,60,'sin_programar','alta','Protocolo e informe de medición','R.I.T. 6.2/05 · hoja 2026','migracion_v1.87','migracion_v1.87'),
('agenda-2026-pat','Medición de puesta a tierra','medicion',array['iso_45001'],'Azul','anual',null,60,'sin_programar','critica','Protocolo e informe de medición','R.I.T. 6.2/05 · hoja 2026','migracion_v1.87','migracion_v1.87'),
('agenda-2026-aire','Calidad de aire ambiental / emisiones','medicion',array['iso_14001'],'Azul','anual',null,60,'sin_programar','critica','Protocolo e informe de medición','R.I.T. 6.2/05 · hoja 2026','migracion_v1.87','migracion_v1.87'),
('agenda-2026-puesto','Mediciones en puesto laboral','medicion',array['iso_45001'],'Azul','anual',null,60,'sin_programar','alta','Protocolo e informe de medición','R.I.T. 6.2/05 · hoja 2026','migracion_v1.87','migracion_v1.87'),
('agenda-2026-agua-bact','Agua para consumo humano - bacteriológico','medicion',array['iso_45001','iso_14001'],'Azul','semestral','2026-02-27',45,'planificada','alta','Informe de laboratorio','R.I.T. 6.2/05 · hoja 2026','migracion_v1.87','migracion_v1.87'),
('agenda-2026-agua-fq','Agua para consumo humano - físico químico','medicion',array['iso_45001','iso_14001'],'Azul','anual','2026-02-27',45,'planificada','alta','Informe de laboratorio','R.I.T. 6.2/05 · hoja 2026','migracion_v1.87','migracion_v1.87'),
('agenda-2026-efluentes','Medición de efluentes','medicion',array['iso_14001'],'Azul','anual','2026-02-27',45,'planificada','critica','Informe de laboratorio','R.I.T. 6.2/05 · hoja 2026','migracion_v1.87','migracion_v1.87'),
('agenda-2026-presion','Aparatos sometidos a presión','medicion',array['iso_45001'],'Azul','anual',null,60,'sin_programar','critica','Certificados e informe','R.I.T. 6.2/05 · hoja 2026','migracion_v1.87','migracion_v1.87'),
('agenda-2026-carga-termica','Medición de carga térmica','medicion',array['iso_45001'],'Azul','anual','2026-02-20',45,'planificada','alta','Protocolo e informe de medición','R.I.T. 6.2/05 · hoja 2026','migracion_v1.87','migracion_v1.87')
on conflict (id) do nothing;

do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='sgo_agenda_iso') then alter publication supabase_realtime add table public.sgo_agenda_iso; end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='sgo_tareas') then alter publication supabase_realtime add table public.sgo_tareas; end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='sgo_tarea_comentarios') then alter publication supabase_realtime add table public.sgo_tarea_comentarios; end if;
end $$;
update public.sgo_agenda_iso set estado='esperando_evidencia', actualizado_en=now(), actualizado_por='migracion_v1.87' where fecha_objetivo < current_date and estado='planificada';
notify pgrst, 'reload schema';
commit;
