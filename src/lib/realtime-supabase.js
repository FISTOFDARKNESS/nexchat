import { createClient } from '@supabase/supabase-js';

let _serviceClient = null;

function getServiceClient() {
  if (_serviceClient) return _serviceClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  _serviceClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _serviceClient;
}

export function isSupabaseRealtimeConfigured() {
  return !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export function userRealtimeChannel(userId) {
  return `user:${userId}`;
}

export async function pushToSupabase(userId, event, payload) {
  if (!userId || !event) return false;
  const sb = getServiceClient();
  if (!sb) return false;
  try {
    const channel = sb.channel(userRealtimeChannel(userId));
    await channel.subscribe();
    await channel.send({
      type: 'broadcast',
      event: 'rt',
      payload: { event, payload: payload ?? {} },
    });
    await sb.removeChannel(channel);
    return true;
  } catch (e) {
    console.warn('[realtime-supabase] push failed:', event, '->', userId, e.message);
    return false;
  }
}

export async function broadcastPresenceSupabase(friendIds, event, data) {
  if (!friendIds?.length) return;
  await Promise.all(friendIds.map((friendId) => pushToSupabase(friendId, event, data)));
}
