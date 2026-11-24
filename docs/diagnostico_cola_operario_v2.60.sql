-- v2.60 - DIAGNÓSTICO: "planificamos una tarea para hoy y la lleva sola a otro día".
-- SOLO LECTURA. Correr en PRODUCCIÓN. Cambiar el usuario si es otro caso.
--
-- La cascada del Gantt corre una pendiente por uno de estos motivos:
--   A) el colaborador tiene OTRAS tareas antes en su cola        -> consulta 1
--   B) tiene una tarea ABIERTA (pausada/en curso) hace días       -> consulta 2
--   C) tiene AUSENCIAS cargadas en esos días                     -> consulta 3
--   D) la ESTACIÓN está ocupada por otro colaborador             -> consulta 4
-- La consulta 5 revisa a TODOS los colaboradores para B y C.

-- 1) Su cola: pendientes en orden de asignación, con horas acumuladas.
--    Si "horas_acumuladas" ya supera ~8 h antes de la tarea nueva, la cola
--    llega a otro día. Ojo con duplicadas (misma OF y semielaborado dos veces).
select t.creada_en, t.estado, m.nombre as estacion, t.modelo, t.componente_codigo,
       t.orden_id, t.tiempo_estandar_min,
       round(sum(t.tiempo_estandar_min) over (order by t.creada_en nulls first, t.id) / 60.0, 1) as horas_acumuladas,
       t.inicio_planificado, t.id
from tareas t
join usuarios u on u.id = t.operario_id
left join maquinas m on m.id = t.maquina_id
where u.usuario = 'mazza.alexander' and t.estado = 'pendiente'
order by t.creada_en nulls first, t.id;

-- 2) Tareas ABIERTAS ya arrancadas (en curso / pausadas) y desde cuándo está
--    abierta la pausa. Una pausada desde hace días sigue "ocupándolo" por lo
--    que le falta (v2.54): si quedó abierta por error, hay que cerrarla.
select t.estado, t.inicio_real, m.nombre as estacion, t.modelo, t.tiempo_estandar_min,
       (select min(p.inicio) from paradas p where p.tarea_id = t.id and p.fin is null) as pausa_abierta_desde,
       (select string_agg(p.causa, ', ') from paradas p where p.tarea_id = t.id and p.fin is null) as causa_pausa,
       t.id
from tareas t
join usuarios u on u.id = t.operario_id
left join maquinas m on m.id = t.maquina_id
where u.usuario = 'mazza.alexander' and t.estado in ('en_proceso', 'pausada')
order by t.inicio_real;

-- 3) Ausencias cargadas desde hoy.
select a.fecha, a.*
from ausencias a
join usuarios u on u.id = a.usuario_id
where u.usuario = 'mazza.alexander' and a.fecha >= current_date - 1
order by a.fecha;

-- 4) Lo que tienen las estaciones donde le asignan (de cualquier colaborador).
select m.nombre as estacion, u2.usuario as colaborador, t.estado, t.creada_en, t.tiempo_estandar_min
from tareas t
join maquinas m on m.id = t.maquina_id
left join usuarios u2 on u2.id = t.operario_id
where t.estado <> 'finalizada'
  and t.maquina_id in (select t2.maquina_id from tareas t2 join usuarios u on u.id = t2.operario_id
                       where u.usuario = 'mazza.alexander' and t2.estado <> 'finalizada')
order by m.nombre, t.creada_en;

-- 5) TODOS: colaboradores con una tarea PAUSADA desde antes de hoy, o con
--    ausencias cargadas de hoy en adelante.
select u.usuario, 'pausada desde ' || to_char(min(p.inicio) at time zone 'America/Argentina/Buenos_Aires', 'DD/MM HH24:MI') as que,
       t.modelo as detalle
from tareas t
join usuarios u on u.id = t.operario_id
join paradas p on p.tarea_id = t.id and p.fin is null
where t.estado = 'pausada'
group by u.usuario, t.id, t.modelo
having min(p.inicio) < date_trunc('day', now() at time zone 'America/Argentina/Buenos_Aires') at time zone 'America/Argentina/Buenos_Aires'
union all
select u.usuario, 'ausencia ' || to_char(a.fecha, 'DD/MM'), null
from ausencias a
join usuarios u on u.id = a.usuario_id
where a.fecha >= current_date
order by 1, 2;
