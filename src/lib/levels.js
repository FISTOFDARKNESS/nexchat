import { sql } from '@/lib/db';
import { isPremium } from '@/lib/premium';

export const MAX_LEVEL = 100;
export const STREAK_MAX_RECOVERIES_PER_MONTH = 3;
export const NO_REPLY_CAPTCHA_THRESHOLD = 20;
export const CALL_EXP_INTERVAL_SECONDS = 300; 

export const EXP_COOLDOWN_MS = parseInt(process.env.EXP_COOLDOWN_MS || '4000', 10);       
export const EXP_DAILY_CAP_PER_PAIR = parseInt(process.env.EXP_DAILY_CAP_PER_PAIR || '150', 10); 
export const EXP_MIN_TEXT_LENGTH = parseInt(process.env.EXP_MIN_TEXT_LENGTH || '5', 10);   

export const EXP_MESSAGE_FRIEND = 2;
export const EXP_MESSAGE_STRANGER = 1;
export const EXP_CALL_FRIEND_PER_BLOCK = 15;   
export const EXP_CALL_STRANGER = 5;            
export const PREMIUM_EXP_MULTIPLIER = 3;

let _schemaPromise = null;
export function ensureLevelsSchema() {
  if (_schemaPromise) return _schemaPromise;
  _schemaPromise = (async () => {
    try {
      await sql(`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS level INTEGER NOT NULL DEFAULT 1`);
      await sql(`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS exp INTEGER NOT NULL DEFAULT 0`);
      await sql(`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "streakCount" INTEGER NOT NULL DEFAULT 0`);
      await sql(`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "streakLastDate" DATE`);
      await sql(`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "streakRecoveriesUsed" INTEGER NOT NULL DEFAULT 0`);
      await sql(`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "streakRecoveryMonth" TEXT`);
      await sql(`CREATE TABLE IF NOT EXISTS "NoReplyCounter" (
        "userId" TEXT NOT NULL,
        "peerId" TEXT NOT NULL,
        count INTEGER NOT NULL DEFAULT 0,
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY ("userId", "peerId")
      )`);
      await sql(`CREATE TABLE IF NOT EXISTS "UnbanPayment" (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "userId" UUID NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
        "orderId" TEXT UNIQUE,
        status TEXT NOT NULL DEFAULT 'CREATED',
        amount NUMERIC(10,2) NOT NULL,
        currency TEXT NOT NULL DEFAULT 'EUR',
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "capturedAt" TIMESTAMPTZ
      )`);
      await sql(`CREATE TABLE IF NOT EXISTS "ExpAntiFarm" (
        "userId" TEXT NOT NULL,
        "peerId" TEXT NOT NULL,
        day DATE NOT NULL,
        exp INTEGER NOT NULL DEFAULT 0,
        "lastExpAt" TIMESTAMPTZ,
        "lastContent" TEXT,
        PRIMARY KEY ("userId", "peerId", day)
      )`);
      return true;
    } catch (e) {
      console.error('[levels] ensureSchema:', e.message);
      return false;
    }
  })();
  return _schemaPromise;
}

export function expRequiredForLevel(level) {
  if (level <= 1) return 0;
  return 100 * level * (level - 1) / 2;
}

export function expToNextLevel(level) {
  return expRequiredForLevel(level + 1) - expRequiredForLevel(level);
}

export function expProgress(level, exp) {
  const cur = expRequiredForLevel(level);
  const next = expRequiredForLevel(level + 1);
  const into = Math.max(0, Math.min(next - cur, exp - cur));
  return { into, needed: Math.max(1, next - cur), pct: Math.min(100, Math.round((into / Math.max(1, next - cur)) * 100)) };
}

export function calcLevel(exp) {
  let level = 1;
  while (level < MAX_LEVEL && exp >= expRequiredForLevel(level + 1)) level++;
  return level;
}

export async function getLevelStats(userId) {
  const ok = await ensureLevelsSchema();
  if (!ok) return null;
  const rows = await sql(
    `SELECT level, exp, "streakCount", "streakLastDate", "streakRecoveriesUsed", "streakRecoveryMonth",
            "premiumTier", "premiumExpiresAt"
     FROM "User" WHERE id = $1 LIMIT 1`,
    [userId]
  );
  const u = rows[0];
  if (!u) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const last = u.streakLastDate ? new Date(u.streakLastDate) : null;
  const daysSince = last ? Math.round((today - new Date(last.getFullYear(), last.getMonth(), last.getDate())) / 86400000) : null;
  const broken = last !== null && daysSince > 1;
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  return {
    level: u.level || 1,
    exp: u.exp || 0,
    expToNext: expToNextLevel(u.level || 1),
    progress: expProgress(u.level || 1, u.exp || 0),
    streakCount: u.streakCount || 0,
    streakLastDate: u.streakLastDate,
    streakBroken: broken,
    streakRecoveriesUsed: u.streakRecoveryMonth === monthKey ? (u.streakRecoveriesUsed || 0) : 0,
    streakRecoveriesMax: STREAK_MAX_RECOVERIES_PER_MONTH,
    premium: isPremium(u),
  };
}

export async function awardExp(userId, baseExp, { friend = true } = {}) {
  const ok = await ensureLevelsSchema();
  if (!ok || !baseExp || baseExp <= 0) return null;
  const rows = await sql(
    `SELECT level, exp, "premiumTier", "premiumExpiresAt" FROM "User" WHERE id = $1 LIMIT 1`,
    [userId]
  );
  const u = rows[0];
  if (!u) return null;
  const mult = isPremium(u) ? PREMIUM_EXP_MULTIPLIER : 1;
  const gained = Math.round(baseExp * mult);
  const newExp = (u.exp || 0) + gained;
  const newLevel = calcLevel(newExp);
  await sql(`UPDATE "User" SET exp = $2, level = $3 WHERE id = $1`, [userId, newExp, newLevel]);
  const levelUp = newLevel > (u.level || 1);
  return { gained, exp: newExp, level: newLevel, levelUp, ...(await getLevelStats(userId)) };
}

export async function bumpStreak(userId) {
  const ok = await ensureLevelsSchema();
  if (!ok) return null;
  const rows = await sql(`SELECT "streakCount", "streakLastDate" FROM "User" WHERE id = $1 LIMIT 1`, [userId]);
  const u = rows[0];
  if (!u) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const last = u.streakLastDate ? new Date(u.streakLastDate) : null;
  const lastDay = last ? new Date(last.getFullYear(), last.getMonth(), last.getDate()) : null;
  let count = u.streakCount || 0;
  if (lastDay && lastDay.getTime() === today.getTime()) {
    
  } else if (lastDay && (today - lastDay) / 86400000 === 1) {
    count += 1;
  } else {
    count = 1;
  }
  await sql(
    `UPDATE "User" SET "streakCount" = $2, "streakLastDate" = $3::date WHERE id = $1`,
    [userId, count, today.toISOString().slice(0, 10)]
  );
  return count;
}

export async function recoverStreak(userId) {
  const ok = await ensureLevelsSchema();
  if (!ok) return { error: 'Erro ao recuperar streak' };
  const stats = await getLevelStats(userId);
  if (!stats) return { error: 'Usuário não encontrado' };
  if (!stats.streakBroken) return { error: 'Sua streak não está quebrada' };
  if (stats.streakRecoveriesUsed >= STREAK_MAX_RECOVERIES_PER_MONTH) {
    return { error: `Limite de ${STREAK_MAX_RECOVERIES_PER_MONTH} recuperações por mês atingido` };
  }
  const now = new Date();
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  await sql(
    `UPDATE "User"
     SET "streakLastDate" = $2::date,
         "streakRecoveriesUsed" = CASE WHEN "streakRecoveryMonth" = $3 THEN "streakRecoveriesUsed" + 1 ELSE 1 END,
         "streakRecoveryMonth" = $3
     WHERE id = $1`,
    [userId, yesterday.toISOString().slice(0, 10), monthKey]
  );
  return { success: true, ...(await getLevelStats(userId)) };
}

export async function getNoReplyCount(userId, peerId) {
  try {
    const rows = await sql(
      `SELECT count FROM "NoReplyCounter" WHERE "userId" = $1 AND "peerId" = $2 LIMIT 1`,
      [userId, peerId]
    );
    return rows.length > 0 ? Number(rows[0].count) : 0;
  } catch {
    return 0;
  }
}

export async function bumpNoReply(userId, peerId) {
  try {
    await sql(
      `INSERT INTO "NoReplyCounter" ("userId", "peerId", count, "updatedAt")
       VALUES ($1, $2, 1, now())
       ON CONFLICT ("userId", "peerId") DO UPDATE
         SET count = "NoReplyCounter".count + 1, "updatedAt" = now()`,
      [userId, peerId]
    );
  } catch (e) {
    console.error('[levels] bumpNoReply:', e.message);
  }
}

export async function resetNoReply(userId, peerId) {
  try {
    await sql(`DELETE FROM "NoReplyCounter" WHERE "userId" = $1 AND "peerId" = $2`, [userId, peerId]);
  } catch {}
}

export async function requiresCaptcha(userId, peerId) {
  const ok = await ensureLevelsSchema();
  if (!ok) return false;
  if (!process.env.RECAPTCHA_SECRET_KEY) return false; 
  return (await getNoReplyCount(userId, peerId)) >= NO_REPLY_CAPTCHA_THRESHOLD;
}

const EMOJI_RE = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B50}\u{2764}\u{FE0F}\u{00A9}\u{00AE}]/gu;

export function normalizeExpText(content) {
  if (typeof content !== 'string') return '';
  return content
    .replace(EMOJI_RE, '')
    .replace(/\p{Extended_Pictographic}/gu, '')
    .replace(/\s+/g, '')
    .toLowerCase();
}

async function getExpAntiFarmRow(userId, peerId) {
  const day = new Date();
  const dayKey = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
  const rows = await sql(
    `SELECT exp, "lastExpAt", "lastContent" FROM "ExpAntiFarm" WHERE "userId" = $1 AND "peerId" = $2 AND day = $3::date LIMIT 1`,
    [userId, peerId, dayKey]
  );
  return rows[0] || { exp: 0, lastExpAt: null, lastContent: null };
}

export async function expMessageEligible(userId, peerId, content) {
  const ok = await ensureLevelsSchema();
  if (!ok) return { ok: false, reason: 'short' };
  const normalized = normalizeExpText(content);
  if (normalized.length < EXP_MIN_TEXT_LENGTH) return { ok: false, reason: 'short' };
  const row = await getExpAntiFarmRow(userId, peerId);
  if (row.lastContent === normalized) return { ok: false, reason: 'repeat' };
  if (row.lastExpAt) {
    const last = new Date(row.lastExpAt).getTime();
    if (Date.now() - last < EXP_COOLDOWN_MS) return { ok: false, reason: 'cooldown' };
  }
  if ((row.exp || 0) >= EXP_DAILY_CAP_PER_PAIR) return { ok: false, reason: 'dailyCap' };
  return { ok: true, normalized };
}

export async function awardExpForMessage(userId, peerId, content, baseExp, opts = {}) {
  const check = await expMessageEligible(userId, peerId, content);
  if (!check.ok) return { eligible: false, reason: check.reason };
  const res = await awardExp(userId, baseExp, opts);
  if (!res) return { eligible: false, reason: 'short' };
  const day = new Date();
  const dayKey = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
  await sql(
    `INSERT INTO "ExpAntiFarm" ("userId", "peerId", day, exp, "lastExpAt", "lastContent")
     VALUES ($1, $2, $3::date, $4, now(), $5)
     ON CONFLICT ("userId", "peerId", day) DO UPDATE
       SET exp = "ExpAntiFarm".exp + $4, "lastExpAt" = now(), "lastContent" = $5`,
    [userId, peerId, dayKey, res.gained, check.normalized]
  );
  return { eligible: true, ...res };
}

export async function awardExpForCall(userId, peerId, baseExp, opts = {}) {
  const ok = await ensureLevelsSchema();
  if (!ok) return null;
  const row = await getExpAntiFarmRow(userId, peerId);
  if ((row.exp || 0) >= EXP_DAILY_CAP_PER_PAIR) return null;
  const res = await awardExp(userId, baseExp, opts);
  if (!res) return null;
  const day = new Date();
  const dayKey = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
  await sql(
    `INSERT INTO "ExpAntiFarm" ("userId", "peerId", day, exp)
     VALUES ($1, $2, $3::date, $4)
     ON CONFLICT ("userId", "peerId", day) DO UPDATE SET exp = "ExpAntiFarm".exp + $4`,
    [userId, peerId, dayKey, res.gained]
  );
  return res;
}
