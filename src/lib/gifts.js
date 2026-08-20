import { sql, getPool } from '@/lib/db';
import { createOrder } from '@/lib/paypal';
import { getPlansForLocale } from '@/lib/premium-config';
import { isPremium } from '@/lib/premium';
import { triggerToUser } from '@/lib/realtime';
import { sendPushNotificationToUser } from '@/lib/push';
import { sendNexchatMail } from '@/lib/supportEmail';

export const GIFT_VALIDITY_DAYS = 30;
export const REMINDER_DAYS = [7, 15, 27];

export const GIFT_CRON_SECRET = process.env.GIFT_CRON_SECRET || '';

let schemaPromise = null;

export function ensureGiftSchema() {
  if (schemaPromise) return schemaPromise;
  schemaPromise = (async () => {
    try {
      await sql(`CREATE TABLE IF NOT EXISTS "Gift" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        code TEXT UNIQUE NOT NULL,
        "giverId" UUID NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
        "recipientId" UUID NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
        plan TEXT NOT NULL DEFAULT 'monthly',
        "baseAmount" NUMERIC(10,2) NOT NULL,
        "feeAmount" NUMERIC(10,2) NOT NULL DEFAULT 0,
        "totalAmount" NUMERIC(10,2) NOT NULL,
        currency TEXT NOT NULL DEFAULT 'BRL',
        "daysGranted" INTEGER NOT NULL DEFAULT 30,
        message TEXT,
        "isAnonymous" BOOLEAN NOT NULL DEFAULT false,
        "deliverAt" TIMESTAMPTZ,
        paid BOOLEAN NOT NULL DEFAULT false,
        status TEXT NOT NULL DEFAULT 'PENDING',
        "paypalOrderId" TEXT,
        "acceptedAt" TIMESTAMPTZ,
        "refusedAt" TIMESTAMPTZ,
        "reminderSentAt" TEXT[] NOT NULL DEFAULT '{}',
        "retargetCount" INTEGER NOT NULL DEFAULT 0,
        "retargetedAt" TIMESTAMPTZ,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "expiresAt" TIMESTAMPTZ NOT NULL
      )`);
      await sql(`CREATE INDEX IF NOT EXISTS idx_gift_recipient ON "Gift"("recipientId", status, paid)`);
      await sql(`CREATE INDEX IF NOT EXISTS idx_gift_giver ON "Gift"("giverId", status)`);
      await sql(`CREATE INDEX IF NOT EXISTS idx_gift_pending ON "Gift"(status, paid, "expiresAt")`);
      return true;
    } catch (e) {
      console.error('[gifts] ensureSchema:', e.message);
      return false;
    }
  })();
  return schemaPromise;
}

function giftCode() {
  return `GIFT-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

export const GIFT_FEE_FRIEND = 0.15;
export const GIFT_FEE_STRANGER = 0.30;

export function computeGiftPrice(plan, lang, country, feePct = GIFT_FEE_FRIEND) {
  const planKey = plan === 'yearly' ? 'yearly' : 'monthly';
  const planInfo = getPlansForLocale(lang, country)[planKey];
  const base = parseFloat(planInfo.price);
  const fee = round2(base * feePct);
  return {
    plan: planKey,
    base: round2(base),
    fee,
    feePct,
    total: round2(base + fee),
    currency: planInfo.currency,
    days: planInfo.days,
  };
}

export function planLabel(plan) {
  return plan === 'yearly' ? 'Premium Anual' : 'Premium Mensal';
}

async function getRecipientChecks(recipientId) {
  const rows = await sql(
    `SELECT id, username, email, "avatarUrl", "createdAt", "premiumTier", "premiumExpiresAt", "isGuest"
     FROM "User" WHERE id = $1 LIMIT 1`,
    [recipientId]
  );
  const u = rows[0];
  if (!u) return { user: null, checks: null };
  return {
    user: u,
    checks: {
      isGoogle: !!u.email && !u.isGuest,
      hasPremium: isPremium(u),
      accountDays: Math.floor((Date.now() - new Date(u.createdAt).getTime()) / 86400000),
    },
  };
}

async function friendshipInfo(userId, friendId) {
  const rows = await sql(
    `SELECT * FROM "Friendship"
     WHERE status = 'ACCEPTED'
       AND (("userId1" = $1 AND "userId2" = $2) OR ("userId1" = $2 AND "userId2" = $1))
     LIMIT 1`,
    [userId, friendId]
  );
  if (rows.length === 0) return null;
  return {
    days: Math.floor((Date.now() - new Date(rows[0].createdAt).getTime()) / 86400000),
    createdAt: rows[0].createdAt,
  };
}

export async function hasPendingGift(recipientId, excludeId = null) {
  const rows = await sql(
    `SELECT 1 FROM "Gift"
     WHERE "recipientId" = $1 AND paid = true AND status = 'PENDING' AND "expiresAt" > now()
       AND ($2::uuid IS NULL OR id <> $2)
     LIMIT 1`,
    [recipientId, excludeId]
  );
  return rows.length > 0;
}

export async function createGift({ giverId, recipientId, plan = 'monthly', lang = 'pt', message = '', isAnonymous = false, deliverAt = null, origin = 'http://localhost:3000' }) {
  const ok = await ensureGiftSchema();
  if (!ok) return { error: 'Erro ao inicializar o sistema de presentes', errorKey: 'giftErrInit' };
  if (!recipientId) return { error: 'Selecione um amigo para receber o presente', errorKey: 'giftErrPickFriend' };

  const giver = (await sql('SELECT id, email, country FROM "User" WHERE id = $1 LIMIT 1', [giverId]))[0];
  if (!giver) return { error: 'Doador não encontrado', errorKey: 'giftErrGiverNotFound' };
  if (!giver.email) return { error: 'Apenas contas com login Google podem enviar presentes', errorKey: 'giftErrGoogleGiver' };

  const friend = await friendshipInfo(giverId, recipientId);
  
  const isFriend = !!friend;
  const feePct = isFriend ? GIFT_FEE_FRIEND : GIFT_FEE_STRANGER;

  const rc = await getRecipientChecks(recipientId);
  if (!rc.checks) return { error: 'Destinatário não encontrado', errorKey: 'giftErrRecipientNotFound' };
  if (!rc.checks.isGoogle) return { error: 'O amigo precisa estar logado com Google para receber o presente', errorKey: 'giftErrGoogleRecipient' };
  if (rc.checks.hasPremium) return { error: 'O amigo já possui uma assinatura Premium ativa', errorKey: 'giftErrPremium' };
  if (await hasPendingGift(recipientId)) return { error: 'Este amigo já tem um presente pendente de aceite. Espere ele aceitar, recusar ou expirar.', errorKey: 'giftErrPending' };

  const price = computeGiftPrice(plan, lang, giver.country, feePct);
  const code = giftCode();

  let deliver = null;
  if (!deliverAt) return { error: 'Escolha uma data de entrega', errorKey: 'giftErrDateRequired' };
  deliver = new Date(deliverAt);
  if (isNaN(deliver.getTime())) return { error: 'Data de entrega inválida', errorKey: 'giftErrInvalidDate' };
  if (deliver.getTime() < Date.now()) return { error: 'A data de entrega não pode estar no passado', errorKey: 'giftErrDatePast' };
  const availableAt = deliver || new Date();
  const expiresAt = new Date(availableAt.getTime() + GIFT_VALIDITY_DAYS * 86400000);

  const returnUrl = `${origin}/api/gifts/capture?code=${encodeURIComponent(code)}`;
  const cancelUrl = `${origin}/?gift=cancelled`;
  let order;
  try {
    order = await createOrder(
      returnUrl,
      cancelUrl,
      price.total.toFixed(2),
      price.currency,
      price.plan === 'yearly' ? 'NexChat Premium Anual (Presente para amigo)' : 'NexChat Premium Mensal (Presente para amigo)'
    );
  } catch (e) {
    console.error('[gifts] createOrder:', e.message);
    return { error: 'Falha ao iniciar o pagamento no PayPal. Tente novamente.', errorKey: 'giftErrPaypal' };
  }

  await sql(
    `INSERT INTO "Gift"
       (code, "giverId", "recipientId", plan, "baseAmount", "feeAmount", "totalAmount", currency,
        "daysGranted", message, "isAnonymous", "deliverAt", "expiresAt", "paypalOrderId")
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
    [code, giverId, recipientId, price.plan, price.base, price.fee, price.total, price.currency,
      price.days, (message || '').trim() ? message.trim() : null, !!isAnonymous, deliver, expiresAt, order.id]
  );

  return {
    success: true,
    code,
    approveUrl: order.links?.find((l) => l.rel === 'approve')?.href,
    breakdown: { ...price, isFriend },
    expiresAt,
  };
}

export async function captureGift(code, orderId, origin = 'http://localhost:3000') {
  const rows = await sql('SELECT * FROM "Gift" WHERE code = $1 LIMIT 1', [code]);
  if (rows.length === 0) return { error: 'Presente não encontrado', errorKey: 'giftErrNotFound' };
  const gift = rows[0];

  if (orderId && gift.paypalOrderId && gift.paypalOrderId !== orderId) {
    return { error: 'Pedido de pagamento não corresponde a este presente', errorKey: 'giftErrOrderMismatch' };
  }
  if (gift.paid) {
    return { success: true, gift };
  }

  const updated = await sql(
    `UPDATE "Gift" SET paid = true, "paypalOrderId" = COALESCE($2, "paypalOrderId")
     WHERE code = $1 RETURNING *`,
    [code, orderId]
  );
  const g = updated[0];

  const deliverAt = g.deliverAt ? new Date(g.deliverAt) : null;
  if (!deliverAt || deliverAt.getTime() <= Date.now()) {
    await notifyGiftReceived(g, origin);
  }
  return { success: true, gift: g };
}

async function notifyGiftReceived(gift, origin = 'http://localhost:3000') {
  const recipient = (await sql('SELECT id, username, email FROM "User" WHERE id = $1 LIMIT 1', [gift.recipientId]))[0];
  if (!recipient) return;
  const giver = gift.isAnonymous
    ? null
    : (await sql('SELECT username, "avatarUrl" FROM "User" WHERE id = $1 LIMIT 1', [gift.giverId]))[0];
  const giverName = gift.isAnonymous ? 'Anônimo' : (giver?.username || 'Seu amigo');
  const label = planLabel(gift.plan);
  const url = `/gift/${gift.code}`;
  const expDate = new Date(gift.expiresAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

  await triggerToUser(gift.recipientId, 'gift_received', {
    code: gift.code,
    giverName,
    plan: gift.plan,
    isAnonymous: gift.isAnonymous,
    message: gift.message || '',
    url,
  }).catch(() => {});

  await sendPushNotificationToUser(gift.recipientId, {
    title: '🎁 Você recebeu um presente Premium!',
    body: `${giverName} te enviou ${label}. Abra antes de ${expDate} para não perder!`,
    icon: '/icon.png',
    badge: '/icon.png',
    tag: `gift_${gift.code}`,
    data: { url },
  }).catch(() => {});

  if (recipient.email) {
    await sendNexchatMail({
      to: recipient.email,
      subject: `🎁 ${giverName} te enviou ${label} no NexChat!`,
      text: `${giverName} te enviou ${label} no NexChat.\n${gift.message ? `Mensagem: "${gift.message}"\n` : ''}\nAceite antes de ${expDate} (30 dias de validade, sem reembolso após expirar):\n${origin}${url}`,
      html: `<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:auto;border:1px solid #333;border-radius:14px;padding:28px;background:#16161c;color:#eee">
        <div style="font-size:44px;text-align:center;margin-bottom:8px">🎁</div>
        <h2 style="color:#EAC847;text-align:center;margin:8px 0">${giverName} te enviou um presente!</h2>
        <p style="text-align:center;color:#ccc">${label} — expira em <b style="color:#fff">${expDate}</b></p>
        ${gift.message ? `<p style="font-style:italic;text-align:center;color:#aaa;border-left:3px solid #EAC847;padding:6px 12px;margin:14px 0">"${gift.message}"</p>` : ''}
        <div style="text-align:center;margin-top:18px">
          <a href="${origin}${url}" style="background:linear-gradient(135deg,#EAC847,#D97706);color:#111;padding:13px 26px;border-radius:10px;text-decoration:none;font-weight:bold;display:inline-block">Abrir presente</a>
        </div>
        <p style="font-size:11px;color:#777;text-align:center;margin-top:18px">O presente expira em 30 dias sem reembolso.</p>
      </div>`,
    });
  }
}

async function sendGiftReminder(gift, dayLeft, origin = 'http://localhost:3000') {
  const recipient = (await sql('SELECT id, email FROM "User" WHERE id = $1 LIMIT 1', [gift.recipientId]))[0];
  if (!recipient) return;
  const giver = gift.isAnonymous ? null : (await sql('SELECT username FROM "User" WHERE id = $1 LIMIT 1', [gift.giverId]))[0];
  const giverName = gift.isAnonymous ? 'Anônimo' : (giver?.username || 'Seu amigo');
  const label = planLabel(gift.plan);
  const url = `/gift/${gift.code}`;
  const expDate = new Date(gift.expiresAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

  await triggerToUser(gift.recipientId, 'gift_received', {
    code: gift.code, giverName, plan: gift.plan, isAnonymous: gift.isAnonymous, message: gift.message || '', url,
  }).catch(() => {});

  await sendPushNotificationToUser(gift.recipientId, {
    title: `⏳ Seu presente expira em ${dayLeft} dia${dayLeft > 1 ? 's' : ''}!`,
    body: `${giverName} te enviou ${label}. Resgate antes de ${expDate} para não perder.`,
    icon: '/icon.png', badge: '/icon.png', tag: `gift_${gift.code}`,
    data: { url },
  }).catch(() => {});

  if (recipient.email) {
    await sendNexchatMail({
      to: recipient.email,
      subject: `⏳ Seu presente Premium expira em ${dayLeft} dia${dayLeft > 1 ? 's' : ''}`,
      text: `O presente de ${giverName} (${label}) expira em ${dayLeft} dia(s). Depois disso não há reembolso.\nResgate agora: ${origin}${url}`,
      html: `<div style="font-family:Arial;max-width:520px;margin:auto;border:1px solid #333;border-radius:14px;padding:28px;background:#16161c;color:#eee">
        <div style="font-size:40px;text-align:center">⏳</div>
        <h2 style="color:#EAC847;text-align:center">Faltam ${dayLeft} dia${dayLeft > 1 ? 's' : ''} para o seu presente expirar!</h2>
        <p style="text-align:center;color:#ccc">${giverName} te enviou ${label} no NexChat.</p>
        <div style="text-align:center;margin-top:18px">
          <a href="${origin}${url}" style="background:linear-gradient(135deg,#EAC847,#D97706);color:#111;padding:13px 26px;border-radius:10px;text-decoration:none;font-weight:bold;display:inline-block">Resgatar agora</a>
        </div>
      </div>`,
    });
  }
}

export async function acceptGift(code, recipientId) {
  const rows = await sql('SELECT * FROM "Gift" WHERE code = $1 LIMIT 1', [code]);
  if (rows.length === 0) return { error: 'Presente não encontrado', errorKey: 'giftErrNotFound' };
  const gift = rows[0];
  if (gift.recipientId !== recipientId) return { error: 'Este presente não foi enviado para você', errorKey: 'giftErrNotYours' };
  if (!gift.paid) return { error: 'Este presente ainda não foi pago', errorKey: 'giftErrUnpaid' };
  if (gift.status !== 'PENDING') return { error: 'Este presente não está mais disponível para aceite', errorKey: 'giftErrUnavailable' };
  if (gift.expiresAt && new Date(gift.expiresAt) <= new Date()) {
    await sql(`UPDATE "Gift" SET status = 'EXPIRED' WHERE id = $1 AND status = 'PENDING'`, [gift.id]);
    return { error: 'Este presente expirou', errorKey: 'giftErrExpired' };
  }
  if (gift.deliverAt && new Date(gift.deliverAt) > new Date()) return { error: 'Este presente ainda não foi entregue', errorKey: 'giftErrNotDelivered' };

  const rc = await getRecipientChecks(recipientId);
  if (!rc.checks.isGoogle) return { error: 'Para aceitar o presente você precisa estar logado com Google', errorKey: 'giftErrGoogleAccept' };
  if (rc.checks.hasPremium) return { error: 'Você já possui uma assinatura Premium ativa. Não é possível acumular.', errorKey: 'giftErrPremiumSelf' };
  if (await hasPendingGift(recipientId, gift.id)) return { error: 'Você já tem outro presente pendente de aceite', errorKey: 'giftErrPendingSelf' };

  const pool = getPool();
  if (!pool) return { error: 'Banco de dados indisponível' };
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const updated = await client.query(
      `UPDATE "Gift" SET status = 'ACCEPTED', "acceptedAt" = now()
       WHERE code = $1 AND status = 'PENDING' RETURNING *`,
      [code]
    );
    if (updated.rows.length === 0) {
      await client.query('ROLLBACK');
      return { error: 'Este presente não está mais disponível', errorKey: 'giftErrUnavailable' };
    }
    const now = new Date();
    const expires = new Date(now.getTime() + (gift.daysGranted || 30) * 86400000);
    await client.query(
      `UPDATE "User" SET "premiumTier" = 'premium', "premiumSince" = $1, "premiumExpiresAt" = $2 WHERE id = $3`,
      [now, expires, recipientId]
    );
    await client.query('COMMIT');
    await triggerToUser(gift.giverId, 'gift_accepted', { code: gift.code }).catch(() => {});
    return { success: true, days: gift.daysGranted, expires };
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[gifts] accept:', e.message);
    return { error: 'Erro ao aceitar o presente. Tente novamente.', errorKey: 'giftErrAcceptFail' };
  } finally {
    client.release();
  }
}

export async function refuseGift(code, recipientId) {
  const updated = await sql(
    `UPDATE "Gift" SET status = 'REFUSED', "refusedAt" = now()
     WHERE code = $1 AND "recipientId" = $2 AND paid = true AND status = 'PENDING'
     RETURNING *`,
    [code, recipientId]
  );
  if (updated.length === 0) return { error: 'Presente não encontrado ou já finalizado', errorKey: 'giftErrNotFoundFinalized' };
  await triggerToUser(updated[0].giverId, 'gift_refused', { code }).catch(() => {});
  return { success: true };
}

export async function retargetGift(code, giverId, newRecipientId, lang = 'pt', origin = 'http://localhost:3000') {
  const rows = await sql('SELECT * FROM "Gift" WHERE code = $1 LIMIT 1', [code]);
  if (rows.length === 0) return { error: 'Presente não encontrado', errorKey: 'giftErrNotFound' };
  const gift = rows[0];
  if (gift.giverId !== giverId) return { error: 'Você não é o doador deste presente', errorKey: 'giftErrNotGiver' };
  if (!gift.paid) return { error: 'Este presente ainda não foi pago', errorKey: 'giftErrUnpaid' };
  if (gift.status !== 'REFUSED') return { error: 'O presente precisa ter sido recusado para trocar de destinatário', errorKey: 'giftErrNeedRefused' };
  if (gift.expiresAt && new Date(gift.expiresAt) <= new Date()) return { error: 'Este presente expirou e não pode mais ser reenviado', errorKey: 'giftErrExpiredResend' };
  if (newRecipientId === giverId) return { error: 'Escolha um amigo diferente de você', errorKey: 'giftErrSelf' };

  const rc = await getRecipientChecks(newRecipientId);
  if (!rc.checks) return { error: 'Destinatário não encontrado', errorKey: 'giftErrRecipientNotFound' };
  if (!rc.checks.isGoogle) return { error: 'O novo amigo precisa estar logado com Google', errorKey: 'giftErrGoogleRecipient' };
  if (rc.checks.hasPremium) return { error: 'O novo amigo já possui Premium ativo', errorKey: 'giftErrPremium' };
  if (await hasPendingGift(newRecipientId)) return { error: 'O novo amigo já tem um presente pendente de aceite', errorKey: 'giftErrPending' };

  const expiresAt = new Date(Date.now() + GIFT_VALIDITY_DAYS * 86400000);
  const updated = await sql(
    `UPDATE "Gift"
     SET "recipientId" = $2, status = 'PENDING', "refusedAt" = NULL, "deliverAt" = NULL,
         "expiresAt" = $3, "retargetCount" = "retargetCount" + 1, "retargetedAt" = now()
     WHERE code = $1 RETURNING *`,
    [code, newRecipientId, expiresAt]
  );
  if (updated.length === 0) return { error: 'Não foi possível reenviar o presente', errorKey: 'giftErrRetargetFail' };
  await notifyGiftReceived(updated[0], origin);
  return { success: true, expiresAt };
}

export async function processGiftMaintenance(origin = 'http://localhost:3000') {
  const ok = await ensureGiftSchema();
  if (!ok) return { reminders: 0, expired: 0 };
  let reminders = 0;
  let expired = 0;

  const due = await sql(
    `SELECT * FROM "Gift" WHERE paid = true AND status = 'PENDING'`
  );
  for (const g of due) {
    const expiresAt = g.expiresAt ? new Date(g.expiresAt) : null;
    if (expiresAt && expiresAt.getTime() <= Date.now()) {
      const res = await sql(`UPDATE "Gift" SET status = 'EXPIRED' WHERE id = $1 AND status = 'PENDING' RETURNING id`, [g.id]);
      if (res.length > 0) expired++;
      continue;
    }
    if (g.deliverAt && new Date(g.deliverAt).getTime() > Date.now()) continue; 

    const availableAt = g.deliverAt && new Date(g.deliverAt).getTime() > new Date(g.createdAt).getTime()
      ? new Date(g.deliverAt)
      : new Date(g.createdAt);
    const day = Math.floor((Date.now() - availableAt.getTime()) / 86400000);
    const sent = Array.isArray(g.reminderSentAt) ? g.reminderSentAt : [];
    for (const d of REMINDER_DAYS) {
      if (day >= d && !sent.includes(String(d))) {
        try {
          await sendGiftReminder(g, d, origin);
          await sql(`UPDATE "Gift" SET "reminderSentAt" = array_append(COALESCE("reminderSentAt", '{}'), $2) WHERE id = $1`, [g.id, String(d)]);
          reminders++;
        } catch (e) {
          console.error('[gifts] reminder', g.code, e.message);
        }
      }
    }
  }
  return { reminders, expired };
}
