-- ============================================================
-- v2.04 — AUSENCIAS POR COLABORADOR
--
-- Un dia de ausencia es el equivalente PERSONAL de un feriado: el calendario lo
-- trata como dia cerrado, pero solo para las tareas de esa persona. El tiempo de
-- ese dia no suma al Tiempo Real ni a las demoras, ni cuenta como tiempo muerto
-- en Bobinado.
--
-- Correr entero. Es idempotente: se puede volver a correr sin romper nada.
-- ============================================================

create table if not exists public.ausencias (
  -- id = `usuarioId_YYYY-MM-DD`. Determinista a proposito: marcar dos veces el
  -- mismo dia para la misma persona pisa la fila en vez de duplicarla.
  id             text primary key,
  usuario_id     text not null references public.usuarios(id) on delete cascade,
  fecha          date not null,
  motivo         text not null default 'otro',
  nota           text,
  cargada_por    text not null,
  actualizado_en timestamptz not null default now()
);

-- Una sola ausencia por persona y dia, aunque alguien arme el id a mano.
create unique index if not exists ausencias_usuario_fecha_uq
  on public.ausencias (usuario_id, fecha);

-- La consulta mas frecuente es "ausencias de este mes".
create index if not exists ausencias_fecha_idx on public.ausencias (fecha);

-- ------------------------------------------------------------
-- RLS: misma politica que el resto de las tablas operativas.
-- El control de QUIEN puede cargar una ausencia vive en el front
-- (auth/roles.ts -> PUEDEN_CARGAR_AUSENCIAS). Si mas adelante hace falta que
-- sea inviolable, hay que agregar una policy que mire el usuario autenticado.
-- ------------------------------------------------------------
alter table public.ausencias enable row level security;

drop policy if exists ausencias_select on public.ausencias;
create policy ausencias_select on public.ausencias
  for select to authenticated using (true);

drop policy if exists ausencias_write on public.ausencias;
create policy ausencias_write on public.ausencias
  for all to authenticated using (true) with check (true);

-- ------------------------------------------------------------
-- REALTIME: sin esto, una ausencia cargada desde otra maquina no refresca los
-- KPIs de las demas hasta que recarguen la pagina.
-- ------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'ausencias'
  ) then
    alter publication supabase_realtime add table public.ausencias;
  end if;
end $$;

-- ------------------------------------------------------------
-- VERIFICACION — deberia devolver una fila con la tabla creada y realtime ON.
-- ------------------------------------------------------------
select
  (select count(*) from information_schema.tables
     where table_schema = 'public' and table_name = 'ausencias')            as tabla_creada,
  (select count(*) from pg_publication_tables
     where pubname = 'supabase_realtime' and tablename = 'ausencias')       as en_realtime,
  (select count(*) from public.ausencias)                                   as ausencias_cargadas;
