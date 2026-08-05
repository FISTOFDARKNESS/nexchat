import { NextResponse } from 'next/server';

export async function GET(req) {
  try {
    const clientId = process.env.GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_KEY || process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/google/callback`;

    if (!clientId) {
      return NextResponse.json({ error: 'GOOGLE_CLIENT_ID não está configurado no servidor' }, { status: 500 });
    }

    const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=openid%20profile%20email`;
    
    return NextResponse.json({ success: true, url });
  } catch (err) {
    return NextResponse.json({ error: 'Erro ao gerar URL do Google Auth: ' + err.message }, { status: 500 });
  }
}
