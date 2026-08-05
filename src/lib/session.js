import crypto from 'crypto';

function getSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    console.warn('JWT_SECRET não configurado; usando segredo de desenvolvimento.');
  }
  return secret || 'nexchat-dev-secret-change-me';
}

function safeEqual(a, b) {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

export function signUserToken(user) {
  const payload = {
    id: user.id,
    username: user.username,
    role: user.role
  };
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', getSecret()).update(data).digest('base64url');
  return `${data}.${sig}`;
}

export function verifyUserToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [data, sig] = parts;
  const expected = crypto.createHmac('sha256', getSecret()).update(data).digest('base64url');
  if (!safeEqual(sig, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
    if (!payload.id) return null;
    return payload;
  } catch {
    return null;
  }
}

export function getAuthUser(req) {
  // 1. Cookie de sessão HttpOnly (prioridade)
  const cookieToken = req.cookies?.get(SESSION_COOKIE_NAME)?.value;
  if (cookieToken) {
    const payload = verifyUserToken(cookieToken);
    if (payload) return payload;
  }
  // 2. Fallback: header Authorization Bearer (compatibilidade)
  const authHeader = req.headers.get('authorization') || '';
  if (!authHeader.startsWith('Bearer ')) return null;
  return verifyUserToken(authHeader.slice(7));
}

export const SESSION_COOKIE_NAME = 'nexchat_session';
export const SESSION_COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 dias

export function sessionCookieValue(user) {
  return signUserToken(user);
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

// Define o cookie de sessão "imediatamente" ao autenticar
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

const pendingOAuthStates = new Map();
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

export function createOAuthState() {
  const state = crypto.randomBytes(24).toString('hex');
  pendingOAuthStates.set(state, Date.now() + OAUTH_STATE_TTL_MS);
  return state;
}

export function consumeOAuthState(state) {
  if (!state || !pendingOAuthStates.has(state)) return false;
  const expiresAt = pendingOAuthStates.get(state);
  pendingOAuthStates.delete(state);
  return Date.now() <= expiresAt;
}
