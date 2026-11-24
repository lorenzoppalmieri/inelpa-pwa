-- v2.65 - RENDIMIENTO de la RLS de `tareas`.
--
-- PROBLEMA (24/11/2026, tablet de mazza.alexander): "canceling statement due
-- to statement timeout" al pedir sus tareas -> el equipo quedaba con 0 tareas.
-- Las políticas de `tareas` llaman a app_rol() / app_uid() UNA VEZ POR FILA
-- (son funciones security definer: Postgres no las puede "plegar"). Para un
-- OPERARIO se evalúan sobre toda la tabla (miles de filas, 4 políticas), y la
-- consulta queda al borde del límite de tiempo: según la carga del momento, se
-- corta. Al planificador no le pasa porque su primera condición ya da verdadero.
--
-- SOLUCIÓN (recomendación oficial de Supabase para RLS): envolver las funciones
-- en (select ...). Así se calculan UNA vez por consulta y no una por fila.
--
-- NO CAMBIA QUIÉN VE QUÉ: son las mismas políticas con las mismas condiciones.
-- Solo cambia la velocidad. No toca usuarios, sectores ni datos.
--
-- Correr PRIMERO en INELPA-TEST y después en PRODUCCIÓN. Idempotente.
-- Si alguna política de producción no es la esperada, el script se FRENA sin
-- cambiar nada y avisa (no pisa una regla que alguien haya modificado a mano).

-- 0) Para mirar antes (opcional): las políticas actuales.
-- select policyname, cmd, qual, with_check from pg_policies
-- where schemaname = 'public' and tablename = 'tareas' order by policyname;

begin;

-- 1) Control: las políticas actuales tienen que ser las conocidas.
do $$
declare q text;
begin
  select qual into q from pg_policies where schemaname = 'public' and tablename = 'tareas' and policyname = 'sel_tareas';
  if q is null or q not like '%planificador%' or q not like '%encargado%' or q not like '%logistica%'
     or q not like '%app_uid()%' or q not like '%app_sectores()%' then
    raise exception 'sel_tareas no es la esperada (%). No se cambió nada: avisar a Claude.', q;
  end if;

  select qual into q from pg_policies where schemaname = 'public' and tablename = 'tareas' and policyname = 'wr_tareas_gestion';
  if q is null or q not like '%planificador%' or q not like '%encargado%' or q not like '%reparacion%' then
    raise exception 'wr_tareas_gestion no es la esperada (%). No se cambió nada: avisar a Claude.', q;
  end if;

  select qual into q from pg_policies where schemaname = 'public' and tablename = 'tareas' and policyname = 'upd_tareas_operario';
  if q is null or q not like '%operario%' or q not like '%app_uid()%' or q not like '%app_sectores()%' then
    raise exception 'upd_tareas_operario no es la esperada (%). No se cambió nada: avisar a Claude.', q;
  end if;
end $$;

-- 2) Mismas reglas, con las funciones calculadas una sola vez por consulta.
drop policy if exists sel_tareas on public.tareas;
create policy sel_tareas on public.tareas for select to authenticated using (
  (select app_rol()) in ('planificador', 'encargado', 'logistica')
  or operario_id = (select app_uid())
  or sector_id in (select app_sectores())
);

drop policy if exists wr_tareas_gestion on public.tareas;
create policy wr_tareas_gestion on public.tareas for all to authenticated
  using (
    (select app_rol()) = 'planificador'
    or ((select app_rol()) = 'encargado' and tipo = 'reparacion')
  )
  with check (
    (select app_rol()) = 'planificador'
    or ((select app_rol()) = 'encargado' and tipo = 'reparacion')
  );

drop policy if exists upd_tareas_operario on public.tareas;
create policy upd_tareas_operario on public.tareas for update to authenticated
  using (
    (select app_rol()) = 'operario'
    and (operario_id = (select app_uid()) or sector_id in (select app_sectores()))
  )
  with check (
    (select app_rol()) = 'operario'
    and (operario_id = (select app_uid()) or sector_id in (select app_sectores()))
  );

-- La de Diseño (v2.39) solo se reescribe si ya existe: no se agrega a una base
-- donde no estaba.
do $$
begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'tareas' and policyname = 'sel_tareas_diseno') then
    execute 'drop policy sel_tareas_diseno on public.tareas';
    execute 'create policy sel_tareas_diseno on public.tareas for select to authenticated using ((select app_rol()) = ''diseno'')';
  end if;
end $$;

commit;

-- 3) Verificación: las mismas políticas, ahora con "( SELECT app_rol()" adentro.
select policyname, cmd, qual from pg_policies
where schemaname = 'public' and tablename = 'tareas'
order by policyname;
