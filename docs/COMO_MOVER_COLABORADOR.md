# Cómo mover un colaborador de sector (paso a paso)

Los datos reales de la planta viven en **Supabase**, no en el código. Para cambiar
a alguien de sector NO hace falta tocar la app ni hacer `git push`: se corre un SQL
y la app se actualiza sola en todas las tablets (por Realtime/sync).

## Pasos

1. Entrá a **Supabase** → tu proyecto → menú izquierdo **SQL Editor** → **New query**.
2. Pegá este bloque, cambiando los 3 valores en MAYÚSCULAS:
   - `LOGIN` = usuario del colaborador (formato `apellido.nombre`, ej. `belis.bianca`).
   - `GRUPO` = grupo de nómina destino (ver tabla abajo).
   - Los `sector_id` destino (ver tabla abajo).

```sql
-- 1) Cambiar el grupo de nómina
update usuarios set grupo_nomina = 'GRUPO' where usuario = 'LOGIN';

-- 2) Reemplazar sus sectores (borra los viejos y carga los nuevos)
delete from usuario_sectores
  where usuario_id = (select id from usuarios where usuario = 'LOGIN');

insert into usuario_sectores (usuario_id, sector_id)
select u.id, s.sector_id
from usuarios u
join (values ('LOGIN','SECTOR_1'), ('LOGIN','SECTOR_2'))
  as s(usuario, sector_id) on s.usuario = u.usuario
on conflict do nothing;

-- 3) Verificar
select u.usuario, u.grupo_nomina, array_agg(us.sector_id order by us.sector_id)
from usuarios u left join usuario_sectores us on us.usuario_id = u.id
where u.usuario = 'LOGIN' group by u.usuario, u.grupo_nomina;
```

3. Tocá **Run**. Al final la consulta de verificación te muestra el grupo y los sectores nuevos.
4. Listo. No hay que reiniciar nada; las tablets lo reflejan solo.

## Tabla de grupos → sectores

| grupo_nomina    | sector_id a cargar                     |
|-----------------|----------------------------------------|
| bobinado_dist   | bob_dist_at, bob_dist_bt               |
| bobinado_rural  | bob_rural_at, bob_rural_bt             |
| montaje_dist    | montaje_pa_dist, montaje_po_dist       |
| montaje_rural   | montaje_pa_rural, montaje_po_rural     |
| herreria        | corte_conformado, soldadura_dist, soldadura_rural, lavado_pintura |

> Regla: cada bobinador ve AT+BT de su línea; cada montajista ve PA+PO de su línea.
> El login es `apellido.nombre` sin acentos (ej. `García Ríos` → `garcia.rios`).

## Ejemplo hecho: Belis Bianca Nair (rural → distribución)

Ver `docs/supabase_mover_belis_v1.18.sql` (LOGIN=`belis.bianca`, GRUPO=`bobinado_dist`,
sectores `bob_dist_at` + `bob_dist_bt`).
