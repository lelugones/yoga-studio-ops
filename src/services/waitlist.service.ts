import {
  AttendanceStatus,
  PrismaClient,
  ReservationSource,
  ReservationStatus,
  WaitlistActor,
  WaitlistStatus,
} from '@prisma/client';
import { prisma as defaultPrisma } from '@/lib/prisma';
import { countOccupancy, lockSession, type Tx } from './session-occupancy';
import {
  MAX_WAITLIST_SIZE,
  addMinutes,
  buildOfferWhatsappUrl,
  getOfferWindowMinutes,
  rangesOverlap,
} from './waitlist.policy';

export type WaitlistErrorCode =
  | 'SESSION_NOT_FOUND'
  | 'STUDENT_NOT_FOUND'
  | 'NO_CREDIT'
  | 'WAITLIST_FULL'
  | 'SESSION_HAS_SPOTS'
  | 'ALREADY_RESERVED'
  | 'ALREADY_ON_WAITLIST'
  | 'OVERLAPPING_WAITLIST'
  | 'ENTRY_NOT_FOUND'
  | 'RESERVATION_NOT_FOUND'
  | 'INVALID_STATE';

export class WaitlistError extends Error {
  constructor(
    public readonly code: WaitlistErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'WaitlistError';
  }
}

const ACTIVE_STATUSES = [WaitlistStatus.WAITING, WaitlistStatus.OFFERED];
const TERMINAL_STATUSES: WaitlistStatus[] = [
  WaitlistStatus.PROMOTED,
  WaitlistStatus.EXPIRED,
  WaitlistStatus.DECLINED,
  WaitlistStatus.CANCELLED,
];

type EntryRef = { id: string; sessionId: string; studentId: string; status: WaitlistStatus };

export type OfferResult = {
  entryId: string;
  studentId: string;
  fullName: string;
  offerExpiresAt: Date;
  whatsappUrl: string;
};

async function findEligiblePackage(tx: Tx, studentId: string, sessionStartsAt: Date) {
  return tx.package.findFirst({
    where: {
      studentId,
      isActive: true,
      remainingCredits: { gt: 0 },
      expiresAt: { gt: sessionStartsAt },
    },
  });
}

/** Cambia el estado de una entrada y registra el evento inmutable en la misma transacción (AC-11). */
async function transition(
  tx: Tx,
  entry: EntryRef,
  to: WaitlistStatus,
  actor: WaitlistActor,
  now: Date,
  options: { reason?: string; offeredAt?: Date; offerExpiresAt?: Date } = {},
) {
  const updated = await tx.waitlistEntry.update({
    where: { id: entry.id },
    data: {
      status: to,
      resolutionReason: options.reason,
      offeredAt: options.offeredAt,
      offerExpiresAt: options.offerExpiresAt,
      resolvedAt: TERMINAL_STATUSES.includes(to) ? now : undefined,
    },
  });
  await tx.waitlistEvent.create({
    data: {
      entryId: entry.id,
      sessionId: entry.sessionId,
      studentId: entry.studentId,
      fromStatus: entry.status,
      toStatus: to,
      actor,
      reason: options.reason,
      createdAt: now,
    },
  });
  return updated;
}

/**
 * Ofrece los cupos libres a las primeras alumnas elegibles de la lista (AC-4, AC-6, AC-8, AC-9).
 * Debe llamarse con la sesión ya bloqueada.
 */
async function promoteNext(
  tx: Tx,
  session: { id: string; name: string; startsAt: Date; capacity: number },
  now: Date,
): Promise<OfferResult[]> {
  const windowMinutes = getOfferWindowMinutes(session.startsAt, now);
  if (windowMinutes === null) return [];

  const { occupied } = await countOccupancy(tx, session.id);
  let freeSeats = session.capacity - occupied;
  const offers: OfferResult[] = [];

  while (freeSeats > 0) {
    const next = await tx.waitlistEntry.findFirst({
      where: { sessionId: session.id, status: WaitlistStatus.WAITING },
      orderBy: { position: 'asc' },
      include: { student: true },
    });
    if (!next) break;

    const eligiblePackage = await findEligiblePackage(tx, next.studentId, session.startsAt);
    if (!eligiblePackage) {
      await transition(tx, next, WaitlistStatus.CANCELLED, WaitlistActor.SYSTEM, now, { reason: 'SIN_CREDITO' });
      continue;
    }

    const offerExpiresAt = addMinutes(now, windowMinutes);
    await transition(tx, next, WaitlistStatus.OFFERED, WaitlistActor.SYSTEM, now, {
      offeredAt: now,
      offerExpiresAt,
    });
    offers.push({
      entryId: next.id,
      studentId: next.studentId,
      fullName: next.student.fullName,
      offerExpiresAt,
      whatsappUrl: buildOfferWhatsappUrl({
        phone: next.student.phone,
        studentName: next.student.fullName,
        className: session.name,
        startsAt: session.startsAt,
        offerExpiresAt,
      }),
    });
    freeSeats -= 1;
  }

  return offers;
}

async function lockSessionOrFail(tx: Tx, sessionId: string) {
  try {
    return await lockSession(tx, sessionId);
  } catch {
    throw new WaitlistError('SESSION_NOT_FOUND', 'Sesión no encontrada');
  }
}

export class WaitlistService {
  constructor(private readonly db: PrismaClient = defaultPrisma) {}

  /** AC-1, AC-2, AC-3 */
  async joinWaitlist(params: {
    sessionId: string;
    studentId: string;
    actor?: WaitlistActor;
    now?: Date;
  }) {
    const { sessionId, studentId, actor = WaitlistActor.STUDENT, now = new Date() } = params;

    return this.db.$transaction(async (tx) => {
      const session = await lockSessionOrFail(tx, sessionId);

      const student = await tx.student.findUnique({ where: { id: studentId } });
      if (!student) throw new WaitlistError('STUDENT_NOT_FOUND', 'Alumna no encontrada');

      const reserved = await tx.reservation.findFirst({
        where: { sessionId, studentId, status: ReservationStatus.CONFIRMED },
      });
      const attended = await tx.attendance.findFirst({
        where: { sessionId, studentId, status: AttendanceStatus.ATTENDED },
      });
      if (reserved || attended) {
        throw new WaitlistError('ALREADY_RESERVED', 'La alumna ya tiene lugar en esta clase');
      }

      const existing = await tx.waitlistEntry.findFirst({
        where: { sessionId, studentId, status: { in: ACTIVE_STATUSES } },
      });
      if (existing) throw new WaitlistError('ALREADY_ON_WAITLIST', 'La alumna ya está en la lista de espera');

      const sessionEnd = addMinutes(session.startsAt, session.durationMinutes);
      const otherEntries = await tx.waitlistEntry.findMany({
        where: { studentId, sessionId: { not: sessionId }, status: { in: ACTIVE_STATUSES } },
        include: { session: true },
      });
      const overlapping = otherEntries.some((entry) =>
        rangesOverlap(
          session.startsAt,
          sessionEnd,
          entry.session.startsAt,
          addMinutes(entry.session.startsAt, entry.session.durationMinutes),
        ),
      );
      if (overlapping) {
        throw new WaitlistError('OVERLAPPING_WAITLIST', 'La alumna ya está en la lista de otra clase en el mismo horario');
      }

      const eligiblePackage = await findEligiblePackage(tx, studentId, session.startsAt);
      if (!eligiblePackage) {
        throw new WaitlistError('NO_CREDIT', 'Sin crédito vigente. Renová tu paquete para anotarte');
      }

      const { occupied } = await countOccupancy(tx, sessionId);
      if (occupied < session.capacity) {
        throw new WaitlistError('SESSION_HAS_SPOTS', 'La clase tiene cupo disponible: reservá directamente');
      }

      const activeCount = await tx.waitlistEntry.count({
        where: { sessionId, status: { in: ACTIVE_STATUSES } },
      });
      if (activeCount >= MAX_WAITLIST_SIZE) {
        throw new WaitlistError('WAITLIST_FULL', `Lista de espera completa (${MAX_WAITLIST_SIZE}/${MAX_WAITLIST_SIZE})`);
      }

      const last = await tx.waitlistEntry.aggregate({ where: { sessionId }, _max: { position: true } });
      const entry = await tx.waitlistEntry.create({
        data: {
          sessionId,
          studentId,
          position: (last._max.position ?? 0) + 1,
          createdAt: now,
        },
      });
      await tx.waitlistEvent.create({
        data: {
          entryId: entry.id,
          sessionId,
          studentId,
          fromStatus: null,
          toStatus: WaitlistStatus.WAITING,
          actor,
          createdAt: now,
        },
      });

      return { entry, queuePosition: activeCount + 1 };
    });
  }

  /** Libera el cupo de una reserva y ofrece el lugar a la primera de la lista (AC-4, AC-8). */
  async cancelReservation(params: {
    sessionId: string;
    studentId: string;
    now?: Date;
  }) {
    const { sessionId, studentId, now = new Date() } = params;

    return this.db.$transaction(async (tx) => {
      const session = await lockSessionOrFail(tx, sessionId);

      const reservation = await tx.reservation.findFirst({
        where: { sessionId, studentId, status: ReservationStatus.CONFIRMED },
      });
      if (!reservation) throw new WaitlistError('RESERVATION_NOT_FOUND', 'Reserva no encontrada');

      await tx.reservation.update({
        where: { id: reservation.id },
        data: { status: ReservationStatus.CANCELLED, cancelledAt: now },
      });

      const offers = await promoteNext(tx, session, now);
      return { offers };
    });
  }

  /**
   * Confirmar (AC-5) o rechazar (AC-7) una oferta.
   * Si la oferta ya venció, se la marca como EXPIRED en lugar de lanzar error,
   * para que la transición quede persistida.
   */
  async respondToOffer(params: {
    entryId: string;
    accept: boolean;
    actor?: WaitlistActor;
    now?: Date;
  }) {
    const { entryId, accept, actor = WaitlistActor.STUDENT, now = new Date() } = params;

    return this.db.$transaction(async (tx) => {
      const preview = await tx.waitlistEntry.findUnique({ where: { id: entryId } });
      if (!preview) throw new WaitlistError('ENTRY_NOT_FOUND', 'Entrada de lista de espera no encontrada');

      const session = await lockSessionOrFail(tx, preview.sessionId);
      const entry = await tx.waitlistEntry.findUniqueOrThrow({ where: { id: entryId } });
      if (entry.status !== WaitlistStatus.OFFERED) {
        throw new WaitlistError('INVALID_STATE', 'La oferta ya no está vigente');
      }

      if (entry.offerExpiresAt && entry.offerExpiresAt.getTime() <= now.getTime()) {
        await transition(tx, entry, WaitlistStatus.EXPIRED, WaitlistActor.SYSTEM, now);
        const offers = await promoteNext(tx, session, now);
        return { outcome: 'EXPIRED' as const, offers };
      }

      if (accept) {
        await transition(tx, entry, WaitlistStatus.PROMOTED, actor, now);
        await tx.reservation.create({
          data: {
            sessionId: entry.sessionId,
            studentId: entry.studentId,
            source: ReservationSource.WAITLIST,
            createdAt: now,
          },
        });
        return { outcome: 'PROMOTED' as const, offers: [] as OfferResult[] };
      }

      await transition(tx, entry, WaitlistStatus.DECLINED, actor, now);
      const offers = await promoteNext(tx, session, now);
      return { outcome: 'DECLINED' as const, offers };
    });
  }

  /** La alumna o el estudio retiran una entrada. Si tenía una oferta, el cupo pasa a la siguiente. */
  async cancelEntry(params: { entryId: string; actor: WaitlistActor; now?: Date }) {
    const { entryId, actor, now = new Date() } = params;

    return this.db.$transaction(async (tx) => {
      const preview = await tx.waitlistEntry.findUnique({ where: { id: entryId } });
      if (!preview) throw new WaitlistError('ENTRY_NOT_FOUND', 'Entrada de lista de espera no encontrada');

      const session = await lockSessionOrFail(tx, preview.sessionId);
      const entry = await tx.waitlistEntry.findUniqueOrThrow({ where: { id: entryId } });
      if (!ACTIVE_STATUSES.includes(entry.status as 'WAITING' | 'OFFERED')) {
        throw new WaitlistError('INVALID_STATE', 'La entrada ya fue resuelta');
      }

      const hadOffer = entry.status === WaitlistStatus.OFFERED;
      await transition(tx, entry, WaitlistStatus.CANCELLED, actor, now, { reason: 'RETIRADA' });
      const offers = hadOffer ? await promoteNext(tx, session, now) : [];
      return { offers };
    });
  }

  /** Vence las ofertas cuya ventana terminó y las pasa en cascada a la siguiente (AC-6). */
  async processExpiredOffers(now: Date = new Date(), sessionId?: string) {
    const due = await this.db.waitlistEntry.findMany({
      where: {
        status: WaitlistStatus.OFFERED,
        offerExpiresAt: { lte: now },
        ...(sessionId ? { sessionId } : {}),
      },
      select: { sessionId: true },
      distinct: ['sessionId'],
    });

    let expired = 0;
    const offers: OfferResult[] = [];

    for (const { sessionId: dueSessionId } of due) {
      await this.db.$transaction(async (tx) => {
        const session = await lockSessionOrFail(tx, dueSessionId);
        const entries = await tx.waitlistEntry.findMany({
          where: { sessionId: dueSessionId, status: WaitlistStatus.OFFERED, offerExpiresAt: { lte: now } },
          orderBy: { offerExpiresAt: 'asc' },
        });
        for (const entry of entries) {
          await transition(tx, entry, WaitlistStatus.EXPIRED, WaitlistActor.SYSTEM, now);
          expired += 1;
        }
        if (entries.length > 0) offers.push(...(await promoteNext(tx, session, now)));
      });
    }

    return { expired, offers };
  }

  /** Vista de la sesión para la instructora: cupos, lista y enlaces de WhatsApp (AC-12). */
  async getWaitlistView(sessionId: string, now: Date = new Date()) {
    await this.processExpiredOffers(now, sessionId);

    const session = await this.db.session.findUnique({ where: { id: sessionId } });
    if (!session) throw new WaitlistError('SESSION_NOT_FOUND', 'Sesión no encontrada');

    const entries = await this.db.waitlistEntry.findMany({
      where: { sessionId, status: { in: ACTIVE_STATUSES } },
      orderBy: { position: 'asc' },
      include: { student: true },
    });

    const occupancy = await this.db.$transaction((tx) => countOccupancy(tx, sessionId));

    return {
      session: { id: session.id, name: session.name, startsAt: session.startsAt, capacity: session.capacity },
      occupied: occupancy.occupied,
      maxWaitlist: MAX_WAITLIST_SIZE,
      entries: entries.map((entry, index) => ({
        id: entry.id,
        studentId: entry.studentId,
        fullName: entry.student.fullName,
        phone: entry.student.phone,
        status: entry.status as 'WAITING' | 'OFFERED',
        queuePosition: index + 1,
        offerExpiresAt: entry.offerExpiresAt,
        whatsappUrl:
          entry.status === WaitlistStatus.OFFERED && entry.offerExpiresAt
            ? buildOfferWhatsappUrl({
                phone: entry.student.phone,
                studentName: entry.student.fullName,
                className: session.name,
                startsAt: session.startsAt,
                offerExpiresAt: entry.offerExpiresAt,
              })
            : null,
      })),
    };
  }
}

export const waitlistService = new WaitlistService();
