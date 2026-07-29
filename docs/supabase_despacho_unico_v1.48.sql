-- ============================================================
-- v1.48 — UN ENSAYO = UN DESPACHO (anti-duplicado)
--
-- PROBLEMA DETECTADO: una ficha de laboratorio ya finalizada se podía volver a
-- abrir desde "Ver ensayo" y finalizar otra vez. Cada pasada creaba un despacho
-- con id aleatorio -> el mismo transformador aparecía 2+ veces en el tablero de
-- Melany, inflando el stock y los KPIs.
--
-- DEFENSA EN 3 CAPAS:
--   1) UI: la ficha finalizada queda en solo lectura (sin botón Finalizar);
--      reabrirla es explícito y queda auditado (columna reaperturas).
--   2) App: el id del despacho se DERIVA del id del ensayo ('desp_<labId>'), así
--      re-finalizar reescribe la misma fila en vez de crear otra.
--   3) Base (este script): índice ÚNICO sobre laboratorio_id -> aunque dos
--      tablets sincronicen a la vez, Postgres rechaza el segundo despacho.
--
-- NOTA sobre "hacerlo con una función transaccional de Supabase": no aplica bien
-- acá. La app es offline-first: el laboratorio puede finalizar sin señal y el
-- cambio se sincroniza después desde la cola. Una RPC exigiría estar online en
-- ese instante. El id determinístico + este índice único dan la misma garantía
-- sin romper el modo offline.
--
-- Idempotente.
-- ============================================================

-- ============================================================
-- 1) VÍNCULO ensayo -> despacho
-- ============================================================
alter table despachos add column if not exists laboratorio_id text;

-- Auditoría de reaperturas del ensayo (quién y cuándo).
alter table laboratorio add column if not exists reaperturas jsonb;

-- ============================================================
-- 2) ANTES DE CREAR EL ÍNDICE: ¿hay duplicados de antes?
--    Correr esta consulta PRIMERO. Si devuelve filas, resolverlos con el
--    bloque 3 antes de seguir (el índice único fallaría).
-- ============================================================
-- select laboratorio_id, count(*), array_agg(id)
-- from despachos
-- where laboratorio_id is not null
-- group by laboratorio_id having count(*) > 1;

-- Duplicados históricos (creados antes de esta versión, sin vínculo):
-- se detectan por N° de serie repetido.
-- select nro_serie, count(*), array_agg(id order by creada_en)
-- from despachos
-- where nro_serie <> '' group by nro_serie having count(*) > 1;

-- ============================================================
-- 3) LIMPIEZA (opcional, revisar a mano antes de ejecutar)
--    Conserva el despacho MÁS AVANZADO de cada serie duplicada (el que ya tiene
--    embalaje/entrega) y borra los que quedaron sin tocar. NO se ejecuta solo:
--    descomentar únicamente después de revisar la consulta de arriba.
-- ============================================================
-- delete from despachos d
-- where d.estado = 'esperando_embalaje'
--   and d.embalaje_inicio is null
--   and exists (
--     select 1 from despachos o
--     where o.nro_serie = d.nro_serie and o.id <> d.id
--       and (o.embalaje_inicio is not null or o.estado <> 'esperando_embalaje')
--   );

-- ============================================================
-- 4) EL CANDADO: un ensayo no puede tener dos despachos.
--    Índice PARCIAL: solo aplica cuando laboratorio_id no es null, así los
--    despachos cargados a mano por Melany (sin ensayo) no se ven afectados.
-- ============================================================
create unique index if not exists idx_despachos_laboratorio_unico
  on despachos (laboratorio_id)
  where laboratorio_id is not null;

-- ============================================================
-- 5) VERIFICACIÓN
-- ============================================================
-- select count(*) as despachos_con_ensayo from despachos where laboratorio_id is not null;
-- select indexname from pg_indexes where tablename = 'despachos' and indexname = 'idx_despachos_laboratorio_unico';
