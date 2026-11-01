import { NextResponse } from 'next/server';
import { WaitlistActor } from '@prisma/client';
import { waitlistService } from '@/services/waitlist.service';
import { toErrorResponse } from '@/lib/waitlist-http';

export const dynamic = 'force-dynamic';

type Action = 'accept' | 'decline' | 'cancel';

export async function PATCH(request: Request, { params }: { params: { entryId: string } }) {
  try {
    const body = (await request.json()) as { action?: Action; actor?: 'STUDENT' | 'INSTRUCTOR' };
    const actor = body.actor === 'INSTRUCTOR' ? WaitlistActor.INSTRUCTOR : WaitlistActor.STUDENT;

    if (body.action === 'accept' || body.action === 'decline') {
      const result = await waitlistService.respondToOffer({
        entryId: params.entryId,
        accept: body.action === 'accept',
        actor,
      });
      if (result.outcome === 'EXPIRED') {
        return NextResponse.json({ error: 'La oferta venció', ...result }, { status: 410 });
      }
      return NextResponse.json(result);
    }

    if (body.action === 'cancel') {
      return NextResponse.json(await waitlistService.cancelEntry({ entryId: params.entryId, actor }));
    }

    return NextResponse.json({ error: 'action debe ser accept, decline o cancel' }, { status: 400 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
