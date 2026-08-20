import crypto from 'crypto';
import { sql } from '@/lib/db';
import { sendNexchatMail } from '@/lib/supportEmail';

const CODE_TTL_MS = 2 * 60 * 1000; 

function genAlnum(len) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const bytes = crypto.randomBytes(len);
  let s = '';
  for (let i = 0; i < len; i++) s += chars[bytes[i] % chars.length];
  return s;
}

function genNumeric(len) {
  const bytes = crypto.randomBytes(len);
  let s = '';
  for (let i = 0; i < len; i++) s += String(bytes[i] % 10);
  return s;
}

export function generateCode(purpose) {
  return purpose === 'enable_2fa' || purpose === 'disable_2fa' ? genAlnum(8) : genNumeric(8);
}

const PURPOSE_LABELS = {
  enable_2fa: { pt: 'Ativar 2FA', en: 'Enable 2FA', it: 'Attiva 2FA' },
  disable_2fa: { pt: 'Desativar 2FA', en: 'Disable 2FA', it: 'Disattiva 2FA' },
  change_password: { pt: 'Alterar senha', en: 'Change password', it: 'Cambia password' },
  disconnect_device: { pt: 'Desconectar dispositivo', en: 'Disconnect device', it: 'Disconnetti dispositivo' },
  link_guest: { pt: 'Vincular conta a um e-mail', en: 'Link account to an email', it: "Collega l'account a un'e-mail" },
  login_2fa: { pt: 'Login', en: 'Login', it: 'Accesso' }
};

const LOCK_I18N = {
  pt: {
    subject: '[NexChat] Conta bloqueada por 24h após tentativas de login',
    title: 'Tentativas de login falharam',
    body: 'Detectamos 3 tentativas incorretas de código de verificação na sua conta NexChat. Por segurança, o acesso por código ficou bloqueado por 24 horas.',
    action: 'Se não foram você, altere sua senha e contate um administrador para desbloquear a conta antes desse prazo.'
  },
  en: {
    subject: '[NexChat] Account locked for 24h after failed login attempts',
    title: 'Failed login attempts',
    body: 'We detected 3 incorrect verification code attempts on your NexChat account. For security, code-based access is locked for 24 hours.',
    action: "If this wasn't you, change your password and contact an administrator to unlock the account before that period."
  },
  it: {
    subject: "[NexChat] Account bloccato per 24h dopo tentativi di accesso falliti",
    title: 'Tentativi di accesso falliti',
    body: 'Abbiamo rilevato 3 tentativi di codice di verifica errati sul tuo account NexChat. Per sicurezza, l\'accesso tramite codice è bloccato per 24 ore.',
    action: "Se non sei stato tu, cambia la tua password e contatta un amministratore per sbloccare l'account prima di tale scadenza."
  }
};

function buildLockHtml(i18n) {
  return `<!DOCTYPE html>
<html lang="pt">
<body style="margin:0;padding:0;background:#0f0f14;font-family:Arial,Helvetica,sans-serif;">
  <div style="padding:24px;">
    <div style="max-width:420px;margin:0 auto;background:#16161d;border:1px solid #2a2a33;border-radius:12px;padding:24px;color:#e8e8ef;">
      <div style="font-size:20px;font-weight:700;color:#eac847;margin-bottom:12px;">NexChat</div>
      <p style="font-size:15px;font-weight:700;line-height:1.4;margin:0 0 12px;color:#ff6b6b;">${i18n.title}</p>
      <p style="font-size:14px;line-height:1.5;margin:0 0 12px;color:#cfcfd8;">${i18n.body}</p>
      <p style="font-size:13px;line-height:1.5;margin:0;color:#7a7a85;">${i18n.action}</p>
    </div>
  </div>
</body>
</html>`;
}

export async function sendTwoFactorLockEmail(user, lang) {
  const email = user.email;
  if (!email) return false;
  const safeLang = LOCK_I18N[lang] ? lang : 'pt';
  const i18n = LOCK_I18N[safeLang];
  const text = `${i18n.title}\n\n${i18n.body}\n\n${i18n.action}`;
  return sendNexchatMail({ to: email, subject: i18n.subject, text, html: buildLockHtml(i18n) });
}

const EMAIL_I18N = {
  pt: {
    subject: (label) => `[NexChat] Código de verificação — ${label}`,
    greeting: (label) => `Seu código de verificação do NexChat (${label}) é:`,
    expiry: 'Este código expira em 2 minutos.',
    ignore: 'Se você não solicitou este código, ignore este e-mail e procure alterar sua senha por precaução.'
  },
  en: {
    subject: (label) => `[NexChat] Verification code — ${label}`,
    greeting: (label) => `Your NexChat verification code (${label}) is:`,
    expiry: 'This code expires in 2 minutes.',
    ignore: "If you didn't request this code, ignore this email and consider changing your password."
  },
  it: {
    subject: (label) => `[NexChat] Codice di verifica — ${label}`,
    greeting: (label) => `Il tuo codice di verifica NexChat (${label}) è:`,
    expiry: 'Questo codice scade tra 2 minuti.',
    ignore: "Se non hai richiesto questo codice, ignora questa email e considera di cambiare la tua password per sicurezza."
  }
};

function buildEmailHtml(label, code, i18n) {
  return `<!DOCTYPE html>
<html lang="pt">
<body style="margin:0;padding:0;background:#0f0f14;font-family:Arial,Helvetica,sans-serif;">
  <div style="padding:24px;">
    <div style="max-width:420px;margin:0 auto;background:#16161d;border:1px solid #2a2a33;border-radius:12px;padding:24px;color:#e8e8ef;">
      <div style="font-size:20px;font-weight:700;color:#eac847;margin-bottom:12px;">NexChat</div>
      <p style="font-size:14px;line-height:1.5;margin:0 0 16px;color:#cfcfd8;">${i18n.greeting(label)}</p>
      <div style="font-size:30px;font-weight:700;letter-spacing:6px;text-align:center;color:#eac847;background:#0c0c10;border:1px solid #eac847;border-radius:10px;padding:14px;margin:0 0 16px;font-family:'Courier New',monospace;">${code}</div>
      <p style="font-size:13px;line-height:1.5;margin:0 0 8px;color:#cfcfd8;">${i18n.expiry}</p>
      <p style="font-size:12px;line-height:1.5;margin:0;color:#7a7a85;">${i18n.ignore}</p>
    </div>
  </div>
</body>
</html>`;
}

export async function sendCode(user, purpose, lang) {
  const email = user.email;
  if (!email) return false;
  const code = generateCode(purpose);

  await sql('DELETE FROM "AuthCode" WHERE "userId" = $1 AND "purpose" = $2', [user.id, purpose]);

  await sql(
    'INSERT INTO "AuthCode" ("userId", "purpose", "code", "expiresAt") VALUES ($1, $2, $3, now() + interval \'2 minutes\')',
    [user.id, purpose, code]
  );

  const safeLang = EMAIL_I18N[lang] ? lang : 'pt';
  const labels = PURPOSE_LABELS[purpose] || { pt: purpose, en: purpose, it: purpose };
  const label = labels[safeLang] || purpose;
  const i18n = EMAIL_I18N[safeLang];
  const subject = i18n.subject(label);
  const text = `${i18n.greeting(label)}\n\n${code}\n\n${i18n.expiry}\n\n${i18n.ignore}`;
  const html = buildEmailHtml(label, code, i18n);

  return sendNexchatMail({ to: email, subject, text, html });
}

export async function verifyCode(userId, purpose, code) {
  if (!code || typeof code !== 'string') return false;
  const rows = await sql(
    `SELECT * FROM "AuthCode"
     WHERE "userId" = $1 AND "purpose" = $2 AND "consumedAt" IS NULL AND "expiresAt" > now()
     ORDER BY "createdAt" DESC LIMIT 1`,
    [userId, purpose]
  );
  if (rows.length === 0) return false;
  const row = rows[0];
  if (row.code.length !== code.length) return false;
  let ok = false;
  try {
    ok = crypto.timingSafeEqual(Buffer.from(row.code), Buffer.from(code));
  } catch {
    ok = false;
  }
  if (ok) {
    await sql('UPDATE "AuthCode" SET "consumedAt" = now() WHERE id = $1', [row.id]);
  }
  return ok;
}
