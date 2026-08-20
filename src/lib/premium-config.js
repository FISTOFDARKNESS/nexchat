export const PREMIUM_PRICE = process.env.NEXT_PUBLIC_PREMIUM_PRICE || process.env.PREMIUM_PRICE || '34.99';
export const PREMIUM_CURRENCY = process.env.NEXT_PUBLIC_PREMIUM_CURRENCY || process.env.PREMIUM_CURRENCY || 'BRL';
export const PREMIUM_DAYS = 30;
export const PREMIUM_YEARLY_DAYS = 365;
export const YEARLY_DISCOUNT = 0.5;
export const BRL_TO_EUR_RATE = parseFloat(process.env.BRL_TO_EUR_RATE || '5.71708');
export const BRL_TO_USD_RATE = parseFloat(process.env.BRL_TO_USD_RATE || '5.35');

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

export function getPriceForLocale(lang, country) {
  const code = String(country || '').trim().toUpperCase();
  const base = PREMIUM_PRICE;
  if (lang === 'it') {
    return { price: (parseFloat(base) / BRL_TO_EUR_RATE).toFixed(2), currency: 'EUR' };
  }
  if (lang === 'en') {
    return { price: (parseFloat(base) / BRL_TO_USD_RATE).toFixed(2), currency: 'USD' };
  }
  if (code && EUROPEAN_COUNTRIES.has(code)) {
    return { price: (parseFloat(base) / BRL_TO_EUR_RATE).toFixed(2), currency: 'EUR' };
  }
  return { price: base, currency: PREMIUM_CURRENCY };
}

export function getPlansForLocale(lang, country) {
  const { price, currency } = getPriceForLocale(lang, country);
  const monthly = parseFloat(price);
  const yearly = (monthly * 12 * YEARLY_DISCOUNT).toFixed(2);
  return {
    monthly: { price: monthly.toFixed(2), currency, days: PREMIUM_DAYS },
    yearly: { price: yearly, currency, days: PREMIUM_YEARLY_DAYS }
  };
}
