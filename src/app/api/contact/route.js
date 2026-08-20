import { sql } from '@/lib/db';
import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/session';
import { sendSupportMail } from '@/lib/supportEmail';
import { getClientIp } from '@/lib/ip';
import { rateLimit } from '@/lib/ratelimit';

const TOPICS = ['account', 'report', 'bug', 'premium', 'other'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function POST(req) {
  try {
    
    const ip = getClientIp(req);
    const rl = rateLimit(`contact:${ip}`, 5, 10 * 60 * 1000);
    if (!rl.ok) {
      return NextResponse.json(
        { error: 'Muitas mensagens enviadas. Tente novamente mais tarde.', errorKey: 'tooManyAttempts' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } }
      );
    }

    const body = await req.json().catch(() => null);
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    const email = typeof body?.email === 'string' ? body.email.trim() : '';
    const topic = typeof body?.topic === 'string' ? body.topic : 'other';
    const message = typeof body?.message === 'string' ? body.message.trim() : '';

    if (!name || !email || !message) {
      return NextResponse.json({ error: 'contactAllRequired' }, { status: 400 });
    }
    if (name.length > 80 || message.length < 5 || message.length > 2000) {
      return NextResponse.json({ error: 'contactError' }, { status: 400 });
    }
    if (!EMAIL_RE.test(email) || email.length > 120) {
      return NextResponse.json({ error: 'contactEmailInvalid' }, { status: 400 });
    }
    const safeTopic = TOPICS.includes(topic) ? topic : 'other';

    let finalName = name;
    let finalEmail = email;
    try {
      const auth = getAuthUser(req);
      if (auth) {
        const rows = await sql(
          `SELECT username, "customId", email, "premiumTier", "premiumExpiresAt" FROM "User" WHERE id = $1 LIMIT 1`,
          [auth.id]
        );
        const u = rows[0];
        if (u) {
          const isPremiumUser = u.premiumTier === 'premium' && u.premiumExpiresAt && new Date(u.premiumExpiresAt) > new Date();
          if (!isPremiumUser) {
            finalName = u.customId ? `${u.username}#${u.customId}` : u.username;
            if (u.email) finalEmail = u.email;
          }
        }
      }
    } catch (authErr) {
      console.error('Erro ao resolver identidade do remetente:', authErr.message);
    }

    sendSupportMail({ name: finalName, email: finalEmail, topic: safeTopic, message }).catch(() => {});

    let savedId = null;
    try {
      const insertRes = await sql(
        `INSERT INTO "ContactMessage" (name, email, topic, message) VALUES ($1, $2, $3, $4) RETURNING id`,
        [finalName, finalEmail, safeTopic, message]
      );
      savedId = insertRes[0]?.id || null;
    } catch (dbErr) {
      console.error('Erro ao gravar ContactMessage:', dbErr.message);
    }

    return NextResponse.json({ success: true, id: savedId });
  } catch (error) {
    console.error('Erro no POST /api/contact:', error.message);
    return NextResponse.json({ error: 'contactError' }, { status: 500 });
  }
}

export async function GET(req) {
  try {
    const auth = getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    }
    const rows = await sql('SELECT role FROM "User" WHERE id = $1 LIMIT 1', [auth.id]);
    if (rows.length === 0 || !['admin', 'moderator'].includes(rows[0].role)) {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '50', 10) || 50, 1), 200);
    const status = searchParams.get('status');

    const result = await sql(
      `SELECT id, name, email, topic, message, status, "createdAt"
       FROM "ContactMessage"
       ${status ? 'WHERE status = $1' : ''}
       ORDER BY "createdAt" DESC
       LIMIT ${limit}`,
      status ? [status] : []
    );

    return NextResponse.json({ success: true, messages: result });
  } catch (error) {
    console.error('Erro no GET /api/contact:', error.message);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}