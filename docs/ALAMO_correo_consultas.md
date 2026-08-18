# Correo a ALAMO — consultas sobre la propuesta de integración

**Asunto:** Integración SAP B1 – PWA · consultas previas a la confirmación

---

Estimados,

Recibimos la propuesta del 14/08 y la revisamos en detalle junto al equipo de desarrollo de la PWA. El proyecto nos interesa y valoramos que hayan dejado explícitas las decisiones pendientes en lugar de postergarlas.

Antes de confirmar necesitamos cerrar algunos puntos, porque impactan tanto en el costo total del proyecto como en nuestro cronograma interno. Los ordenamos por prioridad para facilitar la respuesta.

Adelantamos una lectura general del alcance: **la sincronización de artículos y BOM (módulo 1.1) es la que más necesitamos** —nuestro catálogo está desactualizado frente a SAP— mientras que la de colaboradores y centros de trabajo (módulo 1.3) es la que menos valor nos aporta y la que más riesgo introduce. Sobre ese punto hacemos una propuesta concreta más abajo.

---

## 1. La API de ingesta de la PWA

En los supuestos indican que la PWA debe exponer su propia API para recibir los datos del addon, y que su desarrollo queda fuera del alcance.

Lo entendemos, pero es una dependencia crítica: **hoy esa API no existe** y sin ella el addon no tiene destino contra el cual probarse.

- **1.1** ¿Tienen una definición del contrato que espera el addon —endpoints, formato del payload, método de autenticación, comportamiento ante error— para que podamos construirla en paralelo?
- **1.2** ¿Cómo impacta en el cronograma de 90 días? ¿Hay una fecha límite a partir de la cual la falta de esa API frena el proyecto?
- **1.3** ¿Consideran la opción de que el addon escriba directamente contra Supabase mediante un usuario de servicio con permisos acotados? Nos evitaría desarrollar una capa intermedia. Si lo descartan, nos interesa entender el motivo.

## 2. Alcance real de la Fase 2

El módulo 2.2 aclara que no incluye desarrollo de código productivo y que una implementación de referencia sería alcance adicional.

- **2.1** ¿Cuál sería el costo y el plazo de incluir esa prueba de concepto funcionando contra el Service Layer?
- **2.2** De no incluirla, ¿confirman que al cierre del proyecto el alta de recibos de fabricación en SAP **no queda operativa**, sino en condiciones de ser implementada por nosotros?

Necesitamos precisarlo porque internamente el alta de stock en SAP es el objetivo que justifica el proyecto.

## 3. Conectividad hacia el Service Layer

En reuniones anteriores nos indicaron que SAP está en la nube detrás de VPN, y que por eso ambos flujos debían iniciarse desde SAP. La Fase 2 plantea que sea la PWA quien llame al Service Layer.

La PWA se ejecuta en el navegador de las tablets del piso: no puede acceder a una VPN, y sus credenciales son públicas por definición, así que no puede almacenar un usuario de SAP.

- **3.1** ¿Desde dónde se realiza esa llamada? ¿Asumen un componente intermedio del lado del servidor?
- **3.2** Si es así, ¿está contemplado en el alcance o queda de nuestro lado?

## 4. Módulo 1.3 — colaboradores y centros de trabajo

Es el módulo que más nos preocupa y el que menos valor nos aporta.

Nuestra tabla de usuarios contiene información que SAP no gestiona: el vínculo con el sistema de autenticación, el rol interno de la aplicación, los sectores asignados y cuentas que no corresponden a personas sino a tablets compartidas del piso. Si la sincronización sobrescribe cualquiera de esos campos, los operarios pierden el acceso a la aplicación.

Lo mismo aplica a las máquinas: nuestro parque incluye 30 bobinadoras gestionadas como un pool intercambiable, además de boxes y líneas, con una lógica de asignación propia de la PWA.

- **4.1** ¿Qué campos exactamente escribe la sincronización sobre esas tablas? Necesitamos la lista cerrada.
- **4.2** ¿Qué ocurre con los registros que existen en la PWA y no en SAP? Confirmar que **no se dan de baja**.
- **4.3** Dado el riesgo, **proponemos excluir este módulo del alcance**. ¿Cómo impacta en el presupuesto?

## 5. Datos maestros — artículos y BOM

Este módulo es el que **más valor nos aporta y el que justifica el proyecto**. Nuestro catálogo actual está desactualizado e incompleto: en la PWA tenemos alrededor de 1.600 componentes cargados, cuando en SAP superan los 2.000. Necesitamos que este dato pase a tener su origen en SAP y deje de mantenerse a mano.

Dicho esto, hay cuatro puntos a precisar:

- **5.1 Cobertura.** Confirmar que la sincronización trae el maestro **completo** —todos los artículos y todos los niveles de BOM, no solo productos terminados y primer nivel— y que incluye una **carga inicial** además de las novedades posteriores.
- **5.2 Clasificación por sector.** El módulo menciona respetar "el sector productivo asociado a cada componente". Ese dato hoy **no está en SAP**: en la PWA lo derivamos del prefijo del código de artículo (BOBALT, BOBBAJ, CUBRUR, CUBDIS, TANDIS, TAPRUR, entre otros) para saber qué sector fabrica cada semielaborado. Nos interesa entender cuál de estos caminos recomiendan:
  - almacenarlo en SAP como campo de usuario (UDF), de modo que SAP quede como origen también de esta clasificación; o
  - que el addon lo derive del prefijo o del grupo de artículos, con una regla que definamos en el discovery.

  En cualquiera de los dos casos necesitamos, para poder completar la regla, **el listado completo de prefijos y grupos de artículos** que hoy existen en SAP.
- **5.3 Artículos sin clasificar.** Al pasar de 1.600 a más de 2.000 componentes van a aparecer códigos que nuestra regla actual no reconoce. ¿Cómo se comporta el addon en ese caso? Nuestra preferencia es que **igual los cargue**, marcados como sin sector asignado, para completarlos nosotros — nunca que los descarte en silencio.
- **5.4 Artículo interno.** Usamos un artículo llamado PROTOTIPO que no existe en SAP y que necesitamos conservar. ¿Cómo se evita que la lógica de bajas lo elimine?

## 6. Recibos de fabricación — dos condiciones técnicas

- **6.1 Idempotencia.** Nuestra aplicación trabaja **offline first**: las tablets registran el trabajo sin conexión y una cola sincroniza después, con reintentos. Si un envío se reintenta, no puede generar dos recibos. ¿El Service Layer admite una clave de idempotencia propia, o devuelve un identificador que podamos almacenar para evitar el duplicado?
- **6.2 Fecha del movimiento.** Por lo mismo, un recibo puede llegar a SAP horas después del evento real. ¿SAP acepta recibos con fecha anterior a la del envío, o se registran con la fecha de recepción?

## 7. Entorno de pruebas

Ya lo habíamos consultado y quedó sin respuesta: **¿existe un entorno de QAS o sandbox** donde probar la integración sin impactar producción? Es condición necesaria para poder testear.

## 8. Puntos comerciales

- **8.1** La propuesta tiene 15 días de vigencia. Si estas definiciones se extienden, solicitamos su revalidación sin cambios.
- **8.2** Sobre el ajuste por IPCBA del saldo: ¿pueden estimar el monto final considerando los 90 días de plazo?
- **8.3** Respecto de la aceptación automática a los 14 días sin feedback: proponemos acordar ventanas de testing por entregable, con fechas comprometidas de ambos lados.
- **8.4** En el perfil solicitado para el Líder de Proyecto del cliente se menciona "liquidación de jornales", que no corresponde a este proyecto. Entendemos que es un error de la plantilla; agradecemos confirmarlo.

---

Quedamos a la espera para avanzar con la confirmación. Si les resulta más ágil, podemos resolver estos puntos en una reunión y dejar asentadas las definiciones por escrito.

Saludos cordiales,

**Lorenzo Palmieri**
Gerente de Operaciones — INELPA Transformadores S.A.
