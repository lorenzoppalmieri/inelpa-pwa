-- ============================================================
-- v1.60 - REGISTRO ISO 9001 · TRANSFORMADORES EN GARANTIA
-- Documento de origen: R.I.T. 9.1.2/02, version 01.
-- Ejecutar en Supabase > SQL Editor antes del archivo seed v1.61.
-- ============================================================

create table if not exists public.sgo_garantias_iso (
  id                    text primary key,
  codigo                text not null unique,
  tipo                  text not null,
  nro_serie             text,
  fecha_salida          date,
  fecha_deteccion       date not null,
  ingresado_por         text,
  cliente               text,
  cliente_original      text,
  diagnostico           text not null,
  causas                text,
  cobertura             text not null default 'sin_dato'
    check (cobertura in ('si','no','en_evaluacion','sin_dato')),
  categoria             text not null default 'otro'
    check (categoria in ('perdida_aceite','electrico_bobinado','soldadura_herreria','aislacion','transporte_manipulacion','mecanica_parte_activa','accesorios_componentes','otro')),
  estado                text not null default 'abierto'
    check (estado in ('abierto','en_analisis','pendiente_cliente','resuelto','verificado')),
  responsable           text,
  fecha_compromiso      date,
  solucion              text,
  fecha_resolucion      date,
  verificado            boolean not null default false,
  verificacion_detalle  text,
  costo_estimado        numeric check (costo_estimado is null or costo_estimado >= 0),
  observaciones         text,
  fuente_fila           integer,
  creado_en             timestamptz not null default now(),
  actualizado_en        timestamptz not null default now(),
  actualizado_por       text not null
);

create index if not exists idx_sgo_garantias_deteccion on public.sgo_garantias_iso (fecha_deteccion desc);
create index if not exists idx_sgo_garantias_estado on public.sgo_garantias_iso (estado, cobertura);
create index if not exists idx_sgo_garantias_cliente on public.sgo_garantias_iso (cliente);
create index if not exists idx_sgo_garantias_categoria on public.sgo_garantias_iso (categoria);
create index if not exists idx_sgo_garantias_serie on public.sgo_garantias_iso (nro_serie);

alter table public.sgo_garantias_iso enable row level security;
drop policy if exists sgo_garantias_select on public.sgo_garantias_iso;
drop policy if exists sgo_garantias_insert on public.sgo_garantias_iso;
drop policy if exists sgo_garantias_update on public.sgo_garantias_iso;
drop policy if exists sgo_garantias_delete_lorenzo on public.sgo_garantias_iso;

create policy sgo_garantias_select on public.sgo_garantias_iso for select to authenticated
  using (exists (
    select 1 from public.usuarios u where u.auth_id = auth.uid() and u.activo
      and u.rol::text in ('sgo','planificador')
  ));
create policy sgo_garantias_insert on public.sgo_garantias_iso for insert to authenticated
  with check (exists (
    select 1 from public.usuarios u where u.auth_id = auth.uid() and u.activo
      and u.rol::text in ('sgo','planificador')
  ));
create policy sgo_garantias_update on public.sgo_garantias_iso for update to authenticated
  using (exists (
    select 1 from public.usuarios u where u.auth_id = auth.uid() and u.activo
      and u.rol::text in ('sgo','planificador')
  ))
  with check (exists (
    select 1 from public.usuarios u where u.auth_id = auth.uid() and u.activo
      and u.rol::text in ('sgo','planificador')
  ));
create policy sgo_garantias_delete_lorenzo on public.sgo_garantias_iso for delete to authenticated
  using (exists (
    select 1 from public.usuarios u where u.auth_id = auth.uid() and u.activo
      and lower(trim(u.usuario)) = 'lorenzo'
  ));

do $$ begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'sgo_garantias_iso'
  ) then
    alter publication supabase_realtime add table public.sgo_garantias_iso;
  end if;
end $$;
