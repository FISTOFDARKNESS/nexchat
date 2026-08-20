import { sql } from '@/lib/db';
import { NextResponse } from 'next/server';
import { encryptUserToken, setSessionCookie } from '@/lib/session';
import { hashPassword, verifyPassword } from '@/lib/password';
import { getClientIp } from '@/lib/ip';
import { verifyRecaptcha } from '@/lib/captcha';
import { rateLimit } from '@/lib/ratelimit';
import { sendCode, sendTwoFactorLockEmail } from '@/lib/twofa';

function maskEmail(email) {
  if (!email || !String(email).includes('@')) return '';
  const [u, d] = String(email).split('@');
  const mu = u.length <= 1 ? '***' : u.length === 2 ? `${u[0]}***` : `${u.slice(0, 1)}***${u.slice(-1)}`;
  return `${mu}@${d}`;
}

function touchLastIp(userId, ip) {
  if (!userId || !ip) return;
  sql('UPDATE "User" SET "lastIp" = $1 WHERE id = $2', [ip, userId]).catch(() => {});
}

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
  throw new Error('Could not generate a unique customId');
}

export async function POST(req) {
  try {
    const ip = getClientIp(req);
    const body = await req.json();
    const { action, username, gender, country, password, inviteCode, recaptchaToken, acceptedTerms, confirmedAge, lang } = body;

    const requireLegalConsent = () => {
      if (acceptedTerms !== true || confirmedAge !== true) {
        const err = new Error('You must be 18 or older and accept the Terms of Service to create an account');
        err.status = 400;
        throw err;
      }
    };

    function validateUsername(name) {
      const n = String(name || '').trim();
      if (n.length < 4) {
        const err = new Error('Username must have at least 4 characters');
        err.status = 400;
        err.errorKey = 'usernameTooShort';
        throw err;
      }
      const letters = (n.match(/\p{L}/gu) || []).length;
      if (letters < 4) {
        const err = new Error('Username must contain at least 4 letters');
        err.status = 400;
        err.errorKey = 'usernameNotEnoughLetters';
        throw err;
      }
      if (/[^\p{L}\p{N}_\s-]/u.test(n)) {
        const err = new Error('Username cannot contain emojis or symbols');
        err.status = 400;
        err.errorKey = 'usernameInvalidChars';
        throw err;
      }
      return n;
    }

    function validatePassword(pw) {
      if (!pw || String(pw).length < 8) {
        const err = new Error('Password must have at least 8 characters');
        err.status = 400;
        err.errorKey = 'passwordTooShort';
        throw err;
      }
    }

    if (action === 'guest') {
      
      const rl = rateLimit(`auth:guest:${ip}`, 15, 5 * 60 * 1000);
      if (!rl.ok) {
        return NextResponse.json(
          { error: 'Muitas tentativas. Tente novamente em alguns minutos.', errorKey: 'tooManyAttempts' },
          { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } }
        );
      }
      if (!username) {
        return NextResponse.json({ error: 'Username is required' }, { status: 400 });
      }
      if (!password) {
        return NextResponse.json({ error: 'Password is required for guest accounts' }, { status: 400 });
      }

      const existing = await sql('SELECT * FROM "User" WHERE "username" = $1 AND "isGuest" = true LIMIT 1', [username]);

      if (existing.length > 0) {
        
        const cap = await verifyRecaptcha(recaptchaToken);
        if (!cap.ok) {
          return NextResponse.json({ error: 'Verificação reCAPTCHA falhou. Tente novamente.', errorKey: 'recaptchaFailed' }, { status: 403 });
        }

        const user = existing[0];
        if (!user.passwordHash) {
          return NextResponse.json({ error: 'This account has no password. Choose another name.' }, { status: 400 });
        }
        if (!verifyPassword(password, user.passwordHash)) {
          return NextResponse.json({ error: 'Incorrect password' }, { status: 401 });
        }

        const bans = await sql(
          'SELECT * FROM "Ban" WHERE "userId" = $1 AND ("expiresAt" IS NULL OR "expiresAt" > now()) LIMIT 1',
          [user.id]
        );
        if (bans.length > 0) {
          return NextResponse.json({ error: `User banned: ${bans[0].reason}` }, { status: 403 });
        }

        if (user.twoFactorEnabled && user.email) {
          
          if (user.twoFactorLockUntil && new Date(user.twoFactorLockUntil).getTime() > Date.now()) {
            return NextResponse.json(
              { error: 'Conta bloqueada por 24h. Contate um administrador para desbloquear.', errorKey: 'lockedLogin', lockUntil: new Date(user.twoFactorLockUntil).toISOString() },
              { status: 423 }
            );
          }
          const sent = await sendCode({ id: user.id, email: user.email }, 'login_2fa', lang);
          if (!sent) {
            
            console.error('Falha ao enviar código 2FA de login para', user.id);
          } else {
            return NextResponse.json({ twoFactorRequired: true, emailMask: maskEmail(user.email) });
          }
        }

        const updated = await sql(
          `UPDATE "User" SET "updatedAt" = now() WHERE id = $1 RETURNING *`,
          [user.id]
        );
        touchLastIp(updated[0].id, ip);
        return setSessionCookie(NextResponse.json({ success: true, user: updated[0], token: encryptUserToken(updated[0]) }), updated[0]);
      }

      const cleanUsername = validateUsername(username);
      validatePassword(password);
      const customId = await generateUniqueCustomId(cleanUsername);
      const passwordHash = hashPassword(password);

      const cap = await verifyRecaptcha(recaptchaToken);
      if (!cap.ok) {
        return NextResponse.json({ error: 'reCAPTCHA verification failed' }, { status: 403 });
      }

      requireLegalConsent();

      const result = await sql(
        `INSERT INTO "User" ("customId", "username", "passwordHash", "isGuest", "gender", "country", "role", "acceptedTermsAt", "confirmedAgeAt")
         VALUES ($1, $2, $3, true, $4, $5, 'user', now(), now())
         RETURNING *`,
        [customId, cleanUsername, passwordHash, gender || 'other', country || 'BR']
      );

      const user = result[0];
      touchLastIp(user.id, ip);
      
      if (inviteCode) {
        trackInviteConversion(inviteCode, user.id, ip).catch(() => {});
      }
      
      return setSessionCookie(NextResponse.json({ success: true, user, token: encryptUserToken(user) }), user);
    }

    return NextResponse.json({ error: 'Ação inválida' }, { status: 400 });

  } catch (error) {
    console.error('Erro na API de Auth:', error);
    const status = error.status || 500;
    
    const message = status === 400 && error.message ? error.message : 'Internal server error';
    return NextResponse.json({ error: message, errorKey: error.errorKey }, { status });
  }
}

async function trackInviteConversion(code, newUserId, ip) {
  const invite = await sql(
    'SELECT id, "userId" FROM "Invite" WHERE code = $1 LIMIT 1',
    [code]
  );

  if (invite.length === 0) return;

  const inviteId = invite[0].id;
  const referrerId = invite[0].userId;

  if (referrerId === newUserId) return;

  const existingConversion = await sql(
    'SELECT id FROM "InviteConversion" WHERE "newUserId" = $1 LIMIT 1',
    [newUserId]
  );
  if (existingConversion.length > 0) return;

  if (ip) {
    const existingIpConversion = await sql(
      'SELECT id FROM "InviteConversion" WHERE "inviteId" = $1 AND "newUserIp" = $2 LIMIT 1',
      [inviteId, ip]
    );
    if (existingIpConversion.length > 0) return;
  }

  if (ip) {
    const ipTotal = await sql('SELECT COUNT(*)::int AS n FROM "InviteConversion" WHERE "newUserIp" = $1', [ip]);
    if (ipTotal[0]?.n >= 25) return;
  }

  await sql(
    `INSERT INTO "InviteConversion" ("inviteId", "newUserId", "newUserIp", "newUserCountry") VALUES ($1, $2, $3, $4)`,
    [inviteId, newUserId, ip || null, null]
  );

  await sql(
    `UPDATE "Invite" SET conversions = conversions + 1, "updatedAt" = now() WHERE id = $1`,
    [inviteId]
  );

  const conversions = await sql(
    'SELECT conversions FROM "Invite" WHERE id = $1 LIMIT 1',
    [inviteId]
  );

  if (conversions[0]?.conversions >= 25) {
    
    const ref = await sql('SELECT "createdAt" FROM "User" WHERE id = $1 LIMIT 1', [referrerId]);
    const ageDays = ref[0] ? (Date.now() - new Date(ref[0].createdAt).getTime()) / 86400000 : 0;
    if (ageDays >= 1) {
      await sql(
        `UPDATE "User" SET "premiumTier" = 'premium', "premiumSince" = now(), "premiumExpiresAt" = now() + INTERVAL '30 days' WHERE id = $1`,
        [referrerId]
      );
    }
  }
}
