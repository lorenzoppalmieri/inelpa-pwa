-- v2.67 - REGISTRO AUTOMÁTICO DE ERRORES de la app.
--
-- Cada equipo (tablet, PC) anota acá sus fallas: subidas descartadas, descargas
-- cortadas (timeouts), tiempo real caído, errores de pantalla. Así los vemos
-- ANTES de que alguien de planta avise. Ver src/lib/registroErrores.ts.
--
-- Tabla nueva y aislada: no toca ninguna tabla existente ni permisos de nadie.
-- Los equipos solo pueden AGREGAR filas; leerlas, solo el planificador (y
-- Lorenzo desde este editor). Idempotente.
-- Correr PRIMERO en INELPA-TEST y después en producción. Puede correrse antes
-- o después del push: sin la tabla, la app guarda los errores en el equipo y
-- los sube cuando la tabla existe.

create table if not exists public.errores_app (
  id            uuid primary key default gen_random_uuid(),
  creado_en     timestamptz not null default now(),
  ocurrido_en   timestamptz,
  usuario_id    uuid,
  usuario       text,
  rol           text,
  version       text,
  origen        text not null,
  mensaje       text not null,
  detalle       text,
  pantalla      text,
  dispositivo   text,
  repeticiones  int not null default 1
);

comment on table public.errores_app is
  'Registro automático de errores de la PWA (v2.67). Solo agregar; se consulta desde el SQL Editor.';

create index if not exists idx_errores_app_creado on public.errores_app (creado_en desc);
create index if not exists idx_errores_app_usuario on public.errores_app (usuario, creado_en desc);

alter table public.errores_app enable row level security;

revoke all on table public.errores_app from anon;
grant insert, select on table public.errores_app to authenticated;

drop policy if exists errores_app_insert on public.errores_app;
create policy errores_app_insert on public.errores_app
  for insert to authenticated with check (true);

drop policy if exists errores_app_select on public.errores_app;
create policy errores_app_select on public.errores_app
  for select to authenticated using ((select app_rol()) = 'planificador');

-- Verificación esperada: la tabla con 0 filas.
select count(*) as errores_registrados from public.errores_app;


-- ============================================================
-- CONSULTAS PARA EL DÍA A DÍA (copiar y correr de a una)
-- ============================================================

-- A) Resumen de las últimas 24 h: qué falla, a quién y cuántas veces.
-- select origen, mensaje, usuario, version, count(*) as veces, max(ocurrido_en) as ultima
-- from public.errores_app
-- where creado_en > now() - interval '24 hours'
-- group by origen, mensaje, usuario, version
-- order by veces desc, ultima desc;

-- B) Detalle de un colaborador (cambiar el usuario).
-- select ocurrido_en, origen, mensaje, detalle, pantalla, version
-- from public.errores_app
-- where usuario = 'mazza.alexander'
-- order by ocurrido_en desc limit 50;

-- C) Equipos con versión vieja (no recargaron la app).
-- select usuario, version, max(ocurrido_en) as visto
-- from public.errores_app
-- group by usuario, version
-- order by visto desc;

-- D) Limpieza (cada tanto): borrar lo de más de 90 días.
-- delete from public.errores_app where creado_en < now() - interval '90 days';
