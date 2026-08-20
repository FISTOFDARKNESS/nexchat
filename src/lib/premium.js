import { sql } from '@/lib/db';
import { PREMIUM_PRICE, PREMIUM_CURRENCY, PREMIUM_DAYS } from './premium-config';

export { PREMIUM_PRICE, PREMIUM_CURRENCY, PREMIUM_DAYS };

export function formatPremiumPrice() {
  const price = String(PREMIUM_PRICE);
  const parts = price.split('.');
  const integer = parts[0] || '0';
  const decimal = (parts[1] || '00').padEnd(2, '0').slice(0, 2);
  return `${integer},${decimal}`;
}

export async function grantPremium(userId, days = 30) {
  const now = new Date();
  const expires = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  const result = await sql(
    `UPDATE "User"
     SET "premiumTier" = 'premium', "premiumSince" = $1, "premiumExpiresAt" = $2
     WHERE id = $3
     RETURNING *`,
    [now, expires, userId]
  );
  return result[0];
}

export async function revokePremium(userId) {
  const result = await sql(
    `UPDATE "User"
     SET "premiumTier" = 'free', "premiumSince" = NULL, "premiumExpiresAt" = NULL
     WHERE id = $1
     RETURNING *`,
    [userId]
  );
  return result[0];
}

export function isPremium(user) {
  if (!user) return false;
  if (user.premiumTier !== 'premium') return false;
  if (!user.premiumExpiresAt) return false;
  return new Date(user.premiumExpiresAt) > new Date();
}

export async function getUserPremiumStatus(userId) {
  const user = await sql(
    `SELECT "premiumTier", "premiumSince", "premiumExpiresAt", "chatTheme", "invisibleMode"
     FROM "User" WHERE id = $1 LIMIT 1`,
    [userId]
  );
  const u = user[0] || {};
  return {
    premium: isPremium(u),
    tier: isPremium(u) ? 'premium' : 'free',
    premiumSince: u.premiumSince,
    premiumExpiresAt: u.premiumExpiresAt,
    chatTheme: u.chatTheme,
    invisibleMode: u.invisibleMode,
  };
}
