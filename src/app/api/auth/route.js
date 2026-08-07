import { sql } from '@/lib/db';
import { NextResponse } from 'next/server';
import { signUserToken, setSessionCookie } from '@/lib/session';

function getClientIp(req) {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return req.headers.get('x-real-ip') || null;
}

// Registra o IP do último login (falha silenciosa se a coluna não existir)
function touchLastIp(userId, ip) {
  if (!userId || !ip) return;
  sql('UPDATE "User" SET "lastIp" = $1 WHERE id = $2', [ip, userId]).catch(() => {});
}

// Verifica se o e-mail está na lista de e-mails banidos
async function emailBanned(email) {
  if (!email) return false;
  try {
    const res = await sql('SELECT reason FROM "EmailBan" WHERE email = $1 LIMIT 1', [email]);
    return res.length > 0 ? res[0].reason : null;
  } catch {
    return false;
  }
}

// Função para gerar um customId único (ex: user#4829)
async function generateUniqueCustomId(baseName) {
  const cleanName = baseName.replace(/[^a-zA-Z0-9]/g, '').toLowerCase().slice(0, 15);
  for (let attempt = 0; attempt < 50; attempt++) {
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const customId = `${cleanName}#${randomSuffix}`;

    const existing = await sql('SELECT id FROM "User" WHERE "customId" = $1 LIMIT 1', [customId]);
    if (existing.length === 0) {
      return customId;
    }
  }
  throw new Error('Não foi possível gerar um customId único');
}

export async function POST(req) {
  try {
    const ip = getClientIp(req);
    const body = await req.json();
    const { action, username, email, gender, country, avatarUrl, googleId } = body;

    // 1. LOGIN DE VISITANTE (GUEST)
    if (action === 'guest') {
      if (!username) {
        return NextResponse.json({ error: 'Username é obrigatório' }, { status: 400 });
      }

      const customId = await generateUniqueCustomId(username);
      
      const result = await sql(
        `INSERT INTO "User" ("customId", "username", "isGuest", "gender", "country", "role")
         VALUES ($1, $2, true, $3, $4, 'user')
         RETURNING *`,
        [customId, username, gender || 'other', country || 'BR']
      );

      const user = result[0];
      touchLastIp(user.id, ip);
      // Cookie de sessão é definido imediatamente no login
      return setSessionCookie(NextResponse.json({ success: true, user, token: signUserToken(user) }), user);
    }

    // 2. REGISTRO / LOGIN COM GOOGLE
    if (action === 'google') {
      if (!email || !username) {
        return NextResponse.json({ error: 'E-mail e nome de usuário são obrigatórios' }, { status: 400 });
      }

      // Verifica se o usuário já existe pelo e-mail
      const existingUser = await sql('SELECT * FROM "User" WHERE "email" = $1 LIMIT 1', [email]);
      
      if (existingUser.length > 0) {
        // Atualiza campos se necessário e retorna
        const user = existingUser[0];
        
        // Verifica se o usuário está banido
        const bans = await sql(
          'SELECT * FROM "Ban" WHERE "userId" = $1 AND ("expiresAt" IS NULL OR "expiresAt" > now()) LIMIT 1',
          [user.id]
        );
        if (bans.length > 0) {
          return NextResponse.json({ error: `Usuário banido: ${bans[0].reason}` }, { status: 403 });
        }

        const updated = await sql(
          `UPDATE "User" 
           SET "avatarUrl" = COALESCE($1, "avatarUrl"), "updatedAt" = now() 
           WHERE id = $2 
           RETURNING *`,
          [avatarUrl || null, user.id]
        );
        touchLastIp(user.id, ip);
        return setSessionCookie(NextResponse.json({ success: true, user: updated[0], token: signUserToken(updated[0]) }), updated[0]);
      }

      // Se não existir, verifica ban por e-mail antes de criar
      const bannedReason = await emailBanned(email);
      if (bannedReason) {
        return NextResponse.json({ error: `Este e-mail está banido: ${bannedReason}` }, { status: 403 });
      }

      const customId = await generateUniqueCustomId(username);
      const result = await sql(
        `INSERT INTO "User" ("customId", "username", "email", "isGuest", "gender", "country", "avatarUrl", "role")
         VALUES ($1, $2, $3, false, $4, $5, $6, 'user')
         RETURNING *`,
        [customId, username, email, gender || 'other', country || 'BR', avatarUrl || null]
      );

      const user = result[0];
      touchLastIp(user.id, ip);
      return setSessionCookie(NextResponse.json({ success: true, user, token: signUserToken(user) }), user);
    }

    return NextResponse.json({ error: 'Ação inválida' }, { status: 400 });

  } catch (error) {
    console.error('Erro na API de Auth:', error);
    return NextResponse.json({ error: process.env.NODE_ENV === 'production' ? 'Erro interno do servidor' : 'Erro interno do servidor: ' + error.message }, { status: 500 });
  }
}
