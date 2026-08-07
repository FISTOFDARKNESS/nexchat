export const PREMIUM_PRICE = process.env.NEXT_PUBLIC_PREMIUM_PRICE || process.env.PREMIUM_PRICE || '34.99';
export const PREMIUM_CURRENCY = process.env.NEXT_PUBLIC_PREMIUM_CURRENCY || process.env.PREMIUM_CURRENCY || 'BRL';
export const PREMIUM_DAYS = 30;

export function formatPremiumPrice() {
  const price = String(PREMIUM_PRICE);
  const parts = price.split('.');
  const integer = parts[0] || '0';
  const decimal = (parts[1] || '00').padEnd(2, '0').slice(0, 2);
  return `${integer},${decimal}`;
}
