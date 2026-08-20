import { sql } from '@/lib/db';
import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/session';
import { createOrder } from '@/lib/paypal';
import { ensureLevelsSchema } from '@/lib/levels';

export const UNBAN_PRICE = '15.00';
export const UNBAN_CURRENCY = 'EUR';

export async function POST(req) {
  try {
    const auth = getAuthUser(req);
    if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    await ensureLevelsSchema();

    const activeBan = await sql(
      `SELECT id FROM "Ban" WHERE "userId" = $1 AND ("expiresAt" IS NULL OR "expiresAt" > now()) LIMIT 1`,
      [auth.id]
    );
    if (activeBan.length === 0) {
      return NextResponse.json({ error: 'Sua conta não está banida' }, { status: 400 });
    }

    const origin = req.headers.get('origin') || 'http://localhost:3000';
    const returnUrl = `${origin}/api/unban/capture`;
    const cancelUrl = `${origin}/?unban=cancelled`;
    let order;
    try {
      order = await createOrder(returnUrl, cancelUrl, UNBAN_PRICE, UNBAN_CURRENCY, 'NexChat - Desbanimento de conta');
    } catch (e) {
      console.error('[unban] createOrder:', e.message);
      return NextResponse.json({ error: 'Falha ao iniciar o pagamento no PayPal. Tente novamente.' }, { status: 500 });
    }

    await sql(
      `INSERT INTO "UnbanPayment" ("userId", "orderId", status, amount, currency)
       VALUES ($1, $2, 'CREATED', $3, $4)`,
      [auth.id, order.id, UNBAN_PRICE, UNBAN_CURRENCY]
    );

    return NextResponse.json({
      success: true,
      approveUrl: order.links?.find((l) => l.rel === 'approve')?.href,
    });
  } catch (e) {
    console.error('Erro em POST /api/unban:', e.message);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}