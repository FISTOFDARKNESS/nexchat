export const PREMIUM_PRICE = process.env.NEXT_PUBLIC_PREMIUM_PRICE || process.env.PREMIUM_PRICE || '34.99';
export const PREMIUM_CURRENCY = process.env.NEXT_PUBLIC_PREMIUM_CURRENCY || process.env.PREMIUM_CURRENCY || 'BRL';
export const PREMIUM_DAYS = 30;
export const BRL_TO_EUR_RATE = parseFloat(process.env.BRL_TO_EUR_RATE || '5.71708');

const EUROPEAN_COUNTRIES = new Set([
  'PT','ES','FR','DE','IT','NL','BE','AT','SE','DK','FI','NO','IE','LU','CH',
  'PL','CZ','GR','HU','RO','BG','HR','SK','SI','LT','LV','EE','MT','CY','IS',
  'LI','MC','SM','VA','AD','MK','ME','RS','AL','BA','XK','GE','AM','AZ','BY','UA','MD','RU','GB'
]);

export function formatPremiumPrice() {
  const price = String(PREMIUM_PRICE);
  const parts = price.split('.');
  const integer = parts[0] || '0';
  const decimal = (parts[1] || '00').padEnd(2, '0').slice(0, 2);
  return `${integer},${decimal}`;
}

export function getPriceForCountry(country) {
  const code = String(country || '').trim().toUpperCase();
  if (!code || !PREMIUM_PRICE) return { price: PREMIUM_PRICE, currency: PREMIUM_CURRENCY };
  if (EUROPEAN_COUNTRIES.has(code)) {
    const eur = (parseFloat(PREMIUM_PRICE) / BRL_TO_EUR_RATE).toFixed(2);
    return { price: eur, currency: 'EUR' };
  }
  return { price: PREMIUM_PRICE, currency: PREMIUM_CURRENCY };
}
