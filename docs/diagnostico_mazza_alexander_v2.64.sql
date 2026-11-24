-- v2.64 - DIAGNÓSTICO PUNTUAL: mazza.alexander.
-- SOLO LECTURA hasta la sección 4 (que viene COMENTADA). Correr en PRODUCCIÓN.
-- Correr las consultas DE A UNA: el editor de Supabase muestra solo el
-- resultado de la última.
--
-- Datos ya confirmados (24/11): su login apunta a un solo perfil
-- (ed0092ee-6f85-4dbc-9702-6f5ba88ca855); sus 6 tareas abiertas están a su
-- nombre, en su sector (bob_dist_bt) y en estaciones activas: 3 en la
-- Bobinadora 20 (del 19/11) y 3 en la Bobinadora 03 (del 24/11).


-- ============================================================
-- 1) SU COLA: ¿qué lo empuja hasta el jueves?
--    El trencito pone cada tarea nueva DETRÁS de todas las que tiene
--    asignadas antes, en orden de asignación. Si "horas_acumuladas" de las
--    que ya tiene supera ~16 h (dos jornadas), la nueva cae el jueves.
--    "repetida" = misma OF y mismo semielaborado que otra suya abierta
--    (posible duplicado de cuando no le llegaban y se volvió a asignar).
-- ============================================================
select t.creada_en, t.estado, m.nombre as estacion, o.nro_orden, t.componente_codigo,
       t.tiempo_estandar_min,
       round(sum(t.tiempo_estandar_min) over (order by t.creada_en nulls first, t.id) / 60.0, 1) as horas_acumuladas,
       count(*) over (partition by t.orden_id, t.componente_codigo) > 1 as repetida,
       t.inicio_planificado, t.inicio_real, t.id
from tareas t
left join maquinas m on m.id = t.maquina_id
left join ordenes o on o.id = t.orden_id
where t.operario_id = 'ed0092ee-6f85-4dbc-9702-6f5ba88ca855'
  and t.estado in ('pendiente', 'en_proceso', 'pausada')
order by t.creada_en nulls first, t.id;


-- ============================================================
-- 2) TODO LO QUE PODRÍA MARCARLO OCUPADO O AUSENTE (una sola consulta).
--    - ausencia: días que la cascada le saltea a ÉL.
--    - feriado: días cerrados para TODOS (no sería solo él).
--    - corte de luz: afecta a todo un sector (no sería solo él).
--    - pausa abierta: una tarea suya parada que sigue "ocupándolo".
-- ============================================================
select 'ausencia' as tipo, to_char(a.fecha, 'DD/MM') as cuando, a.motivo as detalle
from ausencias a
where a.usuario_id = 'ed0092ee-6f85-4dbc-9702-6f5ba88ca855' and a.fecha >= current_date - 7
union all
select 'feriado', to_char(f.fecha::date, 'DD/MM'), f.descripcion
from feriados f
where f.fecha::date between current_date - 1 and current_date + 10
union all
select 'corte de luz', to_char(c.desde at time zone 'America/Argentina/Buenos_Aires', 'DD/MM HH24:MI') || ' a ' ||
       to_char(c.hasta at time zone 'America/Argentina/Buenos_Aires', 'DD/MM HH24:MI'), array_to_string(c.sectores, ', ')
from cortes_luz c
where c.hasta >= now() - interval '1 day'
  and (cardinality(c.sectores) = 0 or 'bob_dist_bt' = any(c.sectores))
union all
select 'pausa abierta', to_char(p.inicio at time zone 'America/Argentina/Buenos_Aires', 'DD/MM HH24:MI'), p.causa
from paradas p
join tareas t on t.id = p.tarea_id
where t.operario_id = 'ed0092ee-6f85-4dbc-9702-6f5ba88ca855' and p.fin is null
order by 1, 2;


-- ============================================================
-- 3) ÉL CONTRA SUS COMPAÑEROS DE BOBINADO DIST. B.T.
--    Mismas columnas para todos: si algo de él es distinto, salta a la vista.
--    "estacion_habitual" = donde terminó más tareas en los últimos 60 días.
--    "estaciones_abiertas" = dónde están sus tareas abiertas HOY.
--    Si la habitual NO está entre las abiertas, su tablet está parada en
--    una estación donde no tiene nada: por eso "no le llega".
-- ============================================================
select u.usuario, u.nombre, u.rol, u.activo, u.grupo_nomina,
       u.auth_id is not null as tiene_login, a.email_confirmed_at is not null as email_confirmado,
       a.banned_until, a.last_sign_in_at,
       (select string_agg(s.sector_id, ', ' order by s.sector_id) from usuario_sectores s where s.usuario_id = u.id) as sectores,
       (select m.nombre from tareas t join maquinas m on m.id = t.maquina_id
         where t.operario_id = u.id and t.estado = 'finalizada' and t.fin_real > now() - interval '60 days'
         group by m.nombre order by count(*) desc limit 1) as estacion_habitual,
       (select string_agg(distinct m.nombre, ', ') from tareas t join maquinas m on m.id = t.maquina_id
         where t.operario_id = u.id and t.estado <> 'finalizada') as estaciones_abiertas,
       (select count(*) from tareas t where t.operario_id = u.id and t.estado = 'pendiente') as pendientes,
       (select round(sum(t.tiempo_estandar_min) / 60.0, 1) from tareas t where t.operario_id = u.id and t.estado = 'pendiente') as horas_pendientes
from usuarios u
left join auth.users a on a.id = u.auth_id
where u.id in (select usuario_id from usuario_sectores where sector_id = 'bob_dist_bt')
order by (u.usuario = 'mazza.alexander') desc, u.usuario;


-- ============================================================
-- 4) CORRECCIÓN PUNTUAL (COMENTADA). Toca SOLO filas de mazza.alexander.
--    Descomentar recién después de mirar 1 y 3, y SOLO si corresponde.
-- ============================================================

-- 4a) Si sus tareas están en una estación que NO es la que usa: pasar sus
--     PENDIENTES a su estación habitual. Reemplazar 'NOMBRE_HABITUAL' por el
--     nombre que dio la consulta 3 (ej. 'Bobinadora 07').
--
-- update tareas t
-- set maquina_id = (select id from maquinas where nombre = 'NOMBRE_HABITUAL' and activo limit 1)
-- where t.operario_id = 'ed0092ee-6f85-4dbc-9702-6f5ba88ca855'
--   and t.estado = 'pendiente'
--   and exists (select 1 from maquinas where nombre = 'NOMBRE_HABITUAL' and activo);
--
-- Verificación:
-- select m.nombre, count(*) from tareas t join maquinas m on m.id = t.maquina_id
-- where t.operario_id = 'ed0092ee-6f85-4dbc-9702-6f5ba88ca855' and t.estado = 'pendiente'
-- group by m.nombre;

-- 4b) Las "repetidas" de la consulta 1 NO se borran por SQL: que la
--     planificadora las elimine desde Planificación (botón Eliminar). Así la
--     baja llega a todos los equipos por el circuito normal.
