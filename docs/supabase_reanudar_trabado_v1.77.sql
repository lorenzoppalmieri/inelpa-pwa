-- ============================================================
-- v1.77 — BUG "no deja reanudar": diagnostico + reparacion + realtime
--
-- SINTOMA: el operario toca "Reanudar para continuar" y la tarea queda pausada.
-- El boton se dibuja cuando estado='pausada', pero la funcion arrancaba con
-- `if (!paradaAbierta) return` — un no-op silencioso. Si la tarea esta pausada
-- SIN ninguna parada abierta, no habia forma de destrabarla.
--
-- El arreglo del front (v1.77) destraba al operario. Este archivo:
--   1) mide cuantas tareas quedaron incoherentes,
--   2) las repara,
--   3) revisa la causa de fondo: si `paradas` NO esta publicada en realtime,
--      el problema se repite todos los dias.
--
-- CORRER LOS PASOS 1 Y 4 PRIMERO Y MIRAR EL RESULTADO. El paso 3 modifica datos.
-- ============================================================


-- ------------------------------------------------------------
-- 1) DIAGNOSTICO — ¿cuantas tareas estan trabadas? (solo lectura)
--    Tarea 'pausada' sin ninguna parada abierta = boton muerto.
-- ------------------------------------------------------------
select count(*) as tareas_trabadas
from tareas t
where t.estado = 'pausada'
  and not exists (select 1 from paradas p where p.tarea_id = t.id and p.fin is null);


-- ------------------------------------------------------------
-- 2) EL DETALLE — quienes son, para reconocerlas en la tablet (solo lectura)
-- ------------------------------------------------------------
select t.id, t.sector_id, t.maquina_id, t.modelo, t.nro_transformador,
       t.estado, t.inicio_real,
       (select count(*) from paradas p where p.tarea_id = t.id) as paradas_totales,
       (select max(p.fin) from paradas p where p.tarea_id = t.id) as ultima_parada_cerrada
from tareas t
where t.estado = 'pausada'
  and not exists (select 1 from paradas p where p.tarea_id = t.id and p.fin is null)
order by t.inicio_real desc nulls last;


-- ------------------------------------------------------------
-- 3) REPARACION — devolverlas a 'en_proceso'.
--
--    Es lo mismo que hara el operario al tocar Reanudar con el codigo nuevo,
--    pero de una sola vez y sin que tenga que ir tarjeta por tarjeta.
--    NO inventa ninguna parada: los tiempos ya registrados quedan intactos.
--
--    Correr DESPUES de mirar el paso 2.
-- ------------------------------------------------------------
-- update tareas t
-- set estado = 'en_proceso'
-- where t.estado = 'pausada'
--   and not exists (select 1 from paradas p where p.tarea_id = t.id and p.fin is null);


-- ------------------------------------------------------------
-- 4) LA CAUSA DE FONDO — ¿esta `paradas` publicada en realtime?
--
--    El motor de sync mezcla dos fuentes: el ESTADO de la tarea llega por
--    realtime desde la nube, y las PARADAS son las del espejo local. Si los
--    eventos de `paradas` NO llegan, las dos fuentes se contradicen y la tablet
--    queda mostrando "pausada" sin ninguna parada que cerrar.
--
--    Esta consulta tiene que devolver 'tareas' Y 'paradas'. Si falta 'paradas',
--    ese es el origen del bug y se arregla con el paso 5.
-- ------------------------------------------------------------
select tablename
from pg_publication_tables
where pubname = 'supabase_realtime'
  and tablename in ('tareas', 'paradas')
order by tablename;


-- ------------------------------------------------------------
-- 5) SOLO SI el paso 4 no listo 'paradas': publicarla.
--    Idempotente: si ya estaba, no hace nada.
-- ------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'paradas'
  ) then
    alter publication supabase_realtime add table paradas;
    raise notice 'Tabla paradas AGREGADA a la publicacion realtime.';
  else
    raise notice 'La tabla paradas ya estaba publicada. Sin cambios.';
  end if;
end $$;

-- Para que el evento DELETE traiga la fila vieja completa (la usa onParadaChange
-- para sacar la parada del espejo local). Sin esto, un borrado llega sin datos.
alter table paradas replica identity full;


-- ============================================================
-- 6) VERIFICACION FINAL (correr despues de todo)
-- ============================================================
-- select
--   (select count(*) from tareas t
--     where t.estado = 'pausada'
--       and not exists (select 1 from paradas p where p.tarea_id = t.id and p.fin is null)
--   ) as trabadas_restantes,   -- esperado: 0
--   (select count(*) from pg_publication_tables
--     where pubname = 'supabase_realtime' and tablename = 'paradas'
--   ) as paradas_en_realtime;  -- esperado: 1
