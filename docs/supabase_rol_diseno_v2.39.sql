-- ============================================================
-- v2.39 — ROL "DISEÑO" + ALTA de Martín Brusa (brusa.martin)
--
-- Qué puede hacer Diseño (decidido por Lorenzo, 21/10/2026):
--   - Producción: VER (Gantt, KPIs, órdenes de toda la planta). No asigna,
--     no mueve, no edita. Igual que Logística.
--   - SGO: VER (eventos, NC, acciones, indicadores, controles, agenda ISO).
--     No crea ni modifica. Quedan AFUERA a propósito el tarifario de costos y
--     la auditoría interna de SGO.
--   - Planos: subir y reemplazar revisiones (lo único que escribe).
--
-- Todo lo que se agrega acá son políticas NUEVAS y SOLO de lectura (salvo
-- planos). No se modifica ninguna política existente de otro rol.
--
-- Requiere haber corrido antes docs/supabase_planos_v2.38.sql.
--
-- ⚠ SE CORRE EN DOS VECES (Postgres no deja usar un valor nuevo de un enum en
--   la misma ejecución en que se crea):
--     PASO 1: seleccionar SOLO el bloque "PASO 1" y Run.
--     PASO 2: seleccionar desde "PASO 2" hasta el final y Run.
-- Las dos partes son re-ejecutables.
-- Correr ANTES del push.
-- ============================================================


-- ============================================================
-- PASO 1 — nuevo valor del enum de roles (correr SOLO esto primero)
-- ============================================================
alter type rol_usuario add value if not exists 'diseno';


-- ============================================================
-- PASO 2 — todo lo demás (correr después del paso 1)
-- ============================================================

-- 0) DIAGNÓSTICO (solo lectura): ¿ya existe alguien Brusa? Debe dar 0 filas.
-- select usuario, nombre, rol, activo from usuarios
-- where usuario ilike '%brusa%' or nombre ilike '%brusa%';

-- ------------------------------------------------------------
-- 1) PERFIL
--    No lleva sectores: el rol ve toda la planta por la política del punto 3.
-- ------------------------------------------------------------
insert into usuarios (nombre, usuario, rol, grupo_nomina, activo) values
  ('Brusa Martín', 'brusa.martin', 'diseno', null, true)
on conflict (usuario) do update set
  nombre = excluded.nombre,
  rol    = excluded.rol,
  activo = true;

-- ------------------------------------------------------------
-- 2) PLANOS: quién sube = Super Admin + Diseño
--    Reemplaza las políticas de escritura de v2.38 (que eran solo Super Admin).
--    La lectura no cambia: cualquier usuario logueado.
-- ------------------------------------------------------------
create or replace function app_puede_cargar_planos() returns boolean
  language sql stable security definer set search_path = public as $$
  select app_es_super_admin() or coalesce(app_rol() = 'diseno', false)
$$;

drop policy if exists planos_alta on planos;
create policy planos_alta on planos
  for insert to authenticated
  with check (app_puede_cargar_planos());

drop policy if exists planos_modificar on planos;
create policy planos_modificar on planos
  for update to authenticated
  using (app_puede_cargar_planos())
  with check (app_puede_cargar_planos());

drop policy if exists planos_storage_subir on storage.objects;
create policy planos_storage_subir on storage.objects
  for insert to authenticated
  with check (bucket_id = 'planos' and app_puede_cargar_planos());

drop policy if exists planos_storage_actualizar on storage.objects;
create policy planos_storage_actualizar on storage.objects
  for update to authenticated
  using (bucket_id = 'planos' and app_puede_cargar_planos())
  with check (bucket_id = 'planos' and app_puede_cargar_planos());

-- ------------------------------------------------------------
-- 3) PRODUCCIÓN — lectura de tareas para Diseño.
--    Política ADICIONAL: Postgres suma (OR) las políticas de lectura, así que
--    no toca lo que ya ven los demás roles. Las paradas, órdenes, máquinas,
--    ausencias, feriados, etc. ya son legibles por cualquier logueado.
-- ------------------------------------------------------------
drop policy if exists sel_tareas_diseno on tareas;
create policy sel_tareas_diseno on tareas
  for select to authenticated
  using (app_rol() = 'diseno');

-- ------------------------------------------------------------
-- 4) SGO — lectura para Diseño, tabla por tabla.
--    Si alguna tabla no existe en esta base, se saltea sin error.
--    Fuera a propósito: sgo_tarifarios_costos (costos) y sgo_auditoria.
-- ------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'sgo_eventos', 'sgo_acciones', 'sgo_indicadores', 'sgo_indicador_mediciones',
    'sgo_controles_programados', 'sgo_control_ejecuciones', 'sgo_garantias_iso',
    'sgo_agenda_iso', 'sgo_tareas', 'sgo_tarea_comentarios'
  ]
  loop
    if to_regclass('public.' || t) is not null then
      execute format('drop policy if exists %I on public.%I', t || '_select_diseno', t);
      execute format(
        'create policy %I on public.%I for select to authenticated using (app_rol() = ''diseno'')',
        t || '_select_diseno', t);
    end if;
  end loop;
end $$;

-- Fotos de evidencias de SGO (bucket privado): solo ver.
drop policy if exists sgo_evidencias_select_diseno on storage.objects;
create policy sgo_evidencias_select_diseno on storage.objects
  for select to authenticated
  using (bucket_id = 'sgo-evidencias' and app_rol() = 'diseno');

-- ============================================================
-- 5) VERIFICACIÓN
-- ============================================================
-- select usuario, nombre, rol, activo, (auth_id is not null) as tiene_login
-- from usuarios where usuario = 'brusa.martin';
--   Esperado: brusa.martin | Brusa Martín | diseno | true
--   tiene_login: false ANTES del script de cuentas, true DESPUÉS.
--
-- select tablename, policyname from pg_policies
-- where policyname like '%diseno%' order by 1;
--   Esperado: sel_tareas_diseno + una por cada tabla SGO + la de evidencias.
