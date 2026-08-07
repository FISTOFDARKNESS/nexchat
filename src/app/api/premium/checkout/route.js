import { NextResponse } from 'next/server';
import { createOrder, getPremiumPrice } from '@/lib/paypal';
import { getAuthUser } from '@/lib/session';
import { sql } from '@/lib/db';

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
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    }
    const origin = getHost(req);
    const returnUrl = `${origin}/api/premium/capture`;
    const cancelUrl = `${origin}/premium?canceled=1`;

    const order = await createOrder(returnUrl, cancelUrl);

    await sql(
      `INSERT INTO "PremiumPurchase" ("userId", "paypalOrderId", amount, currency, status)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT ("paypalOrderId") DO NOTHING`,
      [auth.id, order.id, getPremiumPrice().price, getPremiumPrice().currency, 'PENDING']
    );

    return NextResponse.json({ success: true, orderId: order.id, approveUrl: order.links?.find(l => l.rel === 'approve')?.href });
  } catch (error) {
    console.error('Erro na API de Premium checkout:', error);
    return NextResponse.json({ error: process.env.NODE_ENV === 'production' ? 'Erro interno do servidor' : 'Erro interno do servidor: ' + error.message }, { status: 500 });
  }
}
