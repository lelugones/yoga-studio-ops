import { AttendanceStatus, Prisma, ReservationStatus, WaitlistStatus } from '@prisma/client';

export type Tx = Prisma.TransactionClient;

/**
 * Bloquea la fila de la sesión hasta el fin de la transacción.
 * Serializa cancelaciones, confirmaciones y check-ins de walk-in (SPEC-002 AC-10).
 */
export async function lockSession(tx: Tx, sessionId: string) {
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "Session" WHERE id = ${sessionId} FOR UPDATE`;
  if (rows.length === 0) throw new Error('Sesión no encontrada');
  return tx.session.findUniqueOrThrow({ where: { id: sessionId } });
}

/**
 * Cupos ocupados = alumnas distintas (reservas confirmadas + presentes) + ofertas vigentes.
 * Una oferta vigente reserva el cupo aunque todavía no esté confirmada.
 */
export async function countOccupancy(tx: Tx, sessionId: string) {
  const reservations = await tx.reservation.findMany({
    where: { sessionId, status: ReservationStatus.CONFIRMED },
    select: { studentId: true },
  });
  const attendances = await tx.attendance.findMany({
    where: { sessionId, status: AttendanceStatus.ATTENDED },
    select: { studentId: true },
  });
  const activeOffers = await tx.waitlistEntry.count({
    where: { sessionId, status: WaitlistStatus.OFFERED },
  });

  const seated = new Set([...reservations.map((r) => r.studentId), ...attendances.map((a) => a.studentId)]);
  return { seated: seated.size, activeOffers, occupied: seated.size + activeOffers };
}
