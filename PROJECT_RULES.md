# YOGA STUDIO OPS - INSTRUCCIONES GENERALES DEL AGENTE

## 1. Misión y Dominio
Sistema de gestión operativa para un estudio de yoga pequeño (Andrea + 2 instructoras).
Objetivo principal: Eliminar el control de tarjetas de papel, garantizar cupos estrictos (12 personas máx.) y facilitar avisos operativos urgentes.

## 2. Límites y Restricciones de Dominio (Anti-Scope)
- PROHIBIDO: E-commerce, venta de productos físicos, pasarelas de pago externas complejas (Stripe/Mercado Pago) a menos que se especifique.
- PROHIBIDO: Plataforma de video-streaming, clases grabadas, catálogo multimedia o redes sociales.
- PRINCIPIO: "Mobile-first, 1-tap operation". La instructora debe registrar asistencia en el salón desde su teléfono en menos de 5 segundos por alumna.

## 3. Principios de Arquitectura y Persistencia
- Stack de referencia: Next.js (App Router), Tailwind CSS, TypeScript, PostgreSQL (o SQLite con Prisma/Drizzle).
- Atomicidad: Todo descuento de clase de un paquete DEBE ocurrir dentro de una transacción que verifique saldo (>0) y genere un registro inmutable en `AttendanceLedger`.
- El saldo de clases nunca es editable a ciegas: se calcula por compras menos asistencias/penalizaciones debidamente auditadas.
- Zona horaria de operaciones: Local (America/Argentina/Salta o UTC-3 por defecto). Manejo estricto de timestamps en UTC en BD.

## 4. Reglas de Spec-Driven Development (SDD)
- Ningún código se escribe sin una especificación aprobada en `/specs/*.md`.
- Si los tests o la implementación fallan por una discrepancia funcional, se actualiza la `spec` primero; el código es un subproducto verificable de la especificación.
- Convención de tests: Cada criterio de aceptación (AC) de la spec debe tener al menos una prueba de integración o E2E asociada.