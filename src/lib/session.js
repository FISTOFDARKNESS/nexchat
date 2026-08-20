import crypto from 'crypto';
import { sql } from '@/lib/db';

export function getSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    
    throw new Error('JWT_SECRET não configurado — impossível assinar/verificar sessões com segurança.');
  }
  return secret;
}

export const SESSION_TOKEN_WARNING = '[NEXCHAT-SECURITY-WARNING: Do not share this token. It provides access to your account.]_';

function safeEqual(a, b) {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

function getAesKey() {
  return crypto.createHash('sha256').update(getSecret()).digest();
}

export const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; 

export function encryptUserToken(user) {
  const now = Date.now();
  const payload = {
    id: user.id,
    username: user.username,
    role: user.role,
    
    twoFactorEnabled: !!user.twoFactorEnabled,
    emailVerified: !!user.emailVerified,
    
    v: Number(user.sessionVersion) || 0,
    iat: Math.floor(now / 1000),
    exp: Math.floor((now + TOKEN_TTL_MS) / 1000)
  };
  const key = getAesKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(Buffer.from(JSON.stringify(payload), 'utf8')), cipher.final()]);
  const tag = cipher.getAuthTag();
  const b64 = (b) => b.toString('base64url');
  return `${b64(iv)}.${b64(ciphertext)}.${b64(tag)}`;
}

export function verifyUserToken(token) {
  if (!token || typeof token !== 'string') return null;
  
  if (token.startsWith(SESSION_TOKEN_WARNING)) token = token.slice(SESSION_TOKEN_WARNING.length);
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

export function getAuthUser(req) {
  try {
    
    const cookieToken = req.cookies?.get(SESSION_COOKIE_NAME)?.value;
    if (cookieToken) {
      const payload = verifyUserToken(cookieToken);
      if (payload) return payload;
    }
    
    const authHeader = req.headers?.get ? (req.headers.get('authorization') || '') : (req.headers?.authorization || '');
    if (!authHeader.startsWith('Bearer ')) return null;
    return verifyUserToken(authHeader.slice(7));
  } catch (err) {
    console.error('Erro em getAuthUser:', err.message);
    return null;
  }
}

export const SESSION_COOKIE_NAME = 'nexchat_session';
export const SESSION_COOKIE_MAX_AGE = 60 * 60 * 24 * 30; 

export function sessionCookieValue(user) {
  
  return SESSION_TOKEN_WARNING + encryptUserToken(user);
}

export function sessionCookieAttributes() {
  const secure = process.env.NODE_ENV === 'production';
  return [
    `Max-Age=${SESSION_COOKIE_MAX_AGE}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    ...(secure ? ['Secure'] : [])
  ].join('; ');
}

export function setSessionCookie(res, user) {
  res.cookies.set(SESSION_COOKIE_NAME, sessionCookieValue(user), {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_COOKIE_MAX_AGE,
    secure: process.env.NODE_ENV === 'production'
  });
  return res;
}

export function clearSessionCookie(res) {
  res.cookies.set(SESSION_COOKIE_NAME, '', {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 0
  });
  return res;
}

export const OAUTH_STATE_COOKIE = 'nexchat_oauth_state';

export function createOAuthState() {
  return crypto.randomBytes(24).toString('hex');
}

export function setOAuthStateCookie(res, state) {
  res.cookies.set(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 10 * 60, 
    secure: process.env.NODE_ENV === 'production'
  });
  return res;
}

export function clearOAuthStateCookie(res) {
  res.cookies.set(OAUTH_STATE_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 0
  });
  return res;
}

export function consumeOAuthState(state, req) {
  if (!state) return false;
  const cookie = req.cookies?.get(OAUTH_STATE_COOKIE)?.value;
  return !!cookie && cookie === state;
}

const svCache = new Map(); 
const SV_TTL_MS = 30_000;

export async function getCurrentSessionVersion(userId) {
  const now = Date.now();
  const cached = svCache.get(userId);
  if (cached && now - cached.ts < SV_TTL_MS) return cached.v;
  try {
    const rows = await sql('SELECT "sessionVersion" FROM "User" WHERE id = $1 LIMIT 1', [userId]);
    const v = rows[0] ? Number(rows[0].sessionVersion) || 0 : 0;
    svCache.set(userId, { v, ts: now });
    return v;
  } catch {
    return 0;
  }
}

export async function bumpSessionVersion(userId) {
  const rows = await sql(
    'UPDATE "User" SET "sessionVersion" = COALESCE("sessionVersion", 0) + 1, "updatedAt" = now() WHERE id = $1 RETURNING "sessionVersion"',
    [userId]
  );
  const v = rows[0] ? Number(rows[0].sessionVersion) || 0 : 1;
  svCache.set(userId, { v, ts: Date.now() });
  return v;
}

export async function sessionRevoked(req) {
  const cookieToken = req.cookies?.get(SESSION_COOKIE_NAME)?.value;
  const authHeader = req.headers?.get ? (req.headers.get('authorization') || '') : (req.headers?.authorization || '');
  const hasBearer = typeof authHeader === 'string' && authHeader.startsWith('Bearer ');
  if (!cookieToken && !hasBearer) return false;
  const token = cookieToken || authHeader.slice(7);
  const payload = verifyUserToken(token);
  if (!payload || !payload.id) return false;
  const tokenV = Number(payload.v);
  
  if (Number.isNaN(tokenV)) return false;
  const rows = await sql('SELECT "sessionVersion" FROM "User" WHERE id = $1 LIMIT 1', [payload.id]);
  const current = rows[0] ? (Number(rows[0].sessionVersion) || 0) : 0;
  return tokenV < current;
}
