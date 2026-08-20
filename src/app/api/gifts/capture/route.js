import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/session';
import { captureOrder } from '@/lib/paypal';
import { captureGift } from '@/lib/gifts';

function getHost(req) {
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host');
  if (!host) return 'http://localhost:3000';
  const proto = req.headers.get('x-forwarded-proto') || 'http';
  return `${proto}://${host}`;
}

export async function GET(req) {
  const origin = getHost(req);
  try {
    const auth = getAuthUser(req);
    if (!auth) {
      return NextResponse.redirect(new URL('/?gift=failed', origin));
    }
    const url = new URL(req.url);
    const code = url.searchParams.get('code');
    const token = url.searchParams.get('token');
    if (!code || !token) {
      return NextResponse.redirect(new URL('/?gift=failed', origin));
    }

    const capture = await captureOrder(token);
    if (capture.status !== 'COMPLETED') {
      return NextResponse.redirect(new URL('/?gift=failed', origin));
    }

    const orderId = capture.id || token;
    const result = await captureGift(code, orderId, origin);
    if (result.error) {
      return NextResponse.redirect(new URL('/?gift=failed', origin));
    }

    const g = result.gift;
    if (g.deliverAt && new Date(g.deliverAt).getTime() > Date.now()) {
      return NextResponse.redirect(new URL('/?gift=scheduled', origin));
    }
    return NextResponse.redirect(new URL('/?gift=sent', origin));
  } catch (error) {
    console.error('Erro na API de Presentes capture:', error);
    return NextResponse.redirect(new URL('/?gift=failed', origin));
  }
}