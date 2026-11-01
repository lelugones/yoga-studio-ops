import { NextResponse } from 'next/server';
import { WaitlistError, type WaitlistErrorCode } from '@/services/waitlist.service';

const STATUS_BY_CODE: Record<WaitlistErrorCode, number> = {
  SESSION_NOT_FOUND: 404,
  STUDENT_NOT_FOUND: 404,
  ENTRY_NOT_FOUND: 404,
  RESERVATION_NOT_FOUND: 404,
  NO_CREDIT: 422,
  WAITLIST_FULL: 409,
  SESSION_HAS_SPOTS: 409,
  ALREADY_RESERVED: 409,
  ALREADY_ON_WAITLIST: 409,
  OVERLAPPING_WAITLIST: 409,
  INVALID_STATE: 409,
};

export function toErrorResponse(error: unknown) {
  if (error instanceof WaitlistError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: STATUS_BY_CODE[error.code] });
  }
  console.error('[waitlist] unexpected error', error);
  return NextResponse.json({ error: 'Error interno' }, { status: 500 });
}
