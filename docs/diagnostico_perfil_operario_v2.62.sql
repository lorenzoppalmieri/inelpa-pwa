-- v2.62 - DIAGNÓSTICO: "el planificador ve las tareas en el Gantt, pero el
-- colaborador no las ve en Mi trabajo". SOLO LECTURA. Correr en PRODUCCIÓN.
--
-- Hipótesis principal: la tarea está asignada a un PERFIL distinto del que usa
-- el colaborador para entrar (perfil duplicado, o el login vinculado a otro
-- perfil). El Gantt muestra el nombre, así que para el planificador "es
-- Alexander"; pero la tablet filtra por el id del perfil con el que se entró.

-- 1) Todos los perfiles que podrían ser él, con su login y sus tareas abiertas.
--    Si hay DOS filas, o si las tareas están en la fila "tiene_login = false",
--    esa es la causa.
select u.id, u.usuario, u.nombre, u.rol, u.activo,
       u.auth_id is not null as tiene_login, a.email as email_login, a.last_sign_in_at as ultimo_ingreso,
       (select count(*) from tareas t where t.operario_id = u.id and t.estado <> 'finalizada') as tareas_abiertas,
       (select string_agg(s.sector_id, ', ') from usuario_sectores s where s.usuario_id = u.id) as sectores
from usuarios u
left join auth.users a on a.id = u.auth_id
where u.nombre ilike '%mazza%' or u.nombre ilike '%alexander%'
   or u.usuario ilike '%mazza%' or u.usuario ilike '%alexander%';

-- 2) El login mazza.alexander@inelpa.local: ¿a qué perfil apunta?
select a.email, a.id as auth_id, a.last_sign_in_at, u.usuario as perfil_vinculado, u.id as perfil_id
from auth.users a
left join usuarios u on u.auth_id = a.id
where a.email ilike '%mazza%' or a.email ilike '%alexander%';

-- 3) PARA TODOS: nombres repetidos entre perfiles activos (posibles duplicados).
select lower(trim(nombre)) as nombre, count(*) as perfiles,
       string_agg(usuario || case when auth_id is null then ' (SIN login)' else '' end, ', ') as usuarios
from usuarios
where activo
group by lower(trim(nombre))
having count(*) > 1
order by 1;

-- 4) PARA TODOS: tareas abiertas asignadas a perfiles que NO pueden entrar
--    (sin login o inactivos). Esas tareas no las ve nadie en Mi trabajo.
select u.usuario, u.nombre, u.activo, u.auth_id is not null as tiene_login, count(*) as tareas_abiertas
from tareas t
join usuarios u on u.id = t.operario_id
where t.estado <> 'finalizada'
  and (u.auth_id is null or not u.activo)
group by u.usuario, u.nombre, u.activo, u.auth_id
order by tareas_abiertas desc;
