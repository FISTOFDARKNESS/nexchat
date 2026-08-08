import { NextResponse } from 'next/server';
import { createOrder, getPremiumPrice } from '@/lib/paypal';
import { getAuthUser } from '@/lib/session';
import { sql } from '@/lib/db';
import { getPriceForCountry } from '@/lib/premium-config';

function getHost(req) {
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host');
  if (!host) return 'http://localhost:3000';
  const proto = req.headers.get('x-forwarded-proto') || 'http';
  return `${proto}://${host}`;
}

export async function POST(req) {
  try {
    const auth = getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const userRow = await sql('SELECT email FROM "User" WHERE id = $1 LIMIT 1', [auth.id]);
    if (!userRow[0]?.email) {
      return NextResponse.json({ error: 'Only users with Google login can purchase Premium' }, { status: 403 });
    }

    const origin = getHost(req);
    const returnUrl = `${origin}/api/premium/capture`;
    const cancelUrl = `${origin}/premium?canceled=1`;

    const countryRow = await sql('SELECT country FROM "User" WHERE id = $1 LIMIT 1', [auth.id]);
    const userCountry = countryRow[0]?.country || null;
    const { price, currency } = getPriceForCountry(userCountry);

    const order = await createOrder(returnUrl, cancelUrl, price, currency);

    await sql(
      `INSERT INTO "PremiumPurchase" ("userId", "paypalOrderId", amount, currency, status)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT ("paypalOrderId") DO NOTHING`,
      [auth.id, order.id, price, currency, 'PENDING']
    );

    return NextResponse.json({ success: true, orderId: order.id, approveUrl: order.links?.find(l => l.rel === 'approve')?.href });
  } catch (error) {
    console.error('Erro na API de Premium checkout:', error);
    return NextResponse.json({ error: process.env.NODE_ENV === 'production' ? 'Internal server error' : 'Internal server error: ' + error.message }, { status: 500 });
  }
}
