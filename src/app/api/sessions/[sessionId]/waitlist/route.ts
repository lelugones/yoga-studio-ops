import { NextResponse } from 'next/server';
import { waitlistService } from '@/services/waitlist.service';
import { toErrorResponse } from '@/lib/waitlist-http';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: { sessionId: string } }) {
  try {
    return NextResponse.json(await waitlistService.getWaitlistView(params.sessionId));
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: Request, { params }: { params: { sessionId: string } }) {
  try {
    const body = (await request.json()) as { studentId?: string };
    if (!body.studentId) {
      return NextResponse.json({ error: 'studentId es obligatorio' }, { status: 400 });
    }
    const result = await waitlistService.joinWaitlist({ sessionId: params.sessionId, studentId: body.studentId });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
