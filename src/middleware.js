import { NextResponse } from 'next/server';

const rateLimit = new Map();

function getClientIp(req) {
  const xf = req.headers.get('x-forwarded-for');
  if (xf) return xf.split(',')[0].trim();
  return req.headers.get('x-real-ip') || 'unknown';
}

function cleanup() {
  const now = Date.now();
  for (const [key, data] of rateLimit.entries()) {
    if (now - data.reset > 60_000) {
      rateLimit.delete(key);
    }
  }
}

export function middleware(req) {
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
  ];

  if (!apiPaths.some(p => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const ip = getClientIp(req);
  const key = `${ip}:${pathname}`;
  const now = Date.now();

  cleanup();

  const entry = rateLimit.get(key);
  if (!entry) {
    rateLimit.set(key, { count: 1, reset: now });
    return NextResponse.next();
  }

  if (now > entry.reset) {
    entry.count = 1;
    entry.reset = now;
    return NextResponse.next();
  }

  entry.count += 1;
  if (entry.count > 30) {
    return NextResponse.json(
      { error: 'Muitas requisições. Tente novamente em instantes.' },
      { status: 429 }
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/api/:path*'],
};
