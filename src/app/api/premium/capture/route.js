import { NextResponse } from 'next/server';
import { captureOrder } from '@/lib/paypal';
import { sql } from '@/lib/db';
import { getAuthUser } from '@/lib/session';

function getHost(req) {
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host');
  if (!host) return 'http://localhost:3000';
  const proto = req.headers.get('x-forwarded-proto') || 'http';
  return `${proto}://${host}`;
}

export async function GET(req) {
  try {
    const auth = getAuthUser(req);
    if (!auth) {
      return NextResponse.redirect(new URL('/premium?error=unauthorized', getHost(req)));
    }
    const url = new URL(req.url);
    const token = url.searchParams.get('token');
    if (!token) {
      return NextResponse.redirect(new URL('/premium?error=missing_token', getHost(req)));
    }

    const capture = await captureOrder(token);
    const purchase = capture.purchase_units?.[0];
    const status = capture.status;
    const orderId = token;

    if (status === 'COMPLETED') {
      const amount = purchase.payments.captures?.[0]?.amount?.value || '34.99';
      const currency = purchase.payments.captures?.[0]?.amount?.currency_code || 'BRL';

      const updated = await sql(
        `UPDATE "PremiumPurchase"
         SET status = 'COMPLETED', "completedAt" = now()
         WHERE "paypalOrderId" = $1
         RETURNING *`,
        [orderId]
      );

      if (updated.length > 0) {
        const purchaseRow = updated[0];
        const now = new Date();
        const expires = new Date(now.getTime() + (purchaseRow.daysGranted || 30) * 24 * 60 * 60 * 1000);
        await sql(
          `UPDATE "User"
           SET "premiumTier" = 'premium', "premiumSince" = $1, "premiumExpiresAt" = $2
           WHERE id = $3`,
          [now, expires, purchaseRow.userId]
        );
      }
    }

    return NextResponse.redirect(new URL('/?premium=success', getHost(req)));
  } catch (error) {
    console.error('Erro na API de Premium capture:', error);
    return NextResponse.redirect(new URL('/premium?error=capture_failed', getHost(req)));
  }
}
