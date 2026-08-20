import { sql, getPool } from '@/lib/db';
import { getAuthUser } from '@/lib/session';
import { pushToWs, isWsConfigured, isEphemeralEvent } from '@/lib/realtime-ws';
import { pushToSupabase, isSupabaseRealtimeConfigured, broadcastPresenceSupabase } from '@/lib/realtime-supabase';

export const ONLINE_EXPR = `"isOnline" AND "lastSeen" > now() - interval '90 second' AND (NOT "invisibleMode")`;

export function userChannel(userId) {
  return `user:${userId}`;
}

export function isRealtimeConfigured() {
  return isWsConfigured() || isSupabaseRealtimeConfigured();
}

let _fallbackSeq = 0;
let _rtEventSchemaPromise = null;
let _lastPruneAt = 0;

export function ensureRealtimeEventSchema() {
  if (_rtEventSchemaPromise) return _rtEventSchemaPromise;
  _rtEventSchemaPromise = (async () => {
    try {
      await sql(`CREATE TABLE IF NOT EXISTS "RealtimeEvent" (
        id bigserial PRIMARY KEY,
        "userId" text NOT NULL,
        event text NOT NULL,
        payload jsonb NOT NULL DEFAULT '{}'::jsonb,
        "createdAt" timestamptz NOT NULL DEFAULT now()
      )`);
      await sql(
        `CREATE INDEX IF NOT EXISTS idx_realtime_event_user_id ON "RealtimeEvent" ("userId", id)`
      );
      return true;
    } catch (e) {
      console.error('[realtime] ensureRealtimeEventSchema:', e.message);
      return false;
    }
  })();
  return _rtEventSchemaPromise;
}

async function persistRealtimeEvent(userId, event, payload) {
  try {
    const ok = await ensureRealtimeEventSchema();
    if (!ok) return null;
    const rows = await sql(
      `INSERT INTO "RealtimeEvent" ("userId", event, payload) VALUES ($1, $2, $3)
       RETURNING id, "createdAt"`,
      [userId, event, JSON.stringify(payload ?? {})]
    );
    const now = Date.now();
    if (now - _lastPruneAt > 5 * 60 * 1000) {
      _lastPruneAt = now;
      sql(`DELETE FROM "RealtimeEvent" WHERE "createdAt" < now() - interval '24 hours'`).catch(() => {});
    }
    return rows[0]?.id ?? null;
  } catch (e) {
    console.error('[realtime] persistRealtimeEvent:', e.message);
    return null;
  }
}

export async function fetchRealtimeEvents(userId, afterId = 0, limit = 200) {
  if (!userId) return [];
  try {
    const ok = await ensureRealtimeEventSchema();
    if (!ok) return [];
    return await sql(
      `SELECT id, event, payload FROM "RealtimeEvent"
       WHERE "userId" = $1 AND id > $2 ORDER BY id ASC LIMIT $3`,
      [userId, Number(afterId) || 0, limit]
    );
  } catch (e) {
    console.error('[realtime] fetchRealtimeEvents:', e.message);
    return [];
  }
}

export async function fetchRealtimeEventsTransient(userId, afterId = 0, limit = 200) {
  if (!userId) return [];
  try {
    const ok = await ensureRealtimeEventSchema();
    if (!ok) return [];
    const pool = getPool();
    if (!pool) return [];
    const client = await pool.connect();
    try {
      const result = await client.query(
        `SELECT id, event, payload FROM "RealtimeEvent"
         WHERE "userId" = $1 AND id > $2 ORDER BY id ASC LIMIT $3`,
        [userId, Number(afterId) || 0, limit]
      );
      return result.rows;
    } finally {
      client.release(true);
    }
  } catch (e) {
    console.error('[realtime] fetchRealtimeEventsTransient:', e.message);
    return [];
  }
}

export async function purgeMatchFoundEvents(userId) {
  if (!userId) return;
  try {
    await sql(
      `DELETE FROM "RealtimeEvent" WHERE "userId" = $1 AND event = 'match_found'`,
      [userId]
    );
  } catch (e) {
    console.error('[realtime] purgeMatchFoundEvents:', e.message);
  }
}

async function deliverToUser(userId, event, enriched) {
  await pushToWs(userId, event, enriched);
}

export async function triggerToUser(userId, event, data) {
  if (!userId) return false;
  const payload = data ?? {};
  const ephemeral = isEphemeralEvent(event);

  if (ephemeral) {
    await deliverToUser(userId, event, payload);
    return true;
  }

  const id = await persistRealtimeEvent(userId, event, payload);
  const enriched = id != null ? { ...payload, eventId: id } : payload;
  await deliverToUser(userId, event, enriched);
  return true;
}

export async function triggerToUsers(userIds, event, data) {
  const ids = [...new Set((Array.isArray(userIds) ? userIds : [userIds]).filter(Boolean))];
  if (ids.length === 0) return false;
  await Promise.all(ids.map((id) => triggerToUser(id, event, data)));
  return true;
}

export async function triggerPresenceToUsers(friendIds, event, data) {
  if (!friendIds?.length) return;
  if (isSupabaseRealtimeConfigured()) {
    await broadcastPresenceSupabase(friendIds, event, data);
    return;
  }
  await triggerToUsers(friendIds, event, data);
}

export async function broadcastToAll(event, data, batchSize = 200) {
  try {
    let offset = 0;
    let total = 0;
    while (true) {
      const rows = await sql(`SELECT id FROM "User" ORDER BY id LIMIT $1 OFFSET $2`, [batchSize, offset]);
      if (rows.length === 0) break;
      await triggerToUsers(rows.map(r => r.id), event, data);
      total += rows.length;
      if (rows.length < batchSize) break;
      offset += batchSize;
    }
    return total;
  } catch (e) {
    console.error('[realtime] broadcastToAll:', e.message);
    return 0;
  }
}

export function sanitizeContent(content) {
  if (typeof content !== 'string') return '';
  try {
    const DOMPurify = require('isomorphic-dompurify');
    return DOMPurify.sanitize(content).trim();
  } catch (e) {
    return content.trim();
  }
}

export async function isBlocked(userIdA, userIdB) {
  if (!userIdA || !userIdB) return false;
  try {
    const rows = await sql(
      `SELECT 1 FROM "Block"
       WHERE ("blockerId" = $1 AND "blockedId" = $2) OR ("blockerId" = $2 AND "blockedId" = $1) LIMIT 1`,
      [userIdA, userIdB]
    );
    return rows.length > 0;
  } catch {
    return false;
  }
}

export async function areFriends(userIdA, userIdB) {
  if (!userIdA || !userIdB) return false;
  try {
    const rows = await sql(
      `SELECT 1 FROM "Friendship"
       WHERE status = 'ACCEPTED'
         AND (("userId1" = $1 AND "userId2" = $2) OR ("userId1" = $2 AND "userId2" = $1))
       LIMIT 1`,
      [userIdA, userIdB]
    );
    return rows.length > 0;
  } catch {
    return false;
  }
}

export async function isGroupMember(groupId, userId) {
  if (!groupId || !userId) return false;
  try {
    const rows = await sql(
      'SELECT 1 FROM "GroupMember" WHERE "groupId" = $1 AND "userId" = $2 LIMIT 1',
      [groupId, userId]
    );
    return rows.length > 0;
  } catch {
    return false;
  }
}

export async function getFriendIds(userId) {
  if (!userId) return [];
  try {
    const rows = await sql(
      `SELECT CASE WHEN "userId1" = $1 THEN "userId2" ELSE "userId1" END AS fid
       FROM "Friendship" WHERE status = 'ACCEPTED' AND ($1 = "userId1" OR $1 = "userId2")`,
      [userId]
    );
    return rows.map(r => r.fid);
  } catch {
    return [];
  }
}

export { sql, getAuthUser };
