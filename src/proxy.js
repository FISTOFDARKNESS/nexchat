import { NextResponse } from 'next/server';
import { getClientIp } from '@/lib/ip';
import { sessionRevoked } from '@/lib/session';

const rateLimit = new Map();

function cleanup() {
  const now = Date.now();
  for (const [key, data] of rateLimit.entries()) {
    if (now - data.reset > 60_000) {
      rateLimit.delete(key);
    }
  }
}

function buildCsp() {
  return [
    "default-src 'self'",
    process.env.NODE_ENV !== 'production' ? "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.google.com https://www.gstatic.com" : "script-src 'self' 'unsafe-inline' https://www.google.com https://www.gstatic.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "img-src 'self' data: blob: https://www.google.com https://www.gstatic.com https://lh3.googleusercontent.com https://*.supabase.co",
    "font-src 'self' data: https://fonts.gstatic.com",
    "connect-src 'self' blob: wss://*.onrender.com https://*.onrender.com ws://localhost:* http://localhost:* https://www.google.com https://www.gstatic.com https://*.supabase.co wss://*.supabase.co",
    "media-src 'self' blob: data: https://*.supabase.co",
    "frame-src https://www.google.com https://www.gstatic.com",
    "frame-ancestors 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "worker-src 'self' blob:"
  ].join('; ');
}

export async function proxy(req) {
  const url = new URL(req.url);
  const pathname = url.pathname;

  const apiPaths = [
    '/api/auth',
    '/api/messages',
    '/api/friends',
    '/api/upload',
    '/api/reactions',
    '/api/groups',
    '/api/blocks',
    '/api/users',
    '/api/reports',
    '/api/admin',
    '/api/invite',
    '/api/premium',
    '/api/push',
    '/api/geolocation',
    '/api/contact',
    '/api/realtime',
  ];

  const revoked = await sessionRevoked(req);
  if (revoked) {
    if (!apiPaths.some(p => pathname.startsWith(p))) {
      const h = new Headers(req.headers);
      h.delete('cookie');
      h.delete('authorization');
      const res = NextResponse.next({ request: { headers: h } });
      res.headers.set('Content-Security-Policy', buildCsp());
      return res;
    }
    const res = NextResponse.json(
      { error: 'Sessão inválida. Faça login novamente.', errorKey: 'sessionRevoked' },
      { status: 401 }
    );
    res.headers.set('Content-Security-Policy', buildCsp());
    return res;
  }

  if (!apiPaths.some(p => pathname.startsWith(p))) {
    const res = NextResponse.next();
    res.headers.set('Content-Security-Policy', buildCsp());
    return res;
  }

  const ip = getClientIp(req);
  const key = `${ip}:${pathname}`;
  const now = Date.now();

  cleanup();

  const entry = rateLimit.get(key);
  if (!entry) {
    rateLimit.set(key, { count: 1, reset: now });
    const res = NextResponse.next();
    res.headers.set('Content-Security-Policy', buildCsp());
    return res;
  }

  if (now > entry.reset) {
    entry.count = 1;
    entry.reset = now;
    const res = NextResponse.next();
    res.headers.set('Content-Security-Policy', buildCsp());
    return res;
  }

  entry.count += 1;
  if (entry.count > 30) {
    const res = NextResponse.json(
      { error: 'Muitas requisições. Tente novamente em instantes.' },
      { status: 429 }
    );
    res.headers.set('Content-Security-Policy', buildCsp());
    return res;
  }

  const res = NextResponse.next();
  res.headers.set('Content-Security-Policy', buildCsp());
  return res;
}

export const config = {
  
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
