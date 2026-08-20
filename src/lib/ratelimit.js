const buckets = new Map(); 

const CLEANUP_MAX_AGE_MS = 24 * 60 * 60 * 1000;
setInterval(() => {
  const now = Date.now();
  for (const [key, hits] of buckets) {
    while (hits.length && now - hits[0] > CLEANUP_MAX_AGE_MS) hits.shift();
    if (hits.length === 0) buckets.delete(key);
  }
}, 60_000);

export function rateLimit(key, max = 20, windowMs = 60_000) {
  const now = Date.now();
  const hits = buckets.get(key) || [];
  
  while (hits.length && now - hits[0] > windowMs) hits.shift();

  if (hits.length >= max) {
    const oldest = hits[0];
    const retryAfter = Math.ceil((oldest + windowMs - now) / 1000);
    buckets.set(key, hits);
    return { ok: false, retryAfter: Math.max(1, retryAfter) };
  }

  hits.push(now);
  buckets.set(key, hits);
  return { ok: true };
}
