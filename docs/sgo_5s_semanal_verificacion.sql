-- Prueba con rollback. No deja controles ni informes ficticios.
begin;
do $$ declare inicio date:=date_trunc('week',date '2099-01-05')::date; cantidad integer; uid uuid; clave text; n integer; persona text; ar text;
begin
 cantidad:=sgo_internal.generar_semana_5s(inicio); if cantidad<>11 then raise exception 'No generó 11'; end if;
 if sgo_internal.generar_semana_5s(inicio)<>0 then raise exception 'Duplicados'; end if;
 foreach persona in array array['lara','nicolas.sgo'] loop
 ar:=case when persona='lara' then 'bobinado_rural' else 'logistica_despacho' end;
 clave:='sgo-5s-semana-'||ar||'-'||inicio;
 select auth_id into uid from public.usuarios where usuario=persona and activo; if uid is null then raise exception 'Sin cuenta %',persona; end if;
 perform set_config('request.jwt.claim.sub',uid::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',uid,'role','authenticated')::text,true);
 set local role authenticated;
 update public.sgo_controles_programados set activo=false where id=clave; get diagnostics n=row_count;
 if n<>0 then raise exception 'Auditor puede retirar'; end if;
 insert into public.sgo_control_ejecuciones(id,control_id,fecha_programada,ejecutado_en,ejecutado_por,resultado,detalle,auditoria_campo)
 values ('qa-5s-'||persona,clave,inicio,(inicio+3)::timestamp at time zone 'America/Argentina/Buenos_Aires',persona,'conforme','Prueba transaccional',
 jsonb_build_object('tipo','5s','areaId',ar,'finalizadaEn',(inicio+3)::text,'auditor',persona,'usuarioAcceso',persona,'respuestas','[]'::jsonb));
 if (select activo from public.sgo_controles_programados where id=clave) then raise exception 'No completó'; end if;
 if (select fecha_programada from public.sgo_control_ejecuciones where id='qa-5s-'||persona)<>inicio+4 then raise exception 'No conservó viernes'; end if;
 reset role;
 end loop;
 if sgo_internal.generar_semana_5s(inicio+7)<>11 then raise exception 'La semana siguiente no se genera'; end if;
end $$;
rollback;
select 'OK: 11 por semana, sin duplicados; Lara y Nicolás completan pero no retiran; semana siguiente independiente. Prueba revertida.' as resultado;
