-- ============================================================
-- INELPA PWA - Esquema de base de datos (PostgreSQL / Supabase)
-- Backend en la nube. Capa intermedia previa al go-live de SAP B1.
-- Disenado para mapear 1:1 con objetos de SAP Business One.
-- ============================================================

-- ---------- Catalogos ----------
create type rol_usuario as enum ('operario', 'encargado', 'planificador');
create type linea_prod  as enum ('distribucion', 'rural', 'general');
create type estado_tarea as enum ('pendiente', 'en_proceso', 'pausada', 'finalizada');
-- v1.2: material del bobinado (obligatorio en la orden).
create type material_bobina as enum ('cobre', 'aluminio');
-- v1.2: tipo de estacion de trabajo.
create type tipo_estacion as enum ('maquina', 'box', 'linea', 'estacion');
-- v1.2: estado del semielaborado (bobina) en su ciclo de vida.
create type estado_semielaborado as enum ('en_proceso', 'disponible', 'consumido');

-- v1.2: la planta maneja ~40 causas de demora y la lista crece. En vez de un
-- enum rigido, las causas viven en una TABLA-CATALOGO (causas_parada) y la
-- columna paradas.causa referencia su slug. Asi se agregan causas sin migrar
-- el esquema (alta por INSERT). Categorias: material/logistica/maquina/personal/calidad/otra.
create table causas_parada (
  id         text primary key,              -- slug, ej 'espera_alambre'
  label      text not null,
  categoria  text not null,                 -- material | logistica | maquina | personal | calidad | otra
  codigo     int,                           -- numero en la planilla maestra de planta
  activo     boolean default true
);

-- ---------- Sectores (los 13 sectores de planta) ----------
create table sectores (
  id          text primary key,           -- ej 'bob_dist_at'
  nombre      text not null,
  linea       linea_prod not null,
  supervisor  text,
  operarios   int default 0
);

-- ---------- Usuarios ----------
-- La autenticacion real usa Supabase Auth (auth.users). Esta tabla guarda
-- el perfil/rol y se vincula por user_id.
create table usuarios (
  id          uuid primary key default gen_random_uuid(),
  auth_id     uuid references auth.users(id) on delete set null,
  nombre      text not null,
  usuario     text unique not null,
  rol         rol_usuario not null,
  -- v1.3: grupo de la nomina real de planta (documento "operarios" por sector matriz).
  -- Determina el filtrado de colaboradores al asignar tareas. Los operarios que
  -- alimentan las 4 sub-etapas de Herreria (corte/soldaduras/pintura) llevan
  -- grupo_nomina = 'herreria'. Valores: herreria | bobinado_dist | bobinado_rural |
  -- montaje_dist | montaje_rural | carpinteria | corte_aislacion | pintura.
  grupo_nomina text,
  activo      boolean default true,
  creado_en   timestamptz default now()
);

-- Sectores que cada usuario ve/gestiona (N:N).
create table usuario_sectores (
  usuario_id  uuid references usuarios(id) on delete cascade,
  sector_id   text references sectores(id) on delete cascade,
  primary key (usuario_id, sector_id)
);

-- ---------- Estaciones de trabajo / capacidad instalada (v1.2) ----------
-- Maquinas de bobinado, box de soldadura, lineas de montaje, estaciones de
-- corte/pintura/laboratorio. Las tareas se asignan a una estacion, no a un
-- colaborador. El operario elige su estacion al ingresar.
create table maquinas (
  id         text primary key,              -- ej 'm_bob_dist_at_01'
  nombre     text not null,                 -- ej 'Maquina 01', 'Box 3', 'Linea Montaje PA'
  sector_id  text references sectores(id) on delete cascade,
  tipo       tipo_estacion not null,
  activo     boolean default true
);
create index idx_maquinas_sector on maquinas(sector_id);

-- ---------- Ordenes de produccion (<- SAP ProductionOrders) ----------
create table ordenes (
  id            uuid primary key default gen_random_uuid(),
  sap_abs_entry int,                       -- AbsoluteEntry en SAP B1
  nro_orden     text not null,             -- DocumentNumber SAP
  nro_contrato  text,                      -- Orden de venta SAP
  modelo        text not null,             -- valor del catalogo de modelos (OITM en SAP)
  material      material_bobina not null,  -- v1.2: cobre / aluminio (obligatorio)
  linea         linea_prod not null,
  cantidad      int default 1,
  fecha_entrega date,
  creado_en     timestamptz default now()
);

-- ---------- Tareas (operacion de un sector sobre una orden) ----------
create table tareas (
  id                 uuid primary key default gen_random_uuid(),
  orden_id           uuid references ordenes(id) on delete cascade,
  sector_id          text references sectores(id),
  -- v1.2/v1.3: la tarea se asigna a una ESTACION (maquina/box/linea) Y a un colaborador.
  maquina_id         text references maquinas(id),
  -- v1.3: el planificador asigna operario + estacion simultaneamente, asi que
  -- operario_id se setea desde la creacion de la tarea (no solo al iniciar).
  -- Sigue siendo nullable para sectores sin colaborador cargado (ej. laboratorio).
  operario_id        uuid references usuarios(id),
  modelo             text not null,
  fase               text,                 -- mono / bifasico / trifasico
  nro_transformador  text,
  semana             text not null,        -- 'YYYY-Www'
  prioridad          int default 5,
  estado             estado_tarea default 'pendiente',
  tiempo_estandar_min int not null,
  inicio_planificado timestamptz,           -- v1.4: dia+hora de arranque planificado (Gantt)
  inicio_real        timestamptz,
  fin_real           timestamptz,
  calidad_ok         boolean,
  defecto            text,
  -- v1.2: datos tecnicos de bobinado (capturados antes de finalizar; null = no aplica).
  bob_diametro_interno_mm numeric,
  bob_diametro_externo_mm numeric,
  bob_codigo              text,
  notas              text,
  actualizado_en     timestamptz default now()
);
create index idx_tareas_sector  on tareas(sector_id);
create index idx_tareas_maquina  on tareas(maquina_id);
create index idx_tareas_operario on tareas(operario_id);
create index idx_tareas_semana   on tareas(semana);
create index idx_tareas_estado   on tareas(estado);

-- ---------- Paradas (demoras estructuradas) ----------
create table paradas (
  id           uuid primary key default gen_random_uuid(),
  tarea_id     uuid references tareas(id) on delete cascade,
  causa        text not null references causas_parada(id),  -- v1.2: catalogo (no enum)
  inicio       timestamptz not null,
  fin          timestamptz,               -- null = parada en curso
  observacion  text
);
create index idx_paradas_tarea on paradas(tarea_id);
create index idx_paradas_causa on paradas(causa);

-- ---------- Semielaborados (<- SAP B1 OITM; espejo en la nube) ----------
-- En SAP el maestro de articulos (OITM) es la fuente de verdad. Esta tabla es
-- la capa intermedia: la PWA da de alta/reporta estado y el middleware concilia
-- con SAP via Service Layer (UDF U_INELPA_*). Ver src/sap/sapMapping.ts.
create table semielaborados (
  id                 uuid primary key default gen_random_uuid(),
  codigo             text not null,             -- = ItemCode (OITM)
  descripcion        text not null,             -- = ItemName (OITM)
  sector_origen      text references sectores(id),
  modelo             text not null,
  fase               text,
  tarea_origen_id    uuid references tareas(id) on delete set null,
  orden_destino_id   uuid references ordenes(id) on delete set null,
  estado             estado_semielaborado default 'en_proceso',
  tiempo_estimado_min int,                       -- v1.2: tiempo estimado de fabricacion
  sap_item_code      text,                       -- codigo del articulo en SAP B1 (OITM)
  actualizado_en     timestamptz default now()
);
create index idx_semi_sector on semielaborados(sector_origen);
create index idx_semi_estado on semielaborados(estado);

-- ============================================================
-- Row Level Security (RLS): aplica la matriz de 3 niveles en la BD.
-- ============================================================
alter table tareas enable row level security;
alter table paradas enable row level security;

-- Operario: ve las tareas de las estaciones de SUS sectores (la asignacion es por
-- maquina, no por persona) y las que el mismo ejecuta. v1.2.
create policy operario_sus_tareas on tareas
  for select using (
    operario_id = (select id from usuarios where auth_id = auth.uid())
    or sector_id in (
      select us.sector_id from usuario_sectores us
      join usuarios u on u.id = us.usuario_id
      where u.auth_id = auth.uid()
    )
  );

-- Encargado: tareas de SUS sectores. Planificador: todo.
create policy gestion_por_sector on tareas
  for all using (
    exists (
      select 1 from usuarios u
      where u.auth_id = auth.uid()
        and (u.rol = 'planificador'
             or (u.rol = 'encargado'
                 and tareas.sector_id in (select sector_id from usuario_sectores where usuario_id = u.id)))
    )
  );

-- ============================================================
-- Vista materializada de KPIs (alimenta el dashboard sin recalcular en cliente).
-- ============================================================
create or replace view v_tarea_metricas as
select
  t.id, t.sector_id, t.maquina_id, t.operario_id, t.modelo, t.semana, t.estado,
  t.tiempo_estandar_min,
  extract(epoch from (t.fin_real - t.inicio_real))/60 as bruto_min,
  coalesce((select sum(extract(epoch from (p.fin - p.inicio))/60)
            from paradas p where p.tarea_id = t.id and p.fin is not null), 0) as parada_min,
  t.calidad_ok
from tareas t;
