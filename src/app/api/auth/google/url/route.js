import { NextResponse } from 'next/server';
import { createOAuthState } from '@/lib/session';

export async function GET(req) {
  try {
    const clientId = process.env.GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_KEY || process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    const redirectUri = `${new URL(req.url).origin}/api/auth/google/callback`;

    if (!clientId) {
      return NextResponse.json({ error: 'GOOGLE_CLIENT_ID não está configurado no servidor' }, { status: 500 });
    }

    const state = createOAuthState();
    const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=openid%20profile%20email&state=${state}`;
    
    return NextResponse.json({ success: true, url });
  } catch (err) {
    return NextResponse.json({ error: 'Erro ao gerar URL do Google Auth: ' + err.message }, { status: 500 });
  }
}
