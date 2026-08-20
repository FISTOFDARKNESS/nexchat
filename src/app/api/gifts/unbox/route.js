import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/session';
import { sql } from '@/lib/db';

export async function GET(req) {
  try {
    const auth = getAuthUser(req);
    const url = new URL(req.url);
    const code = url.searchParams.get('code');
    if (!code) {
      return NextResponse.json({ error: 'Código ausente' }, { status: 400 });
    }

    const rows = await sql('SELECT * FROM "Gift" WHERE code = $1 AND paid = true LIMIT 1', [code]);
    if (rows.length === 0) {
      return NextResponse.json({ error: 'Presente não encontrado' }, { status: 404 });
    }
    const g = rows[0];

    if (!auth) {
      return NextResponse.json({ success: false, needsLogin: true });
    }

    const isRecipient = g.recipientId === auth.id;
    const isGiver = g.giverId === auth.id;
    if (!isRecipient && !isGiver) {
      return NextResponse.json({ error: 'Este presente não é seu', notYours: true }, { status: 403 });
    }

    if (g.status === 'PENDING' && g.paid && g.expiresAt && new Date(g.expiresAt) <= new Date()) {
      await sql(`UPDATE "Gift" SET status = 'EXPIRED' WHERE id = $1 AND status = 'PENDING'`, [g.id]);
      g.status = 'EXPIRED';
    }

    const giver = g.isAnonymous
      ? null
      : (await sql('SELECT username, "avatarUrl", country FROM "User" WHERE id = $1 LIMIT 1', [g.giverId]))[0];

    let status = g.status;
    if (status === 'ACCEPTED') {
      
      const cutoff = new Date(new Date(g.acceptedAt).getTime() + 7 * 86400000);
      if (cutoff.getTime() <= Date.now()) {
        return NextResponse.json({ error: 'Presente não encontrado' }, { status: 404 });
      }
      status = 'COLLECTED';
    } else if (status === 'PENDING' && g.paid && g.deliverAt && new Date(g.deliverAt) > new Date()) {
      status = 'SCHEDULED';
    }

    return NextResponse.json({
      success: true,
      gift: {
        code: g.code,
        plan: g.plan,
        days: g.daysGranted,
        baseAmount: g.baseAmount,
        feeAmount: g.feeAmount,
        totalAmount: g.totalAmount,
        currency: g.currency,
        message: g.message,
        isAnonymous: g.isAnonymous,
        status,
        paid: g.paid,
        deliverAt: g.deliverAt,
        acceptedAt: g.acceptedAt,
        refusedAt: g.refusedAt,
        createdAt: g.createdAt,
        expiresAt: g.expiresAt,
        retargetCount: g.retargetCount,
        isRecipient,
        isGiver,
        giverName: giver ? giver.username : (g.isAnonymous ? 'Anônimo' : null),
        giverAvatar: giver?.avatarUrl || null,
        giverCountry: giver?.country || null,
      },
    });
  } catch (error) {
    console.error('Erro na API de Presentes unbox:', error);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}