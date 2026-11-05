-- ============================================================
-- v2.45 — EPP: ajustes de HyS al catálogo + anulación de entregas
--
-- REQUIERE docs/supabase_epp_v1.83.sql corrido antes (tablas epp_*).
-- ORDEN: 1) INELPA-TEST (chdzcymppxpkrivgzyrc) + probar en staging
--        2) producción (rpvwlgbwcwjllqejwzwm) ANTES del merge a main.
-- Idempotente: se puede correr más de una vez.
--
-- 1) epp_reglas: HyS ajusta lo que le toca a cada uno sin tocar el código.
--    Una regla es un cambio sobre la planilla, por PUESTO o por PERSONA:
--    cupo anual, frecuencia, sin tope, quitar un EPP o agregar uno nuevo.
--    El id es determinístico ("puesto:soldadura:guante_vaqueta"): editar dos
--    veces la misma regla la pisa, no la duplica.
--
-- 2) epp_entregas.anulada…: las entregas ya NO se borran. Gerencia o HyS las
--    anulan con motivo (p. ej. doble toque en "Entregar"). La anulada deja de
--    contar para el cupo pero queda el rastro: quién, cuándo y por qué.
--
-- Si se hace el push sin correr esto:
--   · entregas normales: siguen subiendo (la app solo manda las columnas de
--     anulación cuando la entrega está anulada).
--   · anular / ajustar catálogo: el servidor lo rechaza, queda solo en ese
--     equipo y la pantalla de EPP en SGO muestra el aviso rojo.
-- ============================================================

-- 1) Reglas de catálogo -------------------------------------------------------
create table if not exists public.epp_reglas (
  id               text primary key,
  ambito           text not null,          -- 'puesto' | 'colaborador'
  ambito_id        text not null,          -- id del puesto o del colaborador
  epp_key          text not null,
  nombre           text,
  frecuencia       text,
  limite           integer,                -- null = hereda (salvo sin_tope)
  sin_tope         boolean not null default false,
  quitado          boolean not null default false,
  actualizado_en   timestamptz not null default now(),
  actualizado_por  text,
  constraint epp_reglas_ambito_check check (ambito in ('puesto','colaborador')),
  constraint epp_reglas_limite_check check (limite is null or (limite >= 0 and limite <= 999))
);

create index if not exists idx_epp_reglas_ambito on public.epp_reglas (ambito, ambito_id);

-- Una sola regla por (ámbito, a quién, EPP), aunque alguien la cargue con otro id.
create unique index if not exists ux_epp_reglas_clave
  on public.epp_reglas (ambito, ambito_id, epp_key);

-- 2) Anulación de entregas ----------------------------------------------------
alter table public.epp_entregas add column if not exists anulada          boolean not null default false;
alter table public.epp_entregas add column if not exists anulada_en       timestamptz;
alter table public.epp_entregas add column if not exists anulada_por      text;
alter table public.epp_entregas add column if not exists motivo_anulacion text;

-- 3) RLS ----------------------------------------------------------------------
-- LEE cualquier usuario activo. ESCRIBE HyS (sgo) y Lorenzo. El catálogo NO lo
-- toca pañol: si pudiera, se subiría su propio cupo.
alter table public.epp_reglas enable row level security;

drop policy if exists epp_reglas_lectura on public.epp_reglas;
create policy epp_reglas_lectura on public.epp_reglas for select to authenticated
  using (exists (select 1 from public.usuarios u
                 where u.auth_id = (select auth.uid()) and u.activo));

drop policy if exists epp_reglas_escritura on public.epp_reglas;
create policy epp_reglas_escritura on public.epp_reglas for all to authenticated
  using (exists (select 1 from public.usuarios u
                 where u.auth_id = (select auth.uid()) and u.activo
                   and (u.rol::text = 'sgo' or lower(u.usuario) = 'lorenzo')))
  with check (exists (select 1 from public.usuarios u
                 where u.auth_id = (select auth.uid()) and u.activo
                   and (u.rol::text = 'sgo' or lower(u.usuario) = 'lorenzo')));

-- Las entregas: además de los roles de v1.83 (logistica, sgo, planificador),
-- Lorenzo tiene que poder escribir para anular aunque su rol no esté en esa
-- lista. Se recrea la política de escritura de epp_entregas sumándolo.
drop policy if exists epp_entregas_escritura on public.epp_entregas;
create policy epp_entregas_escritura on public.epp_entregas for all to authenticated
  using (exists (select 1 from public.usuarios u
                 where u.auth_id = (select auth.uid()) and u.activo
                   and (u.rol::text in ('logistica','sgo','planificador') or lower(u.usuario) = 'lorenzo')))
  with check (exists (select 1 from public.usuarios u
                 where u.auth_id = (select auth.uid()) and u.activo
                   and (u.rol::text in ('logistica','sgo','planificador') or lower(u.usuario) = 'lorenzo')));

-- Las solicitudes también: al anular una entrega que había usado una
-- autorización de HyS, la autorización vuelve a 'aprobada'.
drop policy if exists epp_solicitudes_escritura on public.epp_solicitudes;
create policy epp_solicitudes_escritura on public.epp_solicitudes for all to authenticated
  using (exists (select 1 from public.usuarios u
                 where u.auth_id = (select auth.uid()) and u.activo
                   and (u.rol::text in ('logistica','sgo','planificador') or lower(u.usuario) = 'lorenzo')))
  with check (exists (select 1 from public.usuarios u
                 where u.auth_id = (select auth.uid()) and u.activo
                   and (u.rol::text in ('logistica','sgo','planificador') or lower(u.usuario) = 'lorenzo')));

-- 4) Realtime -----------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and tablename = 'epp_reglas') then
    alter publication supabase_realtime add table public.epp_reglas;
  end if;
end $$;

-- ============================================================
-- DIAGNÓSTICO (correr después; tiene que devolver filas, no error)
-- ============================================================
-- ¿Quedaron las columnas nuevas?
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'epp_entregas'
  and column_name in ('anulada','anulada_en','anulada_por','motivo_anulacion')
order by column_name;

-- ¿Existe la tabla de reglas y sus políticas?
select tablename, policyname from pg_policies
where schemaname = 'public' and tablename in ('epp_reglas','epp_entregas','epp_solicitudes')
order by tablename, policyname;

-- ============================================================
-- CONTROLES ÚTILES
-- ============================================================
-- Posibles dobles toques (mismo EPP, misma persona, < 2 minutos):
-- select c.nombre, a.epp_key, a.fecha, b.fecha as segunda, a.entregada_por
-- from public.epp_entregas a
-- join public.epp_entregas b on b.colaborador_id = a.colaborador_id
--   and b.epp_key = a.epp_key and b.id <> a.id
--   and b.fecha > a.fecha and b.fecha < a.fecha + interval '2 minutes'
-- join public.epp_colaboradores c on c.id = a.colaborador_id
-- where not a.anulada and not b.anulada
-- order by a.fecha desc;

-- Correcciones hechas:
-- select c.nombre, e.epp_key, e.fecha, e.anulada_por, e.anulada_en, e.motivo_anulacion
-- from public.epp_entregas e join public.epp_colaboradores c on c.id = e.colaborador_id
-- where e.anulada order by e.anulada_en desc;

-- Ajustes de HyS vigentes:
-- select ambito, ambito_id, epp_key, nombre, frecuencia, limite, sin_tope, quitado, actualizado_por, actualizado_en
-- from public.epp_reglas order by ambito, ambito_id, epp_key;
