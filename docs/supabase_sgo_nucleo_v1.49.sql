-- ============================================================
-- v1.49 - NUCLEO SGO: eventos transversales + acciones
-- Ejecutar en Supabase SQL Editor antes de usar el modulo con backend.
-- El frontend puede operar offline; sin estas tablas la cola mostrara error.
-- ============================================================

-- El enum se amplía sin insertar usuarios en esta misma migracion.
alter type rol_usuario add value if not exists 'sgo';

create table if not exists sgo_eventos (
  id                 text primary key,
  codigo             text not null unique,
  tipo               text not null check (tipo in ('no_conformidad','incidente_seguridad','cuasi_accidente','observacion_preventiva','incidente_ambiental','desvio_entrega','perdida_costo','oportunidad_mejora','hallazgo_auditoria')),
  pilar              text not null check (pilar in ('seguridad','calidad','ambiente','entrega','costos','mejora')),
  titulo             text not null,
  descripcion        text not null,
  severidad          text not null check (severidad in ('baja','media','alta','critica')),
  estado             text not null check (estado in ('abierto','contenido','en_analisis','con_acciones','cerrado')),
  sector_id          text,
  maquina_id         text,
  orden_id           text,
  tarea_id           text,
  laboratorio_id     text,
  despacho_id        text,
  nro_serie          text,
  detectado_en       timestamptz not null,
  detectado_por      text not null,
  responsable        text,
  contencion         text,
  disposicion        text check (disposicion is null or disposicion in ('pendiente','retrabajo','rechazo','concesion','devolucion','no_aplica')),
  cantidad_afectada  numeric,
  costo_estimado     numeric,
  causa_raiz         text,
  metodo_analisis    text check (metodo_analisis is null or metodo_analisis in ('5_porques','ishikawa','a3','8d','otro')),
  evidencia_urls     jsonb,
  creado_en          timestamptz not null default now(),
  actualizado_en     timestamptz not null default now(),
  cerrado_en         timestamptz,
  cerrado_por        text
);

create table if not exists sgo_acciones (
  id                       text primary key,
  evento_id                text not null references sgo_eventos(id) on delete cascade,
  tipo                     text not null check (tipo in ('correccion','correctiva','preventiva','mejora')),
  descripcion              text not null,
  responsable              text not null,
  fecha_compromiso         date not null,
  estado                   text not null check (estado in ('pendiente','en_curso','completada','verificada','cancelada')),
  evidencia                text,
  completada_en            timestamptz,
  completada_por           text,
  verificada_en            timestamptz,
  verificada_por           text,
  eficaz                   boolean,
  comentario_verificacion  text,
  creado_en                timestamptz not null default now(),
  creado_por               text not null,
  actualizado_en           timestamptz not null default now()
);

create index if not exists idx_sgo_eventos_estado on sgo_eventos (estado, pilar);
create index if not exists idx_sgo_eventos_sector on sgo_eventos (sector_id, detectado_en desc);
create index if not exists idx_sgo_eventos_tarea on sgo_eventos (tarea_id) where tarea_id is not null;
create index if not exists idx_sgo_acciones_evento on sgo_acciones (evento_id);
create index if not exists idx_sgo_acciones_vencimiento on sgo_acciones (estado, fecha_compromiso);

alter table sgo_eventos enable row level security;
alter table sgo_acciones enable row level security;

drop policy if exists sgo_eventos_acceso on sgo_eventos;
create policy sgo_eventos_acceso on sgo_eventos for all to authenticated
  using (exists (
    select 1 from usuarios u where u.auth_id = auth.uid() and u.activo
      and u.rol::text in ('sgo', 'planificador')
  ))
  with check (exists (
    select 1 from usuarios u where u.auth_id = auth.uid() and u.activo
      and u.rol::text in ('sgo', 'planificador')
  ));

drop policy if exists sgo_acciones_acceso on sgo_acciones;
create policy sgo_acciones_acceso on sgo_acciones for all to authenticated
  using (exists (
    select 1 from usuarios u where u.auth_id = auth.uid() and u.activo
      and u.rol::text in ('sgo', 'planificador')
  ))
  with check (exists (
    select 1 from usuarios u where u.auth_id = auth.uid() and u.activo
      and u.rol::text in ('sgo', 'planificador')
  ));

-- Realtime idempotente.
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'sgo_eventos') then
    alter publication supabase_realtime add table sgo_eventos;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'sgo_acciones') then
    alter publication supabase_realtime add table sgo_acciones;
  end if;
end $$;

-- Para crear perfiles Nico/Azul, ejecutar el INSERT en una segunda corrida
-- posterior a esta migracion (Postgres no permite usar de inmediato un valor
-- nuevo de enum dentro de la misma transaccion):
-- insert into usuarios (nombre, usuario, rol, activo) values
--   ('Nico', 'USUARIO_REAL_NICO', 'sgo', true),
--   ('Azul', 'USUARIO_REAL_AZUL', 'sgo', true)
-- on conflict (usuario) do update set rol = excluded.rol, activo = true;
