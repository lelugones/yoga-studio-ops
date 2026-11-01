# SPEC-002: Lista de Espera con Promoción Automática de Cupo

**Estado:** Aprobada por Andrea (implementación en curso)
**Depende de:** SPEC-001 (Check-in y Débito Atómico), en particular AC-3 (Walk-in con cupo completo)

## 1. Definición del Problema
Con un máximo de 12 personas por clase, los cupos liberados por cancelaciones tardías se pierden:
1. Cuando una alumna cancela, Andrea o la instructora deben avisar por WhatsApp, una por una, a quienes quedaron fuera. Si nadie responde a tiempo, el lugar queda vacío y el estudio pierde ingreso y ocupación.
2. No existe un orden objetivo para ofrecer el lugar. Esto genera reclamos de las alumnas ("yo pedí primero").
3. SPEC-001 (AC-3) ya remite a una "Lista de Espera" cuando la sala está llena, pero hoy esa lista no existe.

## 2. Diseño de la Solución
Una lista de espera por sesión con orden estricto de llegada (FIFO) y promoción semiautomática del cupo liberado.

### 2.1 Reglas de negocio
- **Capacidad:** la sesión mantiene su límite de 12 cupos (`confirmadas + presentes + ofertas vigentes`). La lista de espera admite hasta **6** personas por sesión.
- **Elegibilidad para anotarse:** la alumna debe tener un paquete activo, con `remaining_credits > 0` y `expires_at` posterior a la fecha de la sesión. No se permite anotar a alumnas sin crédito (evita ofrecer un cupo que luego SPEC-001 AC-2 bloquearía).
- **Orden:** FIFO por `created_at` en UTC. Solo la instructora/Andrea puede reordenar de forma manual, y debe quedar auditado.
- **Una sola posición por alumna:** una alumna no puede estar a la vez reservada y en lista de espera de la misma sesión, ni en la lista de dos sesiones que se superpongan en horario.
- **Sin cobro anticipado:** anotarse y ser promovida NO descuenta crédito. El débito sigue ocurriendo únicamente en el check-in (SPEC-001 AC-1).
- **Promoción:** cuando se libera un cupo (cancelación o baja manual), la primera alumna elegible de la lista pasa a `OFFERED` y se le reserva el cupo durante una **ventana de confirmación**:
  - 30 minutos si la clase empieza en más de 12 horas.
  - 10 minutos si la clase empieza en 12 horas o menos.
  - Si faltan menos de 60 minutos para la clase, no se envían ofertas: el cupo queda disponible para Walk-in (SPEC-001).
- **Expiración:** si la ventana vence sin respuesta, la oferta pasa a `EXPIRED` y se ofrece automáticamente a la siguiente de la lista. La alumna que dejó vencer conserva su lugar en el historial, pero pierde la posición.
- **Notificación (v1):** se genera un enlace `wa.me` con el mensaje prellenado. La instructora lo envía con 1 toque desde su teléfono. Sin integraciones de mensajería de pago.

### 2.2 Estados de una entrada de lista de espera
`WAITING` → `OFFERED` → `PROMOTED` (confirmó y pasó a reserva)
`OFFERED` → `EXPIRED` (venció la ventana) | `DECLINED` (rechazó)
`WAITING` / `OFFERED` → `CANCELLED` (la alumna o el estudio la retiró)

### 2.3 Cambios de datos (propuesta)
Nuevo modelo `WaitlistEntry`: `id`, `sessionId`, `studentId`, `status`, `position`, `offeredAt`, `offerExpiresAt`, `resolvedAt`, `createdAt`. Cada transición de estado se registra en un log inmutable (mismo criterio que `Attendance`).

### 2.4 Interfaz (mobile-first)
- En la vista de la sesión, un bloque "Lista de espera (n/6)" debajo de los 12 cupos.
- Botón "Ofrecer cupo" / "Enviar WhatsApp" a 1 toque cuando hay una oferta vigente, con cuenta regresiva visible.
- Cuando la sala está llena, el mensaje de SPEC-001 AC-3 incluye el botón "Anotar en Lista de Espera".

### 2.5 Fuera de alcance
- Cobros, señas o penalizaciones económicas por vencer una oferta.
- Notificaciones push o SMS con proveedor externo.
- Auto-reserva de clases recurrentes.
- Listas de espera para eventos o talleres.

## 3. Criterios de Aceptación (Verificables)

- [ ] **AC-1 (Alta en lista con orden FIFO):** Dado que una sesión tiene 12/12 cupos ocupados, cuando una alumna con crédito vigente se anota, entonces queda en `WAITING` con la siguiente posición disponible y se muestra "Posición N de la lista". Si dos alumnas se anotan, la posición se asigna por `created_at` sin duplicados.
- [ ] **AC-2 (Elegibilidad por crédito):** Dado que una alumna tiene 0 clases disponibles o paquete vencido a la fecha de la sesión, cuando intenta anotarse en la lista, entonces el sistema lo rechaza con el mensaje `Sin crédito vigente. Renová tu paquete para anotarte` y no crea ninguna entrada.
- [ ] **AC-3 (Límite de la lista):** Dado que la lista ya tiene 6 personas, cuando se intenta sumar una séptima, entonces el sistema responde `Lista de espera completa (6/6)` y no crea la entrada.
- [ ] **AC-4 (Promoción automática al liberarse un cupo):** Dado que hay 12/12 ocupados y 3 alumnas en lista, cuando una alumna reservada cancela, entonces la alumna en posición 1 pasa a `OFFERED`, se registra `offerExpiresAt` según la regla de la sección 2.1 y el contador de cupos sigue en 12/12 (cupo reservado, no libre). Ninguna otra alumna recibe oferta en simultáneo.
- [ ] **AC-5 (Confirmación sin débito):** Dado que una alumna tiene una oferta vigente, cuando la confirma antes de `offerExpiresAt`, entonces su estado pasa a `PROMOTED`, queda como reservada en la sesión y su `remaining_credits` permanece sin cambios hasta el check-in (SPEC-001 AC-1).
- [ ] **AC-6 (Expiración en cascada):** Dado que una oferta vence sin respuesta, cuando se cumple `offerExpiresAt`, entonces el estado pasa a `EXPIRED` y el cupo se ofrece a la siguiente alumna en `WAITING`, repitiéndose hasta que alguien confirme o la lista se agote. Si la lista se agota, el cupo queda libre (11/12) y habilita Walk-in.
- [ ] **AC-7 (Rechazo explícito):** Dado que una alumna con oferta vigente la rechaza, cuando presiona "No puedo", entonces su entrada pasa a `DECLINED` y la oferta se transfiere de inmediato a la siguiente, sin esperar a que venza el tiempo.
- [ ] **AC-8 (Corte por cercanía de la clase):** Dado que faltan menos de 60 minutos para el inicio, cuando se libera un cupo, entonces no se generan ofertas y el cupo queda disponible directamente para Walk-in.
- [ ] **AC-9 (Elegibilidad al momento de ofrecer):** Dado que la alumna en posición 1 ya no tiene crédito vigente al momento de la promoción, cuando se libera un cupo, entonces se omite (`CANCELLED` con motivo `SIN_CREDITO`) y se ofrece a la siguiente.
- [ ] **AC-10 (Concurrencia y no sobreventa):** Dado que dos cancelaciones y una confirmación llegan casi al mismo tiempo, cuando se procesan en paralelo, entonces la suma `reservadas + presentes + ofertas vigentes` nunca supera 12 (verificado dentro de una transacción con bloqueo sobre la sesión).
- [ ] **AC-11 (Trazabilidad):** Dado cualquier cambio de estado de una entrada, cuando ocurre, entonces se registra un evento inmutable con `session_id`, `student_id`, `estado_anterior`, `estado_nuevo`, `actor` (alumna, instructora o sistema) y `timestamp` UTC.
- [ ] **AC-12 (Operación en 1 toque):** Dado que existe una oferta pendiente, cuando la instructora abre la sesión desde su teléfono, entonces puede abrir el mensaje de WhatsApp prellenado en un solo toque, y el enlace contiene nombre de la clase, horario local (America/Argentina/Salta) y tiempo límite de respuesta.

## 4. Métricas de Éxito

Se miden con los eventos de AC-11. Línea base: se registra durante las 4 semanas previas al lanzamiento (conteo manual de Andrea).

| # | Métrica | Definición / Cálculo | Línea base | Objetivo (a 8 semanas del lanzamiento) |
|---|---------|----------------------|-----------|----------------------------------------|
| M1 | **Tasa de recuperación de cupos** (métrica principal) | Cupos liberados por cancelación que terminan ocupados (`PROMOTED` o Walk-in) / total de cupos liberados | A medir (estimada < 20 %) | >= 60 % |
| M2 | **Ocupación media de clases** | Presentes / capacidad (12) promedio por sesión | A medir | +8 puntos porcentuales sobre la línea base |
| M3 | **Tiempo de reposición de un cupo** | Mediana entre la cancelación y el estado `PROMOTED` | A medir (manual: horas) | <= 20 minutos |
| M4 | **Tasa de confirmación de ofertas** | Ofertas `PROMOTED` / ofertas emitidas | n/a | >= 50 % |
| M5 | **Tasa de expiración de ofertas** | Ofertas `EXPIRED` / ofertas emitidas | n/a | <= 30 % (si es mayor, revisar duración de ventana) |
| M6 | **Esfuerzo de la instructora por reposición** | Toques desde que se libera el cupo hasta enviar la oferta | Aprox. 6 o más pasos manuales | <= 1 toque (AC-12) |
| M7 | **Reclamos por orden injusto** | Reclamos registrados por Andrea sobre prioridad de lugares | A medir | 0 reclamos/mes |
| M8 | **Integridad de cupos** (guardarraíl) | Sesiones con más de 12 ocupados | n/a | 0 (tolerancia cero) |
| M9 | **Adopción** | Alumnas activas que usaron la lista al menos una vez / alumnas activas | n/a | >= 30 % |

### Criterio de éxito global
La feature se considera exitosa si, a las 8 semanas, se cumplen **M1 >= 60 %**, **M3 <= 20 min** y **M8 = 0**. Si M8 > 0 en cualquier momento, se detiene el despliegue y se corrige la spec antes que el código (regla SDD).

### Revisión
Andrea revisa el tablero de métricas semanalmente durante las primeras 8 semanas y decide continuar, ajustar ventanas de confirmación o descartar.

## 5. Trazabilidad de Pruebas (regla SDD)
Cada AC requiere al menos una prueba de integración o E2E en `/tests`:

| AC | Tipo de prueba | Archivo sugerido |
|----|----------------|------------------|
| AC-1, AC-2, AC-3 | Integración (servicio) | `tests/waitlist.join.test.ts` |
| AC-4, AC-5, AC-7 | Integración (servicio) | `tests/waitlist.promotion.test.ts` |
| AC-6, AC-8, AC-9 | Integración con reloj simulado | `tests/waitlist.expiration.test.ts` |
| AC-10 | Integración de concurrencia | `tests/waitlist.concurrency.test.ts` |
| AC-11 | Integración (log de auditoría) | `tests/waitlist.audit.test.ts` |
| AC-12 | E2E mobile (viewport 390x844) | `tests/e2e/waitlist.offer.spec.ts` |

## 6. Preguntas Abiertas (para Andrea)
1. ¿Las ventanas de 30 y 10 minutos son adecuadas para tus alumnas?
2. ¿Una alumna que deja vencer varias ofertas seguidas debería perder prioridad en próximas listas?
3. ¿El tope de 6 personas en lista es suficiente o hay clases (por ejemplo, las de la tarde) que requieran más?
