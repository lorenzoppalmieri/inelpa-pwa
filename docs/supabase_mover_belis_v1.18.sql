-- ============================================================
-- INELPA PWA — v1.18: mover a Belis Bianca Nair (belis.bianca)
--   Bobinado RURAL  ->  Bobinado DISTRIBUCION
--
-- Correr en Supabase: SQL Editor -> pegar TODO -> Run. Re-ejecutable.
-- La app se actualiza sola por Realtime/sync (no requiere git push).
-- ============================================================

-- 1) Cambiar el grupo de nomina.
update usuarios set grupo_nomina = 'bobinado_dist' where usuario = 'belis.bianca';

-- 2) Reemplazar sus sectores (borra los de rural, carga los de distribucion).
delete from usuario_sectores
  where usuario_id = (select id from usuarios where usuario = 'belis.bianca');

insert into usuario_sectores (usuario_id, sector_id)
select u.id, s.sector_id
from usuarios u
join (values ('belis.bianca','bob_dist_at'), ('belis.bianca','bob_dist_bt'))
  as s(usuario, sector_id) on s.usuario = u.usuario
on conflict do nothing;

-- 3) Verificacion.
select u.usuario, u.nombre, u.grupo_nomina,
       array_agg(us.sector_id order by us.sector_id) as sectores
from usuarios u
left join usuario_sectores us on us.usuario_id = u.id
where u.usuario = 'belis.bianca'
group by u.usuario, u.nombre, u.grupo_nomina;
-- Esperado: bobinado_dist -> {bob_dist_at, bob_dist_bt}
