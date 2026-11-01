export const SESSION_TIME_ZONE = 'America/Argentina/Salta';
export const MAX_WAITLIST_SIZE = 6;

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

const OFFER_CUTOFF_MINUTES = 60;
const LONG_WINDOW_THRESHOLD_HOURS = 12;
const LONG_WINDOW_MINUTES = 30;
const SHORT_WINDOW_MINUTES = 10;

/**
 * Ventana de confirmación de una oferta (SPEC-002 sección 2.1).
 * Devuelve null cuando faltan menos de 60 minutos: no se envían ofertas (AC-8).
 */
export function getOfferWindowMinutes(startsAt: Date, now: Date): number | null {
  const msToStart = startsAt.getTime() - now.getTime();
  if (msToStart < OFFER_CUTOFF_MINUTES * MINUTE_MS) return null;
  return msToStart > LONG_WINDOW_THRESHOLD_HOURS * HOUR_MS ? LONG_WINDOW_MINUTES : SHORT_WINDOW_MINUTES;
}

export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * MINUTE_MS);
}

export function rangesOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart.getTime() < bEnd.getTime() && bStart.getTime() < aEnd.getTime();
}

export function formatLocalTime(date: Date): string {
  return new Intl.DateTimeFormat('es-AR', {
    timeZone: SESSION_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

export function formatLocalDateTime(date: Date): string {
  const day = new Intl.DateTimeFormat('es-AR', {
    timeZone: SESSION_TIME_ZONE,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(date);
  return `${day}, ${formatLocalTime(date)} h`;
}

/** Enlace wa.me con el mensaje prellenado (AC-12). */
export function buildOfferWhatsappUrl(params: {
  phone: string;
  studentName: string;
  className: string;
  startsAt: Date;
  offerExpiresAt: Date;
}): string {
  const firstName = params.studentName.trim().split(/\s+/)[0] ?? params.studentName;
  const message =
    `Hola ${firstName}! Se liberó un lugar en ${params.className} ` +
    `(${formatLocalDateTime(params.startsAt)}). ` +
    `Tenés tiempo hasta las ${formatLocalTime(params.offerExpiresAt)} h para confirmarlo. ` +
    `Respondé "SÍ" para reservarlo o "NO" para liberarlo.`;
  const digits = params.phone.replace(/\D/g, '');
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}
