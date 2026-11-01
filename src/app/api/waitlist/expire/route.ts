import { NextResponse } from 'next/server';
import { waitlistService } from '@/services/waitlist.service';
import { toErrorResponse } from '@/lib/waitlist-http';

export const dynamic = 'force-dynamic';

// Pensado para un cron externo (por ejemplo cada minuto). Requiere CRON_SECRET.
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  try {
    const { expired, offers } = await waitlistService.processExpiredOffers();
    return NextResponse.json({ expired, newOffers: offers.length });
  } catch (error) {
    return toErrorResponse(error);
  }
}
