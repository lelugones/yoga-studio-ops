# Yoga Studio Ops 🧘‍♀️

Sistema ligero de gestión operativa para estudios de yoga pequeños, diseñado bajo el paradigma de **Spec-Driven Development (SDD)**. Resuelve el control de asistencias, cupos máximos por sesión, trazabilidad de créditos por alumna y alertas operativas sin fricción ni módulos innecesarios.

---

## 🎯 Problema que resuelve

- **Eliminación de fichas de papel:** Reemplaza las tarjetas selladas a mano por un libro de registro contable (*ledger*) inmutable de consumos por alumna.
- **Control estricto de cupo (12 personas):** Evita el sobrecupo en clases concurridas (turnos tarde) y bloquea ingresos no autorizados.
- **Check-in de 1 toque (Mobile-First):** Optimizado para que la instructora registre la asistencia desde el móvil en menos de 5 segundos.
- **Comunicación operativa ágil:** Disparo de avisos por WhatsApp ante cancelaciones o suplencias de última hora.

---

## 🏗️ Metodología: Spec-Driven Development (SDD)

El desarrollo en este repositorio sigue reglas estrictas de especificación previa:

1. **Memoria Operativa y Reglas de Agente (`PROJECT_RULES.md`):** Restricciones de arquitectura, políticas de transacción y alcance negativo (*anti-scope*).
2. **Especificaciones de Features (`/specs`):** Ninguna funcionalidad se programa sin un documento de especificación aprobado que defina contexto, diseño técnico y Criterios de Aceptación (AC) verificables.
   - Ver: [`specs/001-checkin-attendance-debit.md`](specs/001-checkin-attendance-debit.md)
   - Ver: [`specs/002-waitlist-auto-promotion.md`](specs/002-waitlist-auto-promotion.md)
3. **Guía de Estilo y Marca (`/skills/brand-guidelines`):** Reglas de diseño UI, paleta cromática Tailwind CSS y tono de comunicación para interfaces y agentes generativos.

---

## 📂 Estructura del Proyecto

```text
yoga-studio-ops/
├── specs/
│   └── 001-checkin-attendance-debit.md   # Especificación funcional y AC
├── skills/
│   └── brand-guidelines/
│       └── SKILL.md                      # Identidad visual, paleta y UI specs
├── prisma/
│   └── schema.prisma                     # Esquema relacional (Estudiantes, Paquetes, Asistencia)
├── src/
│   ├── components/                       # Componentes React con Tailwind CSS
│   │   ├── CheckInView.tsx               # Interfaz móvil para instructoras
│   │   └── EmergencyBroadcastModal.tsx   # Modal de aviso vía WhatsApp
│   └── services/
│       └── attendance.service.ts         # Transacción atómica de check-in y reversión
├── tests/
│   └── attendance.service.test.ts        # Cobertura de AC-1 a AC-4
├── PROJECT_RULES.md                      # Instrucciones y restricciones para agentes IA
└── README.md
