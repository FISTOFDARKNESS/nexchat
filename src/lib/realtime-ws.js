const WS_INTERNAL_URL = process.env.WS_INTERNAL_URL || '';
const WS_INTERNAL_SECRET = process.env.WS_INTERNAL_SECRET || '';

export function isWsConfigured() {
  return !!(WS_INTERNAL_URL && WS_INTERNAL_SECRET);
}

export async function pushToWs(userId, event, payload) {
  if (!userId || !event || !isWsConfigured()) return false;
  try {
    const res = await fetch(`${WS_INTERNAL_URL.replace(/\/$/, '')}/internal/push`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-ws-secret': WS_INTERNAL_SECRET,
      },
      body: JSON.stringify({ userId, event, payload }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return false;
    const data = await res.json().catch(() => ({}));
    return (data.sent ?? 0) > 0;
  } catch (e) {
    console.warn('[realtime-ws] push failed:', event, '->', userId, e.message);
    return false;
  }
}

const EPHEMERAL = new Set([
  'webrtc_offer', 'webrtc_answer', 'webrtc_ice_candidate', 'friend_typing',
]);

export function isEphemeralEvent(event) {
  if (EPHEMERAL.has(event)) return true;
  if (event.startsWith('incoming_call_to_')) return true;
  if (event.startsWith('call_accepted_for_')) return true;
  if (event.startsWith('call_rejected_for_')) return true;
  return false;
}
