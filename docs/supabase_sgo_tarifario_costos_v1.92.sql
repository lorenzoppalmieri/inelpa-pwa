-- SGO v1.92 - Tarifario versionado para costos de retrabajos
-- Cada cambio crea una nueva fila. Los retrabajos guardan además una copia
-- del tarifario aplicado dentro de sgo_eventos.retrabajo.

create table if not exists public.sgo_tarifarios_costos (
  id uuid primary key default gen_random_uuid(),
  vigente_desde date not null,
  hora_hombre numeric(14,2) not null check (hora_hombre > 0),
  factor_tiempo_perdido numeric(8,3) not null check (factor_tiempo_perdido >= 1),
  cobre_kg numeric(14,2) not null check (cobre_kg > 0),
  aluminio_kg numeric(14,2) not null check (aluminio_kg > 0),
  creado_en timestamptz not null default now(),
  creado_por text not null check (lower(trim(creado_por)) = 'lorenzo')
);

comment on table public.sgo_tarifarios_costos is
  'Historial inmutable de valores base para calcular costos de retrabajos SGO.';

create index if not exists idx_sgo_tarifarios_costos_vigencia
  on public.sgo_tarifarios_costos (vigente_desde desc, creado_en desc);

alter table public.sgo_tarifarios_costos enable row level security;

revoke all on table public.sgo_tarifarios_costos from anon;
revoke all on table public.sgo_tarifarios_costos from authenticated;
grant select, insert on table public.sgo_tarifarios_costos to authenticated;

drop policy if exists sgo_tarifarios_costos_select on public.sgo_tarifarios_costos;
create policy sgo_tarifarios_costos_select
on public.sgo_tarifarios_costos
for select
to authenticated
using (
  exists (
    select 1
    from public.usuarios u
    where u.auth_id = (select auth.uid())
      and u.activo
      and u.rol::text in ('sgo', 'planificador')
  )
);

drop policy if exists sgo_tarifarios_costos_insert_lorenzo on public.sgo_tarifarios_costos;
create policy sgo_tarifarios_costos_insert_lorenzo
on public.sgo_tarifarios_costos
for insert
to authenticated
with check (
  lower(trim(creado_por)) = 'lorenzo'
  and exists (
    select 1
    from public.usuarios u
    where u.auth_id = (select auth.uid())
      and u.activo
      and lower(trim(u.usuario)) = 'lorenzo'
  )
);

insert into public.sgo_tarifarios_costos (
  vigente_desde, hora_hombre, factor_tiempo_perdido, cobre_kg, aluminio_kg, creado_por
)
select date '2026-08-20', 14500, 2, 22000, 12000, 'Lorenzo'
where not exists (select 1 from public.sgo_tarifarios_costos);
