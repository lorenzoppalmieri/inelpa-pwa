-- ============================================================
-- v1.83 — EPP: registro de entrega de elementos de protección personal
--
-- Reemplaza la planilla "R.I.T 7.1.2 06 Tickets de EPP.xlsx": una hoja por
-- persona y por año, con un casillero por cada unidad que le corresponde.
--
-- Tres tablas:
--   epp_colaboradores → quién recibe EPP y en qué puesto
--   epp_entregas      → una fila por unidad entregada (= un casillero tildado)
--   epp_solicitudes   → reposición fuera de cupo, que autoriza HyS
--
-- El CATÁLOGO de EPP (qué le toca a cada puesto y cuánto) NO está acá: vive en
-- src/epp/catalogo.ts. Lo define Higiene y Seguridad y cambia una o dos veces
-- por año; tenerlo en código evita que un cambio de criterio dependa de correr
-- una migración, y evita el riesgo de una columna sin migrar.
--
-- CORRER ESTE SQL ANTES DEL PUSH: el código nuevo escribe en estas tablas y,
-- si no existen, el upsert falla, la cola lo descarta en silencio y se pierde
-- el registro de entrega.
--
-- Idempotente: se puede correr más de una vez.
-- ============================================================

-- 1) Colaboradores -----------------------------------------------------------
create table if not exists public.epp_colaboradores (
  id          text primary key,
  nombre      text not null,
  puesto_id   text not null,          -- id de PUESTOS_EPP (soldadura, laser, pintura…)
  dni         text,                   -- DNI o legajo
  usuario_id  text,                   -- si salió de la nómina
  activo      boolean not null default true,
  creada_en   timestamptz not null default now(),
  creada_por  text
);

create index if not exists idx_epp_colab_activo on public.epp_colaboradores (activo, nombre);

-- Un mismo nombre no puede tener dos fichas: es el error clásico de la planilla
-- de papel (la misma persona anotada dos veces con el nombre escrito distinto).
create unique index if not exists ux_epp_colab_nombre
  on public.epp_colaboradores (lower(trim(nombre)));

-- 2) Entregas ---------------------------------------------------------------
create table if not exists public.epp_entregas (
  id             text primary key,
  colaborador_id text not null references public.epp_colaboradores(id) on delete cascade,
  epp_key        text not null,       -- key dentro del catálogo del puesto
  anio           integer not null,
  fecha          timestamptz not null default now(),
  entregada_por  text,
  solicitud_id   text,                -- si salió por reposición extraordinaria
  observacion    text
);

-- Por donde se consulta la ficha: persona + año.
create index if not exists idx_epp_entregas_ficha
  on public.epp_entregas (colaborador_id, anio, epp_key);

-- 3) Solicitudes de reposición extraordinaria -------------------------------
create table if not exists public.epp_solicitudes (
  id             text primary key,
  colaborador_id text not null references public.epp_colaboradores(id) on delete cascade,
  epp_key        text not null,
  anio           integer not null,
  motivo         text not null,
  estado         text not null default 'pendiente',
  pedida_en      timestamptz not null default now(),
  pedida_por     text,
  resuelta_en    timestamptz,
  resuelta_por   text,                -- quién de HyS firmó
  comentario_hys text,
  constraint epp_solicitudes_estado_check
    check (estado in ('pendiente','aprobada','rechazada','usada'))
);

create index if not exists idx_epp_solicitudes_pendientes
  on public.epp_solicitudes (estado, pedida_en);
create index if not exists idx_epp_solicitudes_ficha
  on public.epp_solicitudes (colaborador_id, anio, epp_key);

-- 4) RLS ---------------------------------------------------------------------
-- Criterio: LEE cualquier usuario activo (el operario tiene derecho a ver lo
-- que le entregaron). ESCRIBE logística (pañol), SGO (HyS) y planificación.
alter table public.epp_colaboradores enable row level security;
alter table public.epp_entregas      enable row level security;
alter table public.epp_solicitudes   enable row level security;

do $$
declare t text;
begin
  foreach t in array array['epp_colaboradores','epp_entregas','epp_solicitudes']
  loop
    execute format('drop policy if exists %I_lectura on public.%I', t, t);
    execute format($f$
      create policy %I_lectura on public.%I for select to authenticated
      using (exists (select 1 from public.usuarios u
                     where u.auth_id = (select auth.uid()) and u.activo))
    $f$, t, t);

    execute format('drop policy if exists %I_escritura on public.%I', t, t);
    execute format($f$
      create policy %I_escritura on public.%I for all to authenticated
      using (exists (select 1 from public.usuarios u
                     where u.auth_id = (select auth.uid()) and u.activo
                       and u.rol::text in ('logistica','sgo','planificador')))
      with check (exists (select 1 from public.usuarios u
                     where u.auth_id = (select auth.uid()) and u.activo
                       and u.rol::text in ('logistica','sgo','planificador')))
    $f$, t, t);
  end loop;
end $$;

-- 5) Realtime ----------------------------------------------------------------
-- Para que la autorización de HyS le llegue sola a la tablet del pañol.
do $$
declare t text;
begin
  foreach t in array array['epp_colaboradores','epp_entregas','epp_solicitudes']
  loop
    if not exists (select 1 from pg_publication_tables
                   where pubname = 'supabase_realtime' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ============================================================
-- CONTROLES
-- ============================================================
-- ¿Quedó todo creado?
-- select table_name from information_schema.tables
-- where table_schema='public' and table_name like 'epp_%' order by 1;

-- Consumo del año por persona y EPP:
-- select c.nombre, c.puesto_id, e.epp_key, count(*) as entregadas
-- from public.epp_entregas e
-- join public.epp_colaboradores c on c.id = e.colaborador_id
-- where e.anio = extract(year from now())
-- group by 1,2,3
-- order by 1,3;

-- Pedidos esperando a HyS:
-- select c.nombre, s.epp_key, s.motivo, s.pedida_en, s.pedida_por
-- from public.epp_solicitudes s
-- join public.epp_colaboradores c on c.id = s.colaborador_id
-- where s.estado = 'pendiente'
-- order by s.pedida_en;
