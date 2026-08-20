const TTL_MS = 6 * 60 * 60 * 1000; 

function store() {
  if (!globalThis.__randomVoiceGrants) globalThis.__randomVoiceGrants = new Map();
  return globalThis.__randomVoiceGrants;
}

export function grantRandomVoice(fileId, ...userIds) {
  if (!fileId) return;
  const s = store();
  const set = new Set(userIds.filter(Boolean));
  s.set(fileId, { users: set, expires: Date.now() + TTL_MS });
  setTimeout(() => {
    const e = s.get(fileId);
    if (e && Date.now() >= e.expires) s.delete(fileId);
  }, TTL_MS + 1000);
}

export function canAccessRandomVoice(fileId, userId) {
  const s = store();
  const e = s.get(fileId);
  if (!e) return false;
  if (Date.now() >= e.expires) { s.delete(fileId); return false; }
  return e.users.has(userId);
}
