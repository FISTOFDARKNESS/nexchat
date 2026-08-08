import crypto from 'crypto';

const ITERATIONS = 100000;
const KEYLEN = 64;
const DIGEST = 'sha512';

export function hashPassword(password) {
  const salt = crypto.randomBytes(32).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, ITERATIONS, KEYLEN, DIGEST).toString('hex');
  return `pbkdf2$${ITERATIONS}$${salt}$${hash}`;
}

export function verifyPassword(password, stored) {
  if (!stored || typeof stored !== 'string' || !stored.startsWith('pbkdf2$')) return false;
  const parts = stored.split('$');
  if (parts.length !== 4) return false;
  const [, iterations, salt, expectedHash] = parts;
  try {
    const testHash = crypto.pbkdf2Sync(password, salt, parseInt(iterations, 10), KEYLEN, DIGEST).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(expectedHash), Buffer.from(testHash));
  } catch {
    return false;
  }
}
