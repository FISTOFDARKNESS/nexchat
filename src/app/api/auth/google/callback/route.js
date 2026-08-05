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
    
    const existing = await sql('SELECT id FROM "User" WHERE "customId" = $1 LIMIT 1', [customId]);
    if (existing.length === 0) {
      isUnique = true;
    }
  }
  return customId;
}

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const code = searchParams.get('code');

    if (!code) {
      return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/?auth_error=Código de autenticação ausente`);
    }

    const clientId = process.env.GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_KEY || process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET_KEY || process.env.GOOGLE_SECRET_KEY;
    const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/google/callback`;

    // 1. Trocar o código pelo Access Token do Google
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code'
      })
    });

    const tokenData = await tokenRes.json();

    if (tokenData.error) {
      console.error('Erro ao trocar token do Google:', tokenData);
      return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/?auth_error=${encodeURIComponent(tokenData.error_description || 'Erro de token')}`);
    }

    // 2. Buscar informações do perfil do usuário usando o Access Token
    const userinfoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` }
    });

    const googleUser = await userinfoRes.json();

    if (!googleUser.email) {
      return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/?auth_error=E-mail não fornecido pelo Google`);
    }

    // 3. Salvar ou sincronizar no banco de dados local
    const email = googleUser.email;
    const username = googleUser.name || googleUser.given_name || 'GoogleUser';
    const avatarUrl = googleUser.picture || null;

    let user = null;

    // Verifica se já existe um usuário com esse e-mail
    const existing = await sql('SELECT * FROM "User" WHERE "email" = $1 LIMIT 1', [email]);

    if (existing.length > 0) {
      user = existing[0];

      // Verificar se o usuário está banido
      const bans = await sql(
        'SELECT * FROM "Ban" WHERE "userId" = $1 AND ("expiresAt" IS NULL OR "expiresAt" > now()) LIMIT 1',
        [user.id]
      );
      if (bans.length > 0) {
        return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/?auth_error=${encodeURIComponent('Sua conta foi banida: ' + bans[0].reason)}`);
      }

      // Atualiza o avatar
      const updated = await sql(
        `UPDATE "User" 
         SET "avatarUrl" = COALESCE($1, "avatarUrl"), "updatedAt" = now() 
         WHERE id = $2 
         RETURNING *`,
        [avatarUrl, user.id]
      );
      user = updated[0];
    } else {
      // Cria um novo usuário
      const customId = await generateUniqueCustomId(username);
      const result = await sql(
        `INSERT INTO "User" ("customId", "username", "email", "isGuest", "gender", "country", "avatarUrl", "role")
         VALUES ($1, $2, $3, false, 'other', 'BR', $4, 'user')
         RETURNING *`,
        [customId, username, email, avatarUrl]
      );
      user = result[0];
    }

    // 4. Redirecionar de volta para a Home enviando os dados do usuário no query param para o client
    const userJson = JSON.stringify({
      id: user.id,
      username: user.username,
      customId: user.customId,
      email: user.email,
      role: user.role,
      isGuest: user.isGuest,
      gender: user.gender,
      country: user.country,
      avatarUrl: user.avatarUrl
    });

    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/?user_data=${encodeURIComponent(userJson)}`);

  } catch (error) {
    console.error('Erro no Callback do Google Auth:', error);
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/?auth_error=${encodeURIComponent(error.message)}`);
  }
}
