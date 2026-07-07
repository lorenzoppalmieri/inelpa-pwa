-- ============================================================
-- INELPA PWA — v1.18: MENSAJES (planificador -> colaborador) + acuse de lectura
--
-- Comunicacion de IDA. El planificador redacta a: un colaborador, un sector,
-- un rol (operario/encargado) o a todos. Los destinatarios lo reciben en su
-- bandeja y al abrirlo se marca leido (tabla mensajes_lectura). El planificador
-- ve cuantos/quienes leyeron.
--
-- Correr en Supabase: SQL Editor -> pegar TODO -> Run. Re-ejecutable.
-- Requisito: app_rol() y app_uid() ya existen (supabase_realtime_rls.sql).
-- ============================================================

-- 1) Tablas
create table if not exists mensajes (
  id           text primary key,
  autor_id     text not null,
  autor_nombre text not null,
  texto        text not null,
  destino_tipo text not null,          -- 'usuario' | 'sector' | 'rol' | 'todos'
  destino_id   text,                   -- usuarioId | sectorId | rol; null si 'todos'
  creado_en    timestamptz not null default now()
);
create index if not exists idx_mensajes_creado on mensajes (creado_en desc);

create table if not exists mensajes_lectura (
  id         text primary key,         -- `${mensaje_id}_${usuario_id}`
  mensaje_id text not null references mensajes(id) on delete cascade,
  usuario_id text not null,
  leido_en   timestamptz not null default now()
);
create index if not exists idx_lectura_mensaje on mensajes_lectura (mensaje_id);

-- 2) RLS
alter table mensajes         enable row level security;
alter table mensajes_lectura enable row level security;

drop policy if exists sel_mensajes on mensajes;           drop policy if exists wr_mensajes on mensajes;
drop policy if exists sel_lectura on mensajes_lectura;    drop policy if exists wr_lectura on mensajes_lectura;

-- Mensajes: los lee cualquier logueado (la app filtra los que le corresponden);
-- solo el planificador crea/edita/borra.
create policy sel_mensajes on mensajes for select to authenticated using (true);
create policy wr_mensajes  on mensajes for all    to authenticated
  using (app_rol() = 'planificador') with check (app_rol() = 'planificador');

-- Lecturas: todos leen (el planificador ve quien leyo); cada usuario solo puede
-- registrar/editar SU propia lectura (usuario_id = su id).
create policy sel_lectura on mensajes_lectura for select to authenticated using (true);
create policy wr_lectura  on mensajes_lectura for all    to authenticated
  using (usuario_id = app_uid()::text) with check (usuario_id = app_uid()::text);

-- 3) Realtime
alter table mensajes         replica identity full;
alter table mensajes_lectura replica identity full;
do $$
declare t text;
begin
  foreach t in array array['mensajes','mensajes_lectura'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
