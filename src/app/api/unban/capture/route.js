import { sql } from '@/lib/db';
import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/session';
import { captureOrder } from '@/lib/paypal';

export async function GET(req) {
  try {
    const auth = getAuthUser(req);
    if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    const { searchParams } = new URL(req.url);
    const orderId = searchParams.get('orderId');
    if (!orderId) return NextResponse.redirect(new URL('/?unban=error', req.headers.get('origin') || 'http://localhost:3000'));

    const payment = await sql(
      `SELECT * FROM "UnbanPayment" WHERE "orderId" = $1 AND "userId" = $2 LIMIT 1`,
      [orderId, auth.id]
    );
    if (payment.length === 0) {
      return NextResponse.redirect(new URL('/?unban=error', req.headers.get('origin') || 'http://localhost:3000'));
    }

    await captureOrder(orderId);

    await sql(`UPDATE "Ban" SET "expiresAt" = now() WHERE "userId" = $1 AND ("expiresAt" IS NULL OR "expiresAt" > now())`, [auth.id]);
    const u = await sql(`SELECT email FROM "User" WHERE id = $1 LIMIT 1`, [auth.id]);
    if (u[0]?.email) {
      await sql(`DELETE FROM "EmailBan" WHERE email = $1`, [u[0].email]).catch(() => {});
    }
    await sql(`UPDATE "UnbanPayment" SET status = 'CAPTURED', "capturedAt" = now() WHERE "orderId" = $1`, [orderId]);

    return NextResponse.redirect(new URL('/?unbanned=1', req.headers.get('origin') || 'http://localhost:3000'));
  } catch (e) {
    console.error('Erro em GET /api/unban/capture:', e.message);
    return NextResponse.redirect(new URL('/?unban=error', req.headers.get('origin') || 'http://localhost:3000'));
  }
}