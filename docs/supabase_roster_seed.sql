-- ============================================================
-- INELPA PWA — NOMINA COMPLETA: 47 operarios reales de planta
-- Inserta los perfiles en 'usuarios' (rol operario) + sus sectores (N:N).
-- Los 5 de gestion (lorenzo, rocio, ulises, santiago, omar) ya estan en
-- supabase_auth_setup.sql; aca van solo los operarios.
--
-- ORDEN: correr DESPUES de supabase_schema.sql y supabase_auth_setup.sql.
-- Re-ejecutable (on conflict do nothing).
--
-- DESPUES de correr esto: crear las cuentas de Auth. Para no hacerlo a mano 47
-- veces, usar el script  scripts/crear_cuentas_auth.mjs  (ver README de scripts).
-- Ese script crea las cuentas y vincula auth_id automaticamente.
-- ============================================================

-- 1) Perfiles de operarios (login = apellido.nombre sin acentos).
insert into usuarios (nombre, usuario, rol, grupo_nomina, activo) values
  ('Alegre Hugo Emiliano', 'alegre.hugo', 'operario', 'herreria', true),
  ('Álvarez Nazareno Feliciano', 'alvarez.nazareno', 'operario', 'herreria', true),
  ('Chaves Emanuel Ezequiel', 'chaves.emanuel', 'operario', 'herreria', true),
  ('Espíndola Eladio Marcelo', 'espindola.eladio', 'operario', 'herreria', true),
  ('Martínez Ignacio Javier', 'martinez.ignacio', 'operario', 'herreria', true),
  ('Mendoza Roberto Luis', 'mendoza.roberto', 'operario', 'herreria', true),
  ('Quintana Yoel', 'quintana.yoel', 'operario', 'herreria', true),
  ('Raballe Eduardo Ramón', 'raballe.eduardo', 'operario', 'herreria', true),
  ('Spagnolo Dario Gabriel', 'spagnolo.dario', 'operario', 'herreria', true),
  ('Trejo Ernesto Nicolás', 'trejo.ernesto', 'operario', 'herreria', true),
  ('Zapata García Fabio Norberto', 'zapata.garcia', 'operario', 'herreria', true),
  ('Allegrini Vanesa Alicia', 'allegrini.vanesa', 'operario', 'bobinado_dist', true),
  ('Carruega Roberto Hector', 'carruega.roberto', 'operario', 'bobinado_dist', true),
  ('Fogolin Rocío', 'fogolin.rocio', 'operario', 'bobinado_dist', true),
  ('García Ríos Lara Marisol', 'garcia.rios', 'operario', 'bobinado_dist', true),
  ('Jalil Sabrina Inés', 'jalil.sabrina', 'operario', 'bobinado_dist', true),
  ('Lescano Aldana Ayelen', 'lescano.aldana', 'operario', 'bobinado_dist', true),
  ('Toledo Rosario', 'toledo.rosario', 'operario', 'bobinado_dist', true),
  ('Verrelli Maria Florencia', 'verrelli.maria', 'operario', 'bobinado_dist', true),
  ('Belis Bianca Nair', 'belis.bianca', 'operario', 'bobinado_rural', true),
  ('Lozano Sofía', 'lozano.sofia', 'operario', 'bobinado_rural', true),
  ('Mansilla Tomás', 'mansilla.tomas', 'operario', 'bobinado_rural', true),
  ('Sanchez Nahir Florencia', 'sanchez.nahir', 'operario', 'bobinado_rural', true),
  ('Sabelotti Norberto', 'sabelotti.norberto', 'operario', 'carpinteria', true),
  ('López Lautaro Gonzalo', 'lopez.lautaro', 'operario', 'corte_aislacion', true),
  ('Vallejos Edgar', 'vallejos.edgar', 'operario', 'corte_aislacion', true),
  ('Acosta Diego Mateo', 'acosta.diego', 'operario', 'pintura', true),
  ('Licheri Guillermo German', 'licheri.guillermo', 'operario', 'pintura', true),
  ('Villa Javier Osvaldo', 'villa.javier', 'operario', 'pintura', true),
  ('Aguilar Matías', 'aguilar.matias', 'operario', 'montaje_dist', true),
  ('Gomez Diego Alejandro', 'gomez.diego', 'operario', 'montaje_dist', true),
  ('Nievas Gonzalo Martin', 'nievas.gonzalo', 'operario', 'montaje_dist', true),
  ('Pucheta Cristian Ricardo', 'pucheta.cristian', 'operario', 'montaje_dist', true),
  ('Pussetto Diego', 'pussetto.diego', 'operario', 'montaje_dist', true),
  ('Ramallo Damián Ezequiel', 'ramallo.damian', 'operario', 'montaje_dist', true),
  ('Rodriguez Juan Alejandro', 'rodriguez.juan', 'operario', 'montaje_dist', true),
  ('Sequeira Denis Gino', 'sequeira.denis', 'operario', 'montaje_dist', true),
  ('Suarez Leandro Daniel', 'suarez.leandro', 'operario', 'montaje_dist', true),
  ('Trindade Claudio', 'trindade.claudio', 'operario', 'montaje_dist', true),
  ('Zapata Alexis', 'zapata.alexis', 'operario', 'montaje_dist', true),
  ('Bender Lautaro Francisco', 'bender.lautaro', 'operario', 'montaje_rural', true),
  ('Bonetti Pablo Joaquin', 'bonetti.pablo', 'operario', 'montaje_rural', true),
  ('Curbelo Leonardo Daniel', 'curbelo.leonardo', 'operario', 'montaje_rural', true),
  ('Duarte Facundo Tomas', 'duarte.facundo', 'operario', 'montaje_rural', true),
  ('García Maximiliano Ezequiel', 'garcia.maximiliano', 'operario', 'montaje_rural', true),
  ('Moreira Nestor Brian', 'moreira.nestor', 'operario', 'montaje_rural', true),
  ('Tamagna Patricio Ruben', 'tamagna.patricio', 'operario', 'montaje_rural', true)
on conflict (usuario) do nothing;

-- 2) Sectores que ejecuta cada operario (N:N). Carpinteria / corte_aislacion /
--    pintura quedan SIN sector de planificacion (decision "literal del documento"):
--    no son asignables hasta mapear su sub-sector, por eso no tienen filas aqui.
insert into usuario_sectores (usuario_id, sector_id)
select u.id, s.sector_id
from usuarios u
join (values
  ('alegre.hugo','corte_conformado'),('alegre.hugo','soldadura_dist'),('alegre.hugo','soldadura_rural'),('alegre.hugo','lavado_pintura'),
  ('alvarez.nazareno','corte_conformado'),('alvarez.nazareno','soldadura_dist'),('alvarez.nazareno','soldadura_rural'),('alvarez.nazareno','lavado_pintura'),
  ('chaves.emanuel','corte_conformado'),('chaves.emanuel','soldadura_dist'),('chaves.emanuel','soldadura_rural'),('chaves.emanuel','lavado_pintura'),
  ('espindola.eladio','corte_conformado'),('espindola.eladio','soldadura_dist'),('espindola.eladio','soldadura_rural'),('espindola.eladio','lavado_pintura'),
  ('martinez.ignacio','corte_conformado'),('martinez.ignacio','soldadura_dist'),('martinez.ignacio','soldadura_rural'),('martinez.ignacio','lavado_pintura'),
  ('mendoza.roberto','corte_conformado'),('mendoza.roberto','soldadura_dist'),('mendoza.roberto','soldadura_rural'),('mendoza.roberto','lavado_pintura'),
  ('quintana.yoel','corte_conformado'),('quintana.yoel','soldadura_dist'),('quintana.yoel','soldadura_rural'),('quintana.yoel','lavado_pintura'),
  ('raballe.eduardo','corte_conformado'),('raballe.eduardo','soldadura_dist'),('raballe.eduardo','soldadura_rural'),('raballe.eduardo','lavado_pintura'),
  ('spagnolo.dario','corte_conformado'),('spagnolo.dario','soldadura_dist'),('spagnolo.dario','soldadura_rural'),('spagnolo.dario','lavado_pintura'),
  ('trejo.ernesto','corte_conformado'),('trejo.ernesto','soldadura_dist'),('trejo.ernesto','soldadura_rural'),('trejo.ernesto','lavado_pintura'),
  ('zapata.garcia','corte_conformado'),('zapata.garcia','soldadura_dist'),('zapata.garcia','soldadura_rural'),('zapata.garcia','lavado_pintura'),
  ('allegrini.vanesa','bob_dist_at'),('allegrini.vanesa','bob_dist_bt'),
  ('carruega.roberto','bob_dist_at'),('carruega.roberto','bob_dist_bt'),
  ('fogolin.rocio','bob_dist_at'),('fogolin.rocio','bob_dist_bt'),
  ('garcia.rios','bob_dist_at'),('garcia.rios','bob_dist_bt'),
  ('jalil.sabrina','bob_dist_at'),('jalil.sabrina','bob_dist_bt'),
  ('lescano.aldana','bob_dist_at'),('lescano.aldana','bob_dist_bt'),
  ('toledo.rosario','bob_dist_at'),('toledo.rosario','bob_dist_bt'),
  ('verrelli.maria','bob_dist_at'),('verrelli.maria','bob_dist_bt'),
  ('belis.bianca','bob_rural_at'),('belis.bianca','bob_rural_bt'),
  ('lozano.sofia','bob_rural_at'),('lozano.sofia','bob_rural_bt'),
  ('mansilla.tomas','bob_rural_at'),('mansilla.tomas','bob_rural_bt'),
  ('sanchez.nahir','bob_rural_at'),('sanchez.nahir','bob_rural_bt'),
  ('aguilar.matias','montaje_pa_dist'),('aguilar.matias','montaje_po_dist'),
  ('gomez.diego','montaje_pa_dist'),('gomez.diego','montaje_po_dist'),
  ('nievas.gonzalo','montaje_pa_dist'),('nievas.gonzalo','montaje_po_dist'),
  ('pucheta.cristian','montaje_pa_dist'),('pucheta.cristian','montaje_po_dist'),
  ('pussetto.diego','montaje_pa_dist'),('pussetto.diego','montaje_po_dist'),
  ('ramallo.damian','montaje_pa_dist'),('ramallo.damian','montaje_po_dist'),
  ('rodriguez.juan','montaje_pa_dist'),('rodriguez.juan','montaje_po_dist'),
  ('sequeira.denis','montaje_pa_dist'),('sequeira.denis','montaje_po_dist'),
  ('suarez.leandro','montaje_pa_dist'),('suarez.leandro','montaje_po_dist'),
  ('trindade.claudio','montaje_pa_dist'),('trindade.claudio','montaje_po_dist'),
  ('zapata.alexis','montaje_pa_dist'),('zapata.alexis','montaje_po_dist'),
  ('bender.lautaro','montaje_pa_rural'),('bender.lautaro','montaje_po_rural'),
  ('bonetti.pablo','montaje_pa_rural'),('bonetti.pablo','montaje_po_rural'),
  ('curbelo.leonardo','montaje_pa_rural'),('curbelo.leonardo','montaje_po_rural'),
  ('duarte.facundo','montaje_pa_rural'),('duarte.facundo','montaje_po_rural'),
  ('garcia.maximiliano','montaje_pa_rural'),('garcia.maximiliano','montaje_po_rural'),
  ('moreira.nestor','montaje_pa_rural'),('moreira.nestor','montaje_po_rural'),
  ('tamagna.patricio','montaje_pa_rural'),('tamagna.patricio','montaje_po_rural')
) as s(usuario, sector_id) on s.usuario = u.usuario
on conflict do nothing;

-- Verificacion: deberia dar 52 perfiles (5 gestion + 47 operarios) y 104 sectores.
select 'usuarios' as tabla, count(*) from usuarios
union all
select 'usuario_sectores', count(*) from usuario_sectores;
