const crypto = require('crypto');

function getSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET is required');
  return secret;
}

function getAesKey() {
  return crypto.createHash('sha256').update(getSecret()).digest();
}

function safeEqual(a, b) {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

function verifyUserToken(token) {
  if (!token || typeof token !== 'string') return null;
  try {
    const parts = token.split('.');
    if (parts.length === 3) {
      
      const [ivB64, ctB64, tagB64] = parts;
      const key = getAesKey();
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64url'));
      decipher.setAuthTag(Buffer.from(tagB64, 'base64url'));
      const plaintext = Buffer.concat([decipher.update(Buffer.from(ctB64, 'base64url')), decipher.final()]);
      const payload = JSON.parse(plaintext.toString('utf8'));
      if (!payload.id) return null;
      if (payload.exp && Date.now() >= payload.exp * 1000) return null;
      return payload;
    }
    if (parts.length === 2) {
      
      const [data, sig] = parts;
      const expected = crypto.createHmac('sha256', getSecret()).update(data).digest('base64url');
      if (!safeEqual(sig, expected)) return null;
      const payload = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
      if (!payload.id) return null;
      if (payload.exp && Date.now() >= payload.exp * 1000) return null;
      return payload;
    }
    return null;
  } catch {
    return null;
  }
}

module.exports = { verifyUserToken };
