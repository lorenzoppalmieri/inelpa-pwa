-- ============================================================
-- v1.65 - MANTENIMIENTO · LAYOUT SCADA (bloques + anotaciones)
-- Tablas para el mapa editable de la PWA: el plano es 100% dato.
--   mant_bloques      : áreas/máquinas del plano (muro/maquina/estanteria/zona)
--   mant_anotaciones  : líneas / círculos / texto de dibujo libre
-- Los pines de estado usan mant_activos.x_pct/y_pct (ya existen).
-- Escritura SOLO admin de mantenimiento (app_es_admin_mant() = rol
-- 'mantenimiento' o super admin 'lorenzo'); lectura todos los logueados.
-- Correr DESPUES de v1.62 + v1.63. Idempotente.
-- ============================================================

create table if not exists public.mant_bloques (
  id             uuid primary key default gen_random_uuid(),
  planta_id      text not null references public.mant_plantas(id) on delete cascade,
  tipo           text not null check (tipo in ('muro','maquina','estanteria','zona')),
  nombre         text not null,
  x numeric not null default 40, y numeric not null default 40,
  w numeric not null default 10, h numeric not null default 10,
  orden          integer not null default 0,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  actualizado_por text
);
create index if not exists idx_mant_bloques_planta on public.mant_bloques (planta_id);

create table if not exists public.mant_anotaciones (
  id         uuid primary key default gen_random_uuid(),
  planta_id  text not null references public.mant_plantas(id) on delete cascade,
  tipo       text not null check (tipo in ('linea','circulo','texto')),
  color      text not null default '#22d3ee',
  x1 numeric, y1 numeric, x2 numeric, y2 numeric,     -- linea
  cx numeric, cy numeric, r numeric,                   -- circulo
  x numeric, y numeric, texto text, tam integer,       -- texto
  creado_por text,
  creado_en  timestamptz not null default now()
);
create index if not exists idx_mant_anotaciones_planta on public.mant_anotaciones (planta_id);

-- ---------- RLS ----------
do $$
declare t text;
begin
  foreach t in array array['mant_bloques','mant_anotaciones']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t||'_select', t);
    execute format('drop policy if exists %I on public.%I', t||'_write', t);
    execute format('create policy %I on public.%I for select to authenticated using (true)', t||'_select', t);
    execute format('create policy %I on public.%I for all to authenticated using (app_es_admin_mant()) with check (app_es_admin_mant())', t||'_write', t);
  end loop;
end $$;

-- ---------- Realtime ----------
do $$
declare t text;
begin
  foreach t in array array['mant_bloques','mant_anotaciones']
  loop
    if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ---------- Seed de bloques: NAVE 1 (cerdan_n1) ----------
-- Recarga limpia del layout de esta planta (no toca activos ni historial):
delete from public.mant_bloques where planta_id = 'cerdan_n1';
insert into public.mant_bloques (planta_id, tipo, nombre, x, y, w, h, orden) values
  ('cerdan_n1', 'muro', 'NAVE 1 (envolvente)', 1.43, 7.69, 97.14, 84.62, 0),
  ('cerdan_n1', 'muro', 'Pasillo de circulación', 1.79, 49.49, 96.43, 4.36, 1),
  ('cerdan_n1', 'estanteria', 'Oficinas / Vestuarios / Sanitarios', 4.29, 8.72, 27.86, 6.67, 2),
  ('cerdan_n1', 'maquina', 'Armado de Núcleos', 3.43, 19.23, 2.79, 24.36, 3),
  ('cerdan_n1', 'maquina', 'Núcleos', 7.36, 19.23, 3.29, 24.36, 4),
  ('cerdan_n1', 'maquina', 'Flejadora', 12.14, 19.23, 8.07, 26.92, 5),
  ('cerdan_n1', 'maquina', 'Step Lap', 3.43, 46.92, 3.43, 5.13, 6),
  ('cerdan_n1', 'maquina', 'Protección', 7.36, 46.92, 3.29, 5.13, 7),
  ('cerdan_n1', 'estanteria', 'Bobinas (stock)', 21.43, 19.23, 5.86, 37.18, 8),
  ('cerdan_n1', 'zona', 'LAMINADO', 10.71, 57.69, 8.57, 5.13, 9),
  ('cerdan_n1', 'maquina', 'Horneado', 30.0, 19.23, 8.93, 12.31, 10),
  ('cerdan_n1', 'maquina', 'Área de lavado', 39.64, 20.26, 5.36, 9.49, 11),
  ('cerdan_n1', 'maquina', 'Área de fosfatizado', 45.5, 20.26, 5.64, 9.49, 12),
  ('cerdan_n1', 'maquina', 'Cinta de pintura 1', 30.71, 38.46, 12.86, 4.36, 13),
  ('cerdan_n1', 'maquina', 'Cinta de pintura 2', 30.71, 45.64, 12.86, 4.36, 14),
  ('cerdan_n1', 'zona', 'PINTURA', 35.71, 57.69, 9.29, 5.13, 15),
  ('cerdan_n1', 'maquina', 'Box 4', 53.57, 19.23, 4.29, 25.64, 16),
  ('cerdan_n1', 'maquina', 'Box 3 (Robots)', 58.43, 19.23, 4.64, 25.64, 17),
  ('cerdan_n1', 'maquina', 'Box 2', 63.64, 19.23, 4.29, 25.64, 18),
  ('cerdan_n1', 'estanteria', 'Reservado trafos', 68.29, 19.23, 2.5, 25.64, 19),
  ('cerdan_n1', 'estanteria', 'Racks de paneles (soldadura)', 53.57, 56.41, 16.43, 6.41, 20),
  ('cerdan_n1', 'zona', 'SOLDADURA · BOXES', 57.14, 65.38, 10.71, 5.13, 21),
  ('cerdan_n1', 'maquina', 'Conf. Tapas', 72.68, 19.23, 3.07, 10.0, 22),
  ('cerdan_n1', 'maquina', 'Cortadora de tapas', 76.11, 19.23, 4.29, 10.0, 23),
  ('cerdan_n1', 'maquina', 'Soldadura automática', 80.75, 19.23, 4.29, 10.0, 24),
  ('cerdan_n1', 'maquina', 'Conf. Cubas', 85.39, 19.23, 2.57, 10.0, 25),
  ('cerdan_n1', 'maquina', 'Roladora', 88.25, 19.23, 3.07, 10.0, 26),
  ('cerdan_n1', 'maquina', 'Plegadora', 91.68, 19.23, 3.07, 10.0, 27),
  ('cerdan_n1', 'maquina', 'Guillotina', 95.0, 19.23, 2.07, 10.0, 28),
  ('cerdan_n1', 'maquina', 'Láser', 97.29, 19.23, 1.21, 30.77, 29),
  ('cerdan_n1', 'estanteria', 'Rack paneles (fila 1)', 72.68, 38.46, 21.43, 4.87, 30),
  ('cerdan_n1', 'estanteria', 'Rack paneles (fila 2)', 72.68, 44.36, 21.43, 4.87, 31),
  ('cerdan_n1', 'estanteria', 'Mesa de carga', 93.71, 38.46, 1.21, 15.38, 32),
  ('cerdan_n1', 'estanteria', 'Almacén C.', 73.21, 60.26, 5.36, 5.13, 33),
  ('cerdan_n1', 'estanteria', 'Tren de rodillos + serrucho', 79.11, 60.26, 8.39, 5.13, 34),
  ('cerdan_n1', 'estanteria', 'Almacén perfiles', 88.04, 60.26, 4.29, 5.13, 35),
  ('cerdan_n1', 'estanteria', 'Rack almacenamiento', 92.86, 59.74, 4.29, 6.15, 36),
  ('cerdan_n1', 'zona', 'CORTE Y PLEGADO', 82.14, 69.23, 10.71, 5.13, 37);

-- ---------- Posiciones de activos (pines sobre el plano) ----------
update public.mant_activos set x_pct=5.1, y_pct=49.5 where id='LAM-CORT-01' and planta_id='cerdan_n1';
update public.mant_activos set x_pct=16.2, y_pct=32.7 where id='LAM-FLEJ-01' and planta_id='cerdan_n1';
update public.mant_activos set x_pct=9.0, y_pct=31.4 where id='LAM-CORT-02' and planta_id='cerdan_n1';
update public.mant_activos set x_pct=60.7, y_pct=26.4 where id='PIN-ROBO-01' and planta_id='cerdan_n1';
update public.mant_activos set x_pct=60.7, y_pct=38.2 where id='PIN-ROBO-02' and planta_id='cerdan_n1';
update public.mant_activos set x_pct=42.3, y_pct=25.0 where id='PIN-CALE-L1' and planta_id='cerdan_n1';
update public.mant_activos set x_pct=89.8, y_pct=24.2 where id='HER-ROLA-01' and planta_id='cerdan_n1';
update public.mant_activos set x_pct=93.4, y_pct=24.2 where id='HER-PLEG-01' and planta_id='cerdan_n1';
update public.mant_activos set x_pct=96.6, y_pct=23.3 where id='HER-GUIL-01' and planta_id='cerdan_n1';
update public.mant_activos set x_pct=97.1, y_pct=31.4 where id='HER-LASE-01' and planta_id='cerdan_n1';

-- Verificacion:
-- select tipo, count(*) from mant_bloques where planta_id='cerdan_n1' group by 1;
-- select count(*) from mant_activos where planta_id='cerdan_n1' and x_pct is not null;
