-- ============================================================
-- v1.62 - MODULO DE MANTENIMIENTO · NUCLEO
-- Documento de origen: Programa de Mantenimiento INELPA v1.0 (Jul 2026).
-- Correr en Supabase -> SQL Editor ANTES del seed v1.62. Idempotente.
--
-- Cubre los 4 pilares del programa:
--   1. Registro de activos (mant_plantas / mant_sectores / mant_activos)
--   2. Dependencias y criticidad (campos en mant_activos)
--   3. Plan preventivo (mant_gamas) -> genera OT (por app o cron)
--   4. Ordenes de trabajo + avisos de falla (mant_ordenes_trabajo / mant_avisos)
-- KPIs: vistas mant_v_* al final.
--
-- NOTA ENUM: como las policies comparan rol::text contra strings, los
-- valores nuevos del enum NO se usan en esta misma migracion; los inserts
-- de usuarios con rol nuevo van en el seed (misma tecnica que v1.49).
-- ============================================================

alter type rol_usuario add value if not exists 'mantenimiento';       -- jefe/planificador (Eric)
alter type rol_usuario add value if not exists 'mant_tecnico';        -- tecnicos (Nicolas, David)

-- ============================================================
-- 1. PLANTAS (Lorenzatti hoy; Cerdan Nave 1 y Nave 2 por etapas)
-- ============================================================
create table if not exists public.mant_plantas (
  id             text primary key,          -- 'lorenzatti' | 'cerdan_n1' | 'cerdan_n2'
  nombre         text not null,
  superficie_m2  integer,
  plano_url      text,                      -- path en Storage (bucket publico de planos)
  plano_ancho_px integer,                   -- dimensiones de la imagen del plano (para % de pins)
  plano_alto_px  integer,
  orden          integer not null default 0,
  activa         boolean not null default true,
  creado_en      timestamptz not null default now()
);

-- ============================================================
-- 2. SECTORES (globales; la planta se define en cada activo)
-- ============================================================
create table if not exists public.mant_sectores (
  id      text primary key,                 -- 'lam' | 'pin' | 'her' | 'srv' | 'bob' | ...
  nombre  text not null,
  prefijo text not null,                    -- LAM | PIN | HER | SRV | BOB ... (codificacion [SECTOR]-[TIPO]-[N])
  color   text not null default '#1f2430',  -- color del pin en el mapa
  orden   integer not null default 0
);

-- ============================================================
-- 3. ACTIVOS (registro de equipos - Pilar 1 y 2)
--    La posicion (x_pct, y_pct) la carga el jefe desde el editor
--    de mapa dentro de la PWA (arrastrar simbolos sobre el plano).
-- ============================================================
create table if not exists public.mant_activos (
  id              text primary key,         -- codigo: 'LAM-CORT-01'
  nombre          text not null,
  sector_id       text not null references public.mant_sectores(id),
  planta_id       text not null references public.mant_plantas(id),
  subarea         text,                     -- 'BOX3 Soldadura Robot', 'Linea Pintura', ...
  tipo            text,                     -- 'Robot', 'Soldadura', 'Extraccion', ...
  simbolo         text not null default 'maquina',  -- simbolo del editor de mapa
  criticidad      text not null default 'C'
    check (criticidad in ('A','B','C')),
  x_pct           numeric check (x_pct is null or (x_pct >= 0 and x_pct <= 100)),
  y_pct           numeric check (y_pct is null or (y_pct >= 0 and y_pct <= 100)),
  fabricante      text,
  modelo          text,
  nro_serie       text,
  anio            integer,
  datos_tecnicos  jsonb not null default '{}'::jsonb,   -- potencia, tension, capacidad...
  componentes     jsonb not null default '[]'::jsonb,   -- motores/variadores fichados
  puntos_loto     jsonb not null default '[]'::jsonb,   -- puntos de bloqueo LOTO
  iit_ref         text,                     -- instruccion de trabajo existente (IIT 7.1.3 NN)
  pwa_machine_key text,                     -- vinculo con maquinas de produccion (ej. m_bob_07)
  depende_de      text[] not null default '{}',         -- codigos de activos de los que depende
  notas           text,
  activo          boolean not null default true,
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now(),
  actualizado_por text
);
create index if not exists idx_mant_activos_planta  on public.mant_activos (planta_id, sector_id);
create index if not exists idx_mant_activos_crit    on public.mant_activos (criticidad);

-- ============================================================
-- 4. GAMAS PREVENTIVAS (Pilar 3)
--    frecuencia -> la app/cron genera las OT preventivas.
-- ============================================================
create table if not exists public.mant_gamas (
  id              uuid primary key default gen_random_uuid(),
  activo_id       text references public.mant_activos(id) on delete cascade,
  familia         text,                     -- si es gama de familia (ej. 'soldadoras') en vez de activo puntual
  tarea           text not null,
  frecuencia      text not null
    check (frecuencia in ('diaria','semanal','quincenal','mensual','trimestral','semestral','anual')),
  responsable     text not null default 'mantenimiento'
    check (responsable in ('operario','mantenimiento','externo')),
  duracion_est_min integer,
  orden           integer not null default 0,
  activa          boolean not null default true,
  creado_en       timestamptz not null default now()
);
create index if not exists idx_mant_gamas_activo on public.mant_gamas (activo_id) where activa;

-- ============================================================
-- 5. AVISOS DE FALLA (boton del operario desde Produccion)
--    Realtime: el mapa cambia a rojo al instante.
-- ============================================================
create table if not exists public.mant_avisos (
  id          uuid primary key default gen_random_uuid(),
  activo_id   text not null references public.mant_activos(id),
  emisor      text not null,                -- usuario del operario
  sintoma     text not null,
  estado      text not null default 'nuevo'
    check (estado in ('nuevo','en_ot','resuelto','cancelado')),
  ot_id       uuid,                         -- OT generada a partir del aviso
  creado_en   timestamptz not null default now(),
  atendido_en timestamptz
);
create index if not exists idx_mant_avisos_estado on public.mant_avisos (estado, creado_en desc);
alter table public.mant_avisos replica identity full;

-- ============================================================
-- 6. ORDENES DE TRABAJO (Pilar 4)
-- ============================================================
create table if not exists public.mant_ordenes_trabajo (
  id               uuid primary key default gen_random_uuid(),
  numero           bigint generated always as identity,
  tipo             text not null
    check (tipo in ('preventiva','correctiva','emergencia')),
  estado           text not null default 'creada'
    check (estado in ('creada','planificada','en_ejecucion','en_espera','cerrada','cancelada')),
  prioridad        text not null default 'media'
    check (prioridad in ('alta','media','baja')),
  activo_id        text not null references public.mant_activos(id),
  origen           text not null default 'manual'
    check (origen in ('automatica','aviso','manual')),
  aviso_id         uuid references public.mant_avisos(id) on delete set null,
  gama_id          uuid references public.mant_gamas(id) on delete set null,
  descripcion      text not null,
  responsable      text,                    -- usuario del tecnico asignado
  fecha_objetivo   date,
  fecha_inicio     timestamptz,
  fecha_cierre     timestamptz,
  cierre_trabajo   text,                    -- que se hizo
  cierre_causa     text,                    -- modo de falla / causa raiz
  cierre_repuestos jsonb not null default '[]'::jsonb,
  horas_hombre     numeric check (horas_hombre is null or horas_hombre >= 0),
  tiempo_parada_min integer check (tiempo_parada_min is null or tiempo_parada_min >= 0),
  loto_requerido   boolean not null default false,
  loto_checklist   jsonb not null default '[]'::jsonb,
  creado_por       text,
  creado_en        timestamptz not null default now(),
  actualizado_en   timestamptz not null default now()
);
create index if not exists idx_mant_ot_estado  on public.mant_ordenes_trabajo (estado, prioridad);
create index if not exists idx_mant_ot_activo  on public.mant_ordenes_trabajo (activo_id, creado_en desc);
create index if not exists idx_mant_ot_fecha   on public.mant_ordenes_trabajo (fecha_objetivo);
alter table public.mant_ordenes_trabajo replica identity full;

-- ============================================================
-- 7. REGISTROS HISTORICOS (migracion de las planillas Excel)
--    correctivo (~1300 desde 2022) + preventivo (~227)
-- ============================================================
create table if not exists public.mant_registros (
  id            bigint generated always as identity primary key,
  fecha         timestamptz not null,
  tipo          text not null check (tipo in ('preventivo','correctivo')),
  sector        text,
  emisor        text,
  maquina_texto text,                       -- texto original de la planilla
  activo_id     text references public.mant_activos(id) on delete set null,
  trabajo       text,
  insumo        text,
  colaborador   text,
  fecha_fin     timestamptz,
  horas         numeric,
  origen        text not null default 'planilla'
);
create index if not exists idx_mant_reg_fecha  on public.mant_registros (fecha desc);
create index if not exists idx_mant_reg_activo on public.mant_registros (activo_id, fecha desc);

-- ============================================================
-- 8. REPUESTOS
-- ============================================================
create table if not exists public.mant_repuestos (
  id           text primary key,            -- codigo de repuesto
  descripcion  text not null,
  unidad       text not null default 'un',
  stock        numeric not null default 0,
  stock_minimo numeric not null default 0
);

create table if not exists public.mant_repuesto_activo (
  repuesto_id text not null references public.mant_repuestos(id) on delete cascade,
  activo_id   text not null references public.mant_activos(id) on delete cascade,
  primary key (repuesto_id, activo_id)
);

-- ============================================================
-- RLS
-- ============================================================
-- Lectura amplia (el mapa lo ven todos los autenticados);
-- escritura por rol: 'mantenimiento' (jefe) todo; 'mant_tecnico'
-- ejecuta y cierra OT; cualquier autenticado crea avisos.
-- SUPER ADMIN: 'lorenzo' puede TODO en el modulo (mismo patron que SGO).

-- helper: super admin (lorenzo)
create or replace function app_es_lorenzo() returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from usuarios u where u.auth_id = auth.uid() and u.activo
      and lower(trim(u.usuario)) = 'lorenzo'
  )
$$;

-- helper: jefe de mantenimiento O super admin (administracion del modulo)
create or replace function app_es_admin_mant() returns boolean
  language sql stable security definer set search_path = public as $$
  select app_rol() = 'mantenimiento' or app_es_lorenzo()
$$;

-- helper: equipo de mantenimiento (jefe + tecnicos) O super admin
create or replace function app_es_equipo_mant() returns boolean
  language sql stable security definer set search_path = public as $$
  select app_rol() in ('mantenimiento','mant_tecnico') or app_es_lorenzo()
$$;

-- ---- plantas / sectores / activos / gamas / repuestos: lectura todos, escritura jefe/lorenzo
do $$
declare t text;
begin
  foreach t in array array['mant_plantas','mant_sectores','mant_activos','mant_gamas','mant_repuestos','mant_repuesto_activo']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_write', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (true)',
      t || '_select', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (app_es_admin_mant()) with check (app_es_admin_mant())',
      t || '_write', t);
  end loop;
end $$;

-- ---- avisos: cualquier autenticado crea; solo mantenimiento actualiza
alter table public.mant_avisos enable row level security;
drop policy if exists mant_avisos_select on public.mant_avisos;
drop policy if exists mant_avisos_insert on public.mant_avisos;
drop policy if exists mant_avisos_update on public.mant_avisos;
create policy mant_avisos_select on public.mant_avisos for select to authenticated using (true);
create policy mant_avisos_insert on public.mant_avisos for insert to authenticated with check (true);
create policy mant_avisos_update on public.mant_avisos for update to authenticated
  using (app_es_equipo_mant())
  with check (app_es_equipo_mant());

-- ---- OT: jefe y tecnicos escriben; borra solo lorenzo
alter table public.mant_ordenes_trabajo enable row level security;
drop policy if exists mant_ot_select on public.mant_ordenes_trabajo;
drop policy if exists mant_ot_write on public.mant_ordenes_trabajo;
drop policy if exists mant_ot_delete_lorenzo on public.mant_ordenes_trabajo;
create policy mant_ot_select on public.mant_ordenes_trabajo for select to authenticated using (true);
create policy mant_ot_write on public.mant_ordenes_trabajo for all to authenticated
  using (app_es_equipo_mant())
  with check (app_es_equipo_mant());
create policy mant_ot_delete_lorenzo on public.mant_ordenes_trabajo for delete to authenticated
  using (exists (
    select 1 from public.usuarios u where u.auth_id = auth.uid() and u.activo
      and lower(trim(u.usuario)) = 'lorenzo'
  ));

-- ---- registros historicos: lectura todos; carga jefe/tecnicos
alter table public.mant_registros enable row level security;
drop policy if exists mant_reg_select on public.mant_registros;
drop policy if exists mant_reg_write on public.mant_registros;
create policy mant_reg_select on public.mant_registros for select to authenticated using (true);
create policy mant_reg_write on public.mant_registros for all to authenticated
  using (app_es_equipo_mant())
  with check (app_es_equipo_mant());

-- ============================================================
-- REALTIME (mapa en vivo: avisos, OT y posiciones de activos)
-- ============================================================
do $$
declare t text;
begin
  foreach t in array array['mant_avisos','mant_ordenes_trabajo','mant_activos']
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ============================================================
-- VISTAS KPI (Seccion 12 del programa)
-- ============================================================

-- Cumplimiento del preventivo por mes: % OT preventivas cerradas en fecha
create or replace view public.mant_v_cumplimiento_preventivo as
select
  date_trunc('month', fecha_objetivo)::date as mes,
  count(*) filter (where tipo = 'preventiva') as planificadas,
  count(*) filter (where tipo = 'preventiva' and estado = 'cerrada') as cerradas,
  count(*) filter (where tipo = 'preventiva' and estado = 'cerrada'
                   and fecha_cierre::date <= fecha_objetivo) as cerradas_en_fecha,
  round(
    100.0 * count(*) filter (where tipo = 'preventiva' and estado = 'cerrada'
                             and fecha_cierre::date <= fecha_objetivo)
    / nullif(count(*) filter (where tipo = 'preventiva'), 0), 1) as cumplimiento_pct
from public.mant_ordenes_trabajo
where fecha_objetivo is not null
group by 1
order by 1 desc;

-- MTTR y fallas por activo (correctivas + emergencia cerradas)
create or replace view public.mant_v_mttr_activo as
select
  activo_id,
  count(*) as fallas,
  round(avg(tiempo_parada_min)::numeric, 0) as mttr_min_prom,
  round(avg(extract(epoch from (fecha_cierre - fecha_inicio)) / 3600)::numeric, 1) as horas_reparacion_prom,
  max(fecha_cierre) as ultima_falla
from public.mant_ordenes_trabajo
where tipo in ('correctiva','emergencia') and estado = 'cerrada'
group by activo_id;

-- Backlog: horas estimadas pendientes por estado
create or replace view public.mant_v_backlog as
select
  estado,
  count(*) as ordenes,
  coalesce(sum(g.duracion_est_min), 0) as minutos_estimados
from public.mant_ordenes_trabajo ot
left join public.mant_gamas g on g.id = ot.gama_id
where ot.estado in ('creada','planificada','en_ejecucion','en_espera')
group by estado;

-- Verificacion rapida:
-- select id, nombre from mant_plantas;
-- select id, nombre, criticidad from mant_activos order by id;
