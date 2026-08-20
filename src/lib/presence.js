import { sql, triggerPresenceToUsers, getFriendIds } from '@/lib/realtime';

export async function setUserOnline(userId, online) {
  if (!userId) return;
  try {
    await sql('UPDATE "User" SET "isOnline" = $2 WHERE id = $1', [userId, !!online]);
  } catch (e) {
    console.error('[presence] setUserOnline:', e.message);
  }
}

export async function broadcastPresence(userId, online) {
  if (!userId) return;
  try {
    const rows = await sql('SELECT "invisibleMode" FROM "User" WHERE id = $1 LIMIT 1', [userId]);
    const invisible = rows[0]?.invisibleMode;
    if (invisible) return;
    const friends = await getFriendIds(userId);
    if (friends.length) {
      await triggerPresenceToUsers(friends, online ? 'user_online' : 'user_offline', { userId });
    }
  } catch (e) {
    console.error('[presence] broadcastPresence:', e.message);
  }
}
