export async function verifyRecaptcha(token) {
  const secret = process.env.RECAPTCHA_SECRET_KEY;
  if (!secret) {
    
    if (process.env.NODE_ENV === 'production') {
      console.error('[FATAL-SEG] RECAPTCHA_SECRET_KEY ausente em produção — registro bloqueado (anti-bot).');
      return { ok: false, score: null };
    }
    return { ok: true, score: null };
  }
  if (!token) return { ok: false, score: null };
  try {
    const res = await fetch('https://www.google.com/recaptcha/api/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret, response: token })
    });
    const data = await res.json();
    return { ok: data.success && (data.score ?? 1) >= 0.5, score: data.score ?? null };
  } catch (e) {
    console.error('reCAPTCHA verify error:', e);
    return { ok: false, score: null };
  }
}