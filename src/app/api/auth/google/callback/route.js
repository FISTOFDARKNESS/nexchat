import { sql } from '@/lib/db';
import { NextResponse } from 'next/server';
import { consumeOAuthState, setSessionCookie } from '@/lib/session';

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

export async function GET(req) {
  try {
    const proto = req.headers.get('x-forwarded-proto') || new URL(req.url).protocol.slice(0, -1);
    const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || new URL(req.url).host;
    const baseOrigin = `${proto}://${host}`;
    const origin = process.env.NEXT_PUBLIC_APP_URL || baseOrigin;
    const { searchParams } = new URL(req.url);
    const code = searchParams.get('code');
    const state = searchParams.get('state');

    if (!code) {
      return NextResponse.redirect(`${origin}/?auth_error=Código de autenticação ausente`);
    }

    if (!consumeOAuthState(state)) {
      return NextResponse.redirect(`${origin}/?auth_error=${encodeURIComponent('Estado de autenticação inválido. Tente novamente.')}`);
    }

    const clientId = process.env.GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_KEY || process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET_KEY || process.env.GOOGLE_SECRET_KEY;
    const redirectUri = `${baseOrigin}/api/auth/google/callback`;

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
      return NextResponse.redirect(`${origin}/?auth_error=${encodeURIComponent(tokenData.error_description || 'Erro de token')}`);
    }

    // 2. Buscar informações do perfil do usuário usando o Access Token
    const userinfoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` }
    });

    const googleUser = await userinfoRes.json();

    if (!googleUser.email) {
      return NextResponse.redirect(`${origin}/?auth_error=E-mail não fornecido pelo Google`);
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
        return NextResponse.redirect(`${origin}/?auth_error=${encodeURIComponent('Sua conta foi banida: ' + bans[0].reason)}`);
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

    // 4. Redirecionar de volta para a Home com o cookie de sessão já definido
    //    (o token NUNCA vai na URL — só no cookie HttpOnly)
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

    const res = NextResponse.redirect(`${origin}/?user_data=${encodeURIComponent(userJson)}`);
    return setSessionCookie(res, user);

  } catch (error) {
    console.error('Erro no Callback do Google Auth:', error);
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin}/?auth_error=${encodeURIComponent(error.message)}`);
  }
}
