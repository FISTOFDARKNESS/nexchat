import { NextResponse } from 'next/server';
import { getAuthUser, fetchRealtimeEvents } from '@/lib/realtime';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  const auth = getAuthUser(req);
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  const after = parseInt(String(req.nextUrl.searchParams.get('after') || '0'), 10) || 0;
  const events = await fetchRealtimeEvents(auth.id, after, 100);

  const filtered = events.filter((e) => e.event !== 'match_found');

  return NextResponse.json({ events: filtered });
}
