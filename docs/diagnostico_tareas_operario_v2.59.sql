-- v2.59 - DIAGNÓSTICO: "no le llegan las tareas al colaborador".
-- SOLO LECTURA. No modifica nada. Correr en PRODUCCIÓN.
-- Cambiar el usuario en la primera línea de cada consulta si es otro caso.
--
-- Cómo leer el resultado:
--  1) Si la consulta 1 NO muestra la tarea -> nunca llegó a la base: quedó
--     trabada en la cola de la PC de la planificadora (mirar el aviso de
--     "pendientes de subir" en su pantalla). No es un problema de la tablet.
--  2) Si la muestra, mirar la columna "estacion": la tablet del colaborador solo
--     muestra la cola de la estación ELEGIDA. Si eligió otra, no la ve
--     (v2.59 agrega el aviso "Tenés N tareas en otra estación").
--  3) Si la estación coincide y aun así no la ve -> le faltó el aviso de tiempo
--     real (corte de Wi-Fi / pantalla bloqueada). v2.59 lo recupera solo.

-- 1) Tareas ABIERTAS asignadas al colaborador, con su estación.
select t.creada_en, t.estado, t.sector_id, m.nombre as estacion, t.modelo,
       t.componente_codigo, t.inicio_planificado, t.id
from tareas t
join usuarios u on u.id = t.operario_id
left join maquinas m on m.id = t.maquina_id
where u.usuario = 'mazza.alexander'
  and t.estado <> 'finalizada'
order by t.creada_en desc nulls last;

-- 2) Sus sectores y su vínculo de login (auth_id vacío = no puede entrar).
select u.usuario, u.nombre, u.rol, u.activo, (u.auth_id is not null) as tiene_login,
       array_agg(us.sector_id order by us.sector_id) as sectores
from usuarios u
left join usuario_sectores us on us.usuario_id = u.id
where u.usuario = 'mazza.alexander'
group by u.usuario, u.nombre, u.rol, u.activo, u.auth_id;

-- 3) Para todos: colaboradores con tareas abiertas repartidas en MÁS de una
--    estación (los que más probablemente "no ven" alguna).
select u.usuario, count(*) as abiertas, count(distinct t.maquina_id) as estaciones,
       string_agg(distinct m.nombre, ', ') as en
from tareas t
join usuarios u on u.id = t.operario_id
left join maquinas m on m.id = t.maquina_id
where t.estado <> 'finalizada' and u.rol = 'operario'
group by u.usuario
having count(distinct t.maquina_id) > 1
order by estaciones desc, abiertas desc;
