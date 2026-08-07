import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/session';
import { sql } from '@/lib/db';
import { isPremium } from '@/lib/premium';

const LANG_NAMES = {
  pt: 'Português', en: 'Inglês', es: 'Espanhol', fr: 'Francês', de: 'Alemão',
  it: 'Italiano', ja: 'Japonês', ko: 'Coreano', zh: 'Chinês', ru: 'Russo',
  ar: 'Árabe', hi: 'Hindi', nl: 'Holandês', pl: 'Polonês', tr: 'Turco',
  vi: 'Vietnamita', th: 'Tailandês', id: 'Indonésio', uk: 'Ucraniano',
  sv: 'Sueco', no: 'Norueguês', da: 'Dinamarquês', fi: 'Finlandês', el: 'Grego'
};

const cache = new Map();
const CACHE_TTL = 6 * 60 * 60 * 1000;

function langName(code) {
  return LANG_NAMES[code] || code;
}

async function translateViaGoogle(text, target) {
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${encodeURIComponent(target)}&dt=t&q=${encodeURIComponent(text)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`Google Translate falhou (${res.status})`);
  const data = await res.json();
  const translated = Array.isArray(data?.[0])
    ? data[0].map(seg => seg?.[0] || '').join('').trim()
    : '';
  if (!translated) throw new Error('Tradução vazia');
  const detected = data?.[2] || 'auto';
  return { translated, detected, target };
}

async function translateViaMyMemory(text, target) {
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text.slice(0, 500))}&langpair=en|${encodeURIComponent(target)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`MyMemory falhou (${res.status})`);
  const data = await res.json();
  const translated = data?.responseData?.translatedText || '';
  if (!translated) throw new Error('Tradução vazia (MyMemory)');
  return { translated, detected: 'en', target };
}

export async function POST(req) {
  try {
    const auth = getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    }
    const userId = auth.id;

    const user = await sql(
      `SELECT "premiumTier", "premiumExpiresAt" FROM "User" WHERE id = $1 LIMIT 1`,
      [userId]
    );
    if (!isPremium(user[0])) {
      return NextResponse.json({ error: 'Recurso exclusivo para premium' }, { status: 403 });
    }

    const body = await req.json();
    const text = typeof body?.text === 'string' ? body.text.trim() : '';
    const target = (typeof body?.lang === 'string' && /^[a-z]{2}$/.test(body.lang)) ? body.lang : 'pt';
    if (!text) {
      return NextResponse.json({ error: 'text é obrigatório' }, { status: 400 });
    }
    if (text.length > 5000) {
      return NextResponse.json({ error: 'Texto muito longo para traduzir' }, { status: 413 });
    }

    const cacheKey = `${target}:${text.slice(0, 80)}:${text.length}`;
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.at < CACHE_TTL) {
      return NextResponse.json({ success: true, ...cached.data, cached: true });
    }

    let result;
    try {
      result = await translateViaGoogle(text, target);
    } catch (e) {
      try {
        result = await translateViaMyMemory(text, target);
      } catch (e2) {
        return NextResponse.json({ error: 'Não foi possível traduzir agora. Tente novamente.' }, { status: 502 });
      }
    }

    const data = {
      translated: result.translated,
      detected: langName(result.detected),
      lang: result.target
    };
    cache.set(cacheKey, { at: Date.now(), data });
    if (cache.size > 500) {
      const oldest = cache.keys().next().value;
      cache.delete(oldest);
    }

    return NextResponse.json({ success: true, ...data });
  } catch (error) {
    console.error('Erro na API de Tradução:', error);
    return NextResponse.json({ error: process.env.NODE_ENV === 'production' ? 'Erro interno do servidor' : 'Erro interno do servidor: ' + error.message }, { status: 500 });
  }
}
