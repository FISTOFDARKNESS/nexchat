import { sql } from '@/lib/db';
import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/session';
import { ONLINE_EXPR } from '@/lib/realtime';

export async function GET(req) {
  try {
    const auth = getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const customId = searchParams.get('customId');
    const username = searchParams.get('username');
    const id = searchParams.get('id');
    const views = searchParams.get('views');

    if (views === '1') {
      const owner = await sql(
        `SELECT "premiumTier", "premiumExpiresAt" FROM "User" WHERE id = $1 LIMIT 1`,
        [auth.id]
      );
      const isPremiumOwner = owner[0]?.premiumTier === 'premium' && owner[0]?.premiumExpiresAt && new Date(owner[0].premiumExpiresAt) > new Date();
      if (!isPremiumOwner) {
        return NextResponse.json({ success: true, premiumRequired: true, viewers: [] });
      }
      const viewers = await sql(
        `SELECT u.id as "viewerId", u.username, u."customId", u."avatarUrl", u."premiumTier", u."premiumExpiresAt", u.verified, pv."viewedAt"
         FROM "ProfileView" pv
         JOIN "User" u ON u.id = pv."viewerId"
         WHERE pv."viewedUserId" = $1
         ORDER BY pv."viewedAt" DESC LIMIT 20`,
        [auth.id]
      );
      return NextResponse.json({ success: true, premiumRequired: false, viewers });
    }

    let targetId = id;
    if (id === 'self') {
      targetId = auth.id;
    }

    if (!customId && !username && !targetId) {
      return NextResponse.json({ error: 'Informe customId, username ou id' }, { status: 400 });
    }

    const fields = `id, username, "customId", "avatarUrl", country, gender, ${ONLINE_EXPR} as "isOnline", bio, status, "lastSeen", "premiumTier", "premiumSince", "premiumExpiresAt", verified, "chatTheme", "invisibleMode", "createdAt", "twoFactorEnabled", "emailVerified"`;
    let rows = [];

    if (customId) {
      rows = await sql(`SELECT ${fields} FROM "User" WHERE "customId" = $1 LIMIT 1`, [customId]);
    } else if (username) {
      rows = await sql(`SELECT ${fields} FROM "User" WHERE username = $1 LIMIT 1`, [username]);
    } else {
      rows = await sql(`SELECT ${fields} FROM "User" WHERE id = $1 LIMIT 1`, [targetId]);
    }

    if (rows.length === 0) {
      return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });
    }

    if (rows[0].id === auth.id) {
      const own = await sql('SELECT email FROM "User" WHERE id = $1 LIMIT 1', [rows[0].id]);
      rows[0].email = own[0]?.email || null;
    }

    if (rows[0].id !== auth.id) {
      sql(
        `INSERT INTO "ProfileView" ("viewedUserId", "viewerId") VALUES ($1, $2)
         ON CONFLICT ("viewedUserId", "viewerId") DO UPDATE SET "viewedAt" = now()`,
        [rows[0].id, auth.id]
      ).catch(() => {});
    }

    return NextResponse.json({ success: true, user: rows[0] });
  } catch (error) {
    console.error('Erro na API de Usuários (GET):', error);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    const auth = getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    }
    const userId = auth.id;
    const body = await req.json();
    const { bio, status, avatarUrl, username, chatTheme, invisibleMode, country } = body;

    const sets = [];
    const values = [];
    if (typeof bio === 'string') {
      sets.push('bio = $' + (values.length + 1));
      values.push(DOMPurify.sanitize(bio.trim()).slice(0, 160) || null);
    }
    if (typeof status === 'string') {
      sets.push('status = $' + (values.length + 1));
      values.push(DOMPurify.sanitize(status.trim()).slice(0, 40) || null);
    }
    if (typeof avatarUrl === 'string') {
      const av = avatarUrl.trim();
      const validAvatar = av === '' || av.startsWith('/api/files/') || av.startsWith('/files/') || /^https:\/\//i.test(av);
      if (!validAvatar) {
        return NextResponse.json({ error: 'avatarUrl inválido' }, { status: 400 });
      }
      sets.push('"avatarUrl" = $' + (values.length + 1));
      values.push(av || null);
    }
    if (typeof chatTheme === 'string') {
      sets.push('"chatTheme" = $' + (values.length + 1));
      values.push(chatTheme.trim().slice(0, 40) || null);
    }
    if (typeof invisibleMode === 'boolean') {
      sets.push('"invisibleMode" = $' + (values.length + 1));
      values.push(invisibleMode);
    }
    if (typeof country === 'string' && country.trim()) {
      const premium = await sql(
        `SELECT "premiumTier", "premiumExpiresAt" FROM "User" WHERE id = $1 LIMIT 1`,
        [userId]
      );
      const isPremiumUser = premium[0]?.premiumTier === 'premium' && premium[0]?.premiumExpiresAt && new Date(premium[0].premiumExpiresAt) > new Date();
      if (!isPremiumUser) {
        return NextResponse.json({ error: 'Alterar país é um recurso Premium.' }, { status: 403 });
      }
      sets.push('country = $' + (values.length + 1));
      values.push(country.trim().slice(0, 2));
    }
    if (typeof username === 'string' && username.trim()) {
      const premium = await sql(
        `SELECT "premiumTier", "premiumExpiresAt", "lastNameChangeAt" FROM "User" WHERE id = $1 LIMIT 1`,
        [userId]
      );
      const isPremiumUser = premium[0]?.premiumTier === 'premium' && premium[0]?.premiumExpiresAt && new Date(premium[0].premiumExpiresAt) > new Date();
      if (!isPremiumUser) {
        const lastChange = premium[0]?.lastNameChangeAt;
        if (lastChange) {
          const diff = Date.now() - new Date(lastChange).getTime();
          if (diff < 30 * 24 * 60 * 60 * 1000) {
            return NextResponse.json({ error: 'Nome pode ser alterado apenas 1x por mês. Assine premium para mais liberdade.' }, { status: 403 });
          }
        }
      }
      sets.push('username = $' + (values.length + 1));
      values.push(username.trim().slice(0, 30));
      sets.push('"lastNameChangeAt" = now()');
    }
    if (sets.length === 0) {
      return NextResponse.json({ error: 'Nada para atualizar' }, { status: 400 });
    }
    sets.push('"updatedAt" = now()');
    values.push(userId);

    const result = await sql(
      `UPDATE "User" SET ${sets.join(', ')} WHERE id = $${values.length} RETURNING id, username, "customId", "avatarUrl", country, gender, ${ONLINE_EXPR} as "isOnline", bio, status, "lastSeen", "premiumTier", "chatTheme", "invisibleMode"`,
      values
    );
    return NextResponse.json({ success: true, user: result[0] });
  } catch (error) {
    console.error('Erro na API de Usuários (POST):', error);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
