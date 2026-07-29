-- ============================================================
-- v1.53 - INDICADORES, METAS Y SEMAFORO AREA x PILAR
-- Ejecutar despues de v1.49, v1.51 y v1.52.
-- ============================================================

create table if not exists sgo_indicadores (
  id                 text primary key,
  area_id            text not null,
  pilar              text not null check (pilar in ('seguridad','calidad','ambiente','entrega','costos','mejora')),
  nombre             text not null,
  unidad             text not null,
  direccion          text not null check (direccion in ('mayor_mejor','menor_mejor')),
  meta               numeric not null,
  umbral_amarillo    numeric not null,
  valor_actual       numeric,
  periodo            text not null,
  activo             boolean not null default true,
  actualizado_en     timestamptz not null default now(),
  actualizado_por    text not null,
  constraint sgo_indicador_umbral_coherente check (
    (direccion = 'mayor_mejor' and umbral_amarillo <= meta) or
    (direccion = 'menor_mejor' and umbral_amarillo >= meta)
  ),
  constraint sgo_indicador_area check (area_id in (
    'bobinado_rural','bobinado_distribucion','montaje_distribucion','montaje_rural',
    'herreria_pintura','laminado','administracion','logistica_operativa',
    'logistica_administrativa','mantenimiento','automatismo','it',
    'planificacion_produccion','laboratorio','gerencia_directorio','diseno'
  ))
);

create unique index if not exists idx_sgo_indicador_unico
  on sgo_indicadores (area_id, pilar, lower(nombre));
create index if not exists idx_sgo_indicadores_matriz
  on sgo_indicadores (area_id, pilar, activo, periodo);

alter table sgo_indicadores enable row level security;
drop policy if exists sgo_indicadores_acceso on sgo_indicadores;
create policy sgo_indicadores_acceso on sgo_indicadores for all to authenticated
  using (exists (
    select 1 from usuarios u where u.auth_id = auth.uid() and u.activo
      and u.rol::text in ('sgo', 'planificador')
  ))
  with check (exists (
    select 1 from usuarios u where u.auth_id = auth.uid() and u.activo
      and u.rol::text in ('sgo', 'planificador')
  ));

do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'sgo_indicadores') then
    alter publication supabase_realtime add table sgo_indicadores;
  end if;
end $$;
