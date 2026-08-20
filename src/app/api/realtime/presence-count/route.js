import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/session';
import { sql } from '@/lib/db';

const WS_INTERNAL_URL = process.env.WS_INTERNAL_URL || '';
const WS_INTERNAL_SECRET = process.env.WS_INTERNAL_SECRET || '';

let cache = { ts: 0, value: 0, debug: null };
const CACHE_MS = 10_000;

async function liveOnlineCount() {
  if (!WS_INTERNAL_URL) return { value: null, error: 'WS_INTERNAL_URL ausente' };
  try {
    const res = await fetch(`${WS_INTERNAL_URL.replace(/\/$/, '')}/health`, {
      
      headers: WS_INTERNAL_SECRET ? { 'x-ws-secret': WS_INTERNAL_SECRET } : {},
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return { value: null, error: `health status ${res.status}` };
    const stats = await res.json();
    return { value: Number(stats.activeUsers) || 0, error: null, stats };
  } catch (e) {
    return { value: null, error: e.message };
  }
}

export async function GET(req) {
  try {
    const auth = getAuthUser(req);
    if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

    const now = Date.now();
    if (now - cache.ts < CACHE_MS) {
      return NextResponse.json({ online: cache.value, debug: cache.debug, cached: true });
    }

    const live = await liveOnlineCount();
    if (typeof live.value === 'number') {
      
      const others = Math.max(0, live.value - 1);
      const debug = {
        source: 'live-ws',
        liveActiveUsers: live.value,
        connections: live.stats?.connections,
        queue: live.stats?.queue,
        rooms: live.stats?.rooms,
        wsInternalUrl: WS_INTERNAL_URL,
      };
      cache = { ts: now, value: others, debug };
      return NextResponse.json({ online: others, debug });
    }

    const rows = await sql('SELECT COUNT(*)::int AS n FROM "User" WHERE "isOnline" = true');
    const n = Math.max(0, (rows[0]?.n || 0) - 1);
    const debug = {
      source: 'db-fallback',
      reason: live.error,
      dbOnline: rows[0]?.n || 0,
    };
    cache = { ts: now, value: n, debug };
    return NextResponse.json({ online: n, debug });
  } catch (e) {
    console.error('Erro em /api/realtime/presence-count:', e.message);
    return NextResponse.json({ online: 0, debug: { source: 'error', error: e.message } });
  }
}
