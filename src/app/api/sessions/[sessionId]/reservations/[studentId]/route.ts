import { NextResponse } from 'next/server';
import { waitlistService } from '@/services/waitlist.service';
import { toErrorResponse } from '@/lib/waitlist-http';

export const dynamic = 'force-dynamic';

export async function DELETE(_request: Request, { params }: { params: { sessionId: string; studentId: string } }) {
  try {
    const result = await waitlistService.cancelReservation({
      sessionId: params.sessionId,
      studentId: params.studentId,
    });
    return NextResponse.json(result);
  } catch (error) {
    return toErrorResponse(error);
  }
}
