import { sql } from '@/lib/db';
import { NextResponse } from 'next/server';

// Função para gerar um customId único (ex: user#4829)
async function generateUniqueCustomId(baseName) {
  const cleanName = baseName.replace(/[^a-zA-Z0-9]/g, '').toLowerCase().slice(0, 15);
  let isUnique = false;
  let customId = '';
  
  while (!isUnique) {
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    customId = `${cleanName}#${randomSuffix}`;
    
    // Verifica se já existe no banco
    const existing = await sql('SELECT id FROM "User" WHERE "customId" = $1 LIMIT 1', [customId]);
    if (existing.length === 0) {
      isUnique = true;
    }
  }
  return customId;
}

export async function POST(req) {
  try {
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
      return NextResponse.json({ success: true, user });
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
        return NextResponse.json({ success: true, user: updated[0] });
      }

      // Se não existir, cria um novo
      const customId = await generateUniqueCustomId(username);
      const result = await sql(
        `INSERT INTO "User" ("customId", "username", "email", "isGuest", "gender", "country", "avatarUrl", "role")
         VALUES ($1, $2, $3, false, $4, $5, $6, 'user')
         RETURNING *`,
        [customId, username, email, gender || 'other', country || 'BR', avatarUrl || null]
      );

      const user = result[0];
      return NextResponse.json({ success: true, user });
    }

    return NextResponse.json({ error: 'Ação inválida' }, { status: 400 });

  } catch (error) {
    console.error('Erro na API de Auth:', error);
    return NextResponse.json({ error: 'Erro interno do servidor: ' + error.message }, { status: 500 });
  }
}
