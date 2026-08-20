import { getPool, sql } from '@/lib/db';

const PORT = process.env.PORT || 3000;
const WS_INTERNAL_URL = process.env.WS_INTERNAL_URL || `http://localhost:${PORT}`;
const WS_INTERNAL_SECRET = process.env.WS_INTERNAL_SECRET || '';

async function wsInternal(path, body) {
  if (!WS_INTERNAL_URL || !WS_INTERNAL_SECRET) {
    console.warn('[realtime-state] WS_INTERNAL_URL/SECRET ausentes — matchmaking indisponível');
    return null;
  }
  try {
    const res = await fetch(`${WS_INTERNAL_URL.replace(/\/$/, '')}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-ws-secret': WS_INTERNAL_SECRET },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    console.warn('[realtime-state] wsInternal', path, '->', e.message);
    return null;
  }
}

export async function leaveMatchmakingQueue(userId) {
  if (!userId) return;
  await wsInternal('/internal/leave_queue', { userId });
}

export async function enqueueMatchmaking(participant) {
  const data = await wsInternal('/internal/join_queue', { participant });
  if (!data) return { status: 'error' };
  if (data.status === 'matched' && data.room) return { status: 'matched', room: data.room };
  return { status: 'waiting' };
}

export async function getRandomRoom(roomId) {
  const data = await wsInternal('/internal/room_by_id', { roomId });
  return data?.room || null;
}

export async function getRandomRoomForUser(userId) {
  const data = await wsInternal('/internal/room_for_user', { userId });
  return data?.room || null;
}

export async function closeRandomRoom(roomId) {
  if (!roomId) return null;
  const data = await wsInternal('/internal/leave_room', { roomId });
  
  return data?.room || null;
}

export async function markRoomReady(roomId, userId) {
  if (!roomId || !userId) return null;
  return await wsInternal('/internal/mark_ready', { roomId, userId });
}

let _callSchemaPromise = null;
async function ensureCallSchema() {
  if (_callSchemaPromise) return _callSchemaPromise;
  _callSchemaPromise = (async () => {
    const pool = getPool();
    if (!pool) return false;
    try {
      await pool.query(`CREATE TABLE IF NOT EXISTS "ActiveCall" (
        "callRoomId" text PRIMARY KEY,
        type text NOT NULL,
        participants jsonb NOT NULL DEFAULT '[]'::jsonb,
        "hostUserId" text,
        "createdAt" timestamptz NOT NULL DEFAULT now()
      )`);
      return true;
    } catch (e) {
      console.error('[realtime-state] ensureCallSchema:', e.message);
      return false;
    }
  })();
  return _callSchemaPromise;
}

export async function getCall(callRoomId) {
  try {
    const rows = await sql('SELECT * FROM "ActiveCall" WHERE "callRoomId" = $1 LIMIT 1', [callRoomId]);
    return rows[0] || null;
  } catch {
    return null;
  }
}

export async function createCall(callRoomId, type, hostUserId, participants) {
  const ok = await ensureCallSchema();
  if (!ok) return null;
  try {
    await sql(
      `INSERT INTO "ActiveCall" ("callRoomId", type, "hostUserId", participants)
       VALUES ($1,$2,$3,$4::text[])
       ON CONFLICT ("callRoomId") DO UPDATE SET participants = $4::text[]`,
      [callRoomId, type, hostUserId, participants]
    );
    return getCall(callRoomId);
  } catch (e) {
    console.error('[realtime-state] createCall:', e.message);
    return null;
  }
}

export async function addCallParticipant(callRoomId, userId) {
  try {
    await sql(
      `UPDATE "ActiveCall" SET participants =
         (SELECT jsonb_agg(DISTINCT v) FROM jsonb_array_elements_text(participants || $2::text[]) AS t(v))
       WHERE "callRoomId" = $1`,
      [callRoomId, JSON.stringify([userId])]
    );
    return getCall(callRoomId);
  } catch (e) {
    console.error('[realtime-state] addCallParticipant:', e.message);
    return null;
  }
}

export async function removeCallParticipant(callRoomId, userId) {
  try {
    await sql(
      `UPDATE "ActiveCall" SET participants =
         (SELECT jsonb_agg(v) FROM jsonb_array_elements_text(participants) AS t(v) WHERE v <> $2)
       WHERE "callRoomId" = $1`,
      [callRoomId, userId]
    );
    return getCall(callRoomId);
  } catch (e) {
    console.error('[realtime-state] removeCallParticipant:', e.message);
    return null;
  }
}

export async function endCall(callRoomId) {
  if (!callRoomId) return;
  try {
    await sql('DELETE FROM "ActiveCall" WHERE "callRoomId" = $1', [callRoomId]);
  } catch {}
}
