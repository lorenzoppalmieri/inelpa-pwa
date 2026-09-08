-- ============================================================
-- v1.99 — REGISTRO GENERAL DE LABORATORIO + PROTOCOLO SEPARADO
--
-- Baja del documento "APP INELPA - LABORATORIO" (correcciones de Laboratorio):
--
--   "el protocolo debe ser un documento solo con destino al cliente, y no debe
--    funcionar como un registro de valores reales. En su lugar, todos los
--    valores medidos reales (...) deben almacenarse en una base de datos:
--    REGISTRO GENERAL DE LABORATORIO."
--
-- Esta migración hace dos cosas:
--
--   1. `laboratorio.protocolo` (jsonb) — los retoques que el laboratorista le
--      hace al papel del cliente. Antes el protocolo escribía sobre
--      `laboratorio.mediciones` y PISABA el valor real medido.
--
--   2. `lab_registro` — tabla nueva, con columnas planas e índices, para que
--      Diseño pueda filtrar por modelo + versión de diseño, seguir la evolución
--      de ucc / P0 / Pcc y listar lo que quedó fuera de norma.
--
-- POR QUÉ UNA TABLA APARTE (y no más jsonb): la tabla `laboratorio` se espeja
-- ENTERA en el Dexie de cada tablet de planta. Con +2000 transformadores por
-- año, meter ahí el histórico de mediciones haría que cada tablet de bobinado
-- se baje decenas de MB de ensayos que no va a abrir nunca. `lab_registro`
-- queda FUERA del espejo: se consulta on-demand y sólo la usan Laboratorio y
-- Diseño. Por lo mismo NO se agrega a la publicación de realtime.
--
-- Acumulativa e idempotente: se puede correr más de una vez.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1. Protocolo del cliente, separado del registro real
-- ------------------------------------------------------------
alter table laboratorio add column if not exists protocolo jsonb;

comment on column laboratorio.protocolo is
  'v1.99. Valores que el laboratorista pisó A MANO sobre el documento del cliente. '
  'Sólo se guardan los campos editados; el resto se lee de mediciones. '
  'NUNCA escribir mediciones desde la vista de protocolo.';

comment on column laboratorio.mediciones is
  'v1.99. REGISTRO REAL del ensayo (valores medidos + resultados congelados). '
  'Fuente de verdad. Se refleja en lab_registro para poder filtrarlo.';

-- ------------------------------------------------------------
-- 2. Registro General de Laboratorio
-- ------------------------------------------------------------
create table if not exists lab_registro (
  -- Mismo id que la ficha de laboratorio: guardar el ensayo dos veces reescribe
  -- la fila en vez de duplicar el histórico (upsert determinístico).
  id                 text primary key,
  laboratorio_id     text not null,
  fecha              date not null,

  -- ---- identidad del espécimen ----
  modelo             text not null,
  version_diseno     text not null,          -- clave de comparación para Diseño
  nro_fabricacion    text,
  nro_serie          text,
  cliente            text,
  ot                 text,

  -- ---- nominales: definen qué máquinas son "equivalentes" ----
  sn_kva             numeric,
  un1_kv             numeric,
  un2_kv             numeric,
  material           text,                   -- 'cobre' | 'aluminio'
  nf                 integer,                -- 1 | 3

  -- ---- resultados congelados ----
  po_w               numeric,
  io_pct             numeric,
  pcc_w              numeric,
  ucc_pct            numeric,
  urcc_pct           numeric,
  uxcc_pct           numeric,
  p_total_w          numeric,
  rendimiento_pct    numeric,

  -- ---- resistencias de arrollamiento ----
  -- res_origen distingue MEDIDO de COPIADO. El buscador sólo puede ofrecer
  -- valores medidos: copiar de una copia propagaría un número que nadie midió.
  res_origen         text check (res_origen in ('medido', 'copiado')),
  res_temp           numeric,                -- temperatura al medir (tR), en °C
  r_uv               numeric,
  r_vw               numeric,
  r_wu               numeric,
  r_un_at            numeric,
  r_u_n              numeric,
  r_v_n              numeric,
  r_w_n              numeric,

  -- ---- veredicto ----
  fuera_de_norma     boolean not null default false,
  ensayos_rechazados text,
  obs_bobinado       text,

  guardado_por       text,
  guardado_en        timestamptz not null default now()
);

-- Índices pensados para las tres consultas que pide el documento.
-- Evolución de un modelo/versión y buscador de resistencias:
create index if not exists idx_labreg_modelo_version
  on lab_registro (modelo, version_diseno);
-- El buscador filtra además por equivalencia eléctrica y sólo mira 'medido':
create index if not exists idx_labreg_resistencias
  on lab_registro (modelo, version_diseno, res_origen, fecha desc);
-- Listado de transformadores fuera de norma:
create index if not exists idx_labreg_fuera_norma
  on lab_registro (fuera_de_norma) where fuera_de_norma;
-- Recorridas por período:
create index if not exists idx_labreg_fecha on lab_registro (fecha desc);

comment on table lab_registro is
  'v1.99. REGISTRO GENERAL DE LABORATORIO: valores reales medidos, nunca acomodados. '
  'FUERA del espejo Dexie a propósito (+2000 ensayos/año). Toda lectura debe '
  'pasar por traerTodoDe: PostgREST corta en 1000 filas sin avisar.';

-- ---------- RLS ----------
alter table lab_registro enable row level security;

drop policy if exists labreg_select on lab_registro;
create policy labreg_select on lab_registro
  for select using (auth.role() = 'authenticated');

drop policy if exists labreg_write on lab_registro;
create policy labreg_write on lab_registro
  for all using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- ---------- Realtime: NO ----------
-- A diferencia del resto de las tablas, ésta NO se publica. No la mira ninguna
-- tablet en vivo y publicarla la metería en el espejo, que es justo lo que se
-- está evitando.

commit;

-- ============================================================
-- BACKFILL (opcional, correr una sola vez después del deploy)
--
-- Rellena el registro con los ensayos que YA tienen mediciones guardadas.
-- Sólo toma las fichas que tengan versión de diseño cargada: sin esa clave la
-- fila no se puede filtrar ni comparar, así que es preferible no escribirla.
-- Las fichas viejas sin versión hay que completarlas a mano desde la app.
-- ============================================================
-- insert into lab_registro (
--   id, laboratorio_id, fecha, modelo, version_diseno, nro_fabricacion,
--   nro_serie, cliente, ot, material, nf,
--   po_w, io_pct, pcc_w, ucc_pct, urcc_pct, uxcc_pct, p_total_w,
--   res_origen, res_temp, r_uv, r_vw, r_wu, r_un_at, r_u_n, r_v_n, r_w_n,
--   obs_bobinado, guardado_por, guardado_en
-- )
-- select
--   l.id, l.id,
--   coalesce(l.finalizada_en, (l.mediciones ->> 'guardadoEn')::timestamptz, l.creada_en)::date,
--   l.modelo,
--   l.mediciones ->> 'versionDiseno',
--   l.mediciones -> 'cabecera' ->> 'nroFabricacion',
--   l.nro_serie, l.cliente, l.ot,
--   l.mediciones ->> 'material',
--   (l.mediciones ->> 'nf')::int,
--   (l.mediciones -> 'resultados' ->> 'p0')::numeric,
--   (l.mediciones -> 'resultados' ->> 'ioPct')::numeric,
--   (l.mediciones -> 'resultados' ->> 'pccRef')::numeric,
--   (l.mediciones -> 'resultados' ->> 'uccPct')::numeric,
--   (l.mediciones -> 'resultados' ->> 'urccPct')::numeric,
--   (l.mediciones -> 'resultados' ->> 'uxccPct')::numeric,
--   (l.mediciones -> 'resultados' ->> 'pTotal')::numeric,
--   l.mediciones -> 'cc' ->> 'origenResistencias',
--   (l.mediciones -> 'cc' ->> 'tR')::numeric,
--   (l.mediciones -> 'cc' ->> 'rUV')::numeric,
--   (l.mediciones -> 'cc' ->> 'rVW')::numeric,
--   (l.mediciones -> 'cc' ->> 'rWU')::numeric,
--   (l.mediciones -> 'cc' ->> 'rUN')::numeric,
--   (l.mediciones -> 'cc' ->> 'rUn')::numeric,
--   (l.mediciones -> 'cc' ->> 'rVn')::numeric,
--   (l.mediciones -> 'cc' ->> 'rWn')::numeric,
--   l.mediciones ->> 'obsBobinado',
--   l.mediciones ->> 'guardadoPor',
--   coalesce((l.mediciones ->> 'guardadoEn')::timestamptz, now())
-- from laboratorio l
-- where l.mediciones is not null
--   and coalesce(l.mediciones ->> 'versionDiseno', '') <> ''
-- on conflict (id) do nothing;
