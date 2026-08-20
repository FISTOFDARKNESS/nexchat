import { NextResponse } from 'next/server';
import { sql, getAuthUser } from '@/lib/realtime';
import { setUserOnline, broadcastPresence } from '@/lib/presence';

export async function POST(req) {
  try {
    const auth = getAuthUser(req);
    if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    const userId = auth.id;
    const { action } = await req.json().catch(() => ({}));
    const online = action !== 'offline';
    await sql('UPDATE "User" SET "lastSeen" = now() WHERE id = $1', [userId]);
    if (online) {
      await setUserOnline(userId, true);
      await broadcastPresence(userId, true);
    } else {
      await setUserOnline(userId, false);
      await broadcastPresence(userId, false);
    }
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('[presence] POST:', e.message);
    return NextResponse.json({ error: 'Erro interno: ' + (error && error.message ? error.message : error) }, { status: 500 });
  }
}
