# SPEC-001: Check-in de Asistencia y Débito Atómico de Crédito

## 1. Definición del Problema
Actualmente, las alumnas asisten a clase con fichas de papel selladas a mano. Esto genera dos problemas graves:
1. Las alumnas extravían las fichas y disputan cuántas clases les quedan sin comprobante digital.
2. La instructora pierde tiempo al inicio de la sesión contabilizando cupos y verificando si quien llegó tiene crédito activo para ingresar.

## 2. Diseño de la Solución
Un módulo de lista de asistencia para la sesión en curso donde la instructora visualiza los inscritos (máximo 12) y realiza el check-in con un solo toque:
- El sistema valida en tiempo real que el paquete de la alumna tenga clases disponibles (`remaining_credits > 0`) y no esté vencido (`expires_at >= today`).
- Al presionar "Presente", se genera un registro inmutable de asistencia con timestamp, instructora responsable y saldo restante resultante.
- Si el saldo resultante es menor o igual a 2, la interfaz destaca una alerta visual ("Últimas clases / Renovar").
- En caso de llegar una alumna sin reserva pero con cupo libre en sala (< 12), permite "Check-in exprés (Walk-in)".

## 3. Criterios de Aceptación (Verificables)

- [ ] **AC-1 (Débito Atómico y Trazabilidad):** Dado que una alumna reservada con saldo de 3 clases se presenta, cuando la instructora presiona "Marcar Asistencia", el sistema debe decrementar su saldo a 2, cambiar su estado en la sesión a `ATTENDED` y registrar un evento en el log de auditoría con `session_id`, `student_id`, `instructor_id` y `timestamp`.
- [ ] **AC-2 (Bloqueo por Saldo Agotado o Vencido):** Dado que una alumna tiene 0 clases disponibles o su paquete venció, cuando la instructora intenta registrar su asistencia, la acción debe bloquearse mostrando un estado visual claro (`CRÉDITO AGOTADO` o `VENCIDO`) impidiendo el registro sin confirmación de pago/renovación previa.
- [ ] **AC-3 (Restricción Estricta de Cupo en Walk-in):** Dado que una clase tiene 12 personas registradas entre confirmadas y presentes, cuando se intenta realizar un "Walk-in" de una alumna en puerta, el sistema debe denegar el ingreso con el mensaje `Cupo completo (12/12). Solo disponible registro en Lista de Espera`.
- [ ] **AC-4 (Deshacer Operativo / Undo Inmediato):** Si la instructora marca por error a una alumna, dispone de una ventana de 60 segundos para pulsar "Deshacer", lo que restaura el crédito al paquete y marca el registro de auditoría como `REVERTED`.