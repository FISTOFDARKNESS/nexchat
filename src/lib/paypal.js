import { PREMIUM_PRICE, PREMIUM_CURRENCY } from '@/lib/premium';

const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID || '';
const PAYPAL_CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET || '';
const PAYPAL_MODE = process.env.PAYPAL_MODE || 'sandbox'; // sandbox | live

const BASE_URL = PAYPAL_MODE === 'live'
  ? 'https://api-m.paypal.com'
  : 'https://api-m.sandbox.paypal.com';

async function getAccessToken() {
  const auth = Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`).toString('base64');
  const res = await fetch(`${BASE_URL}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) throw new Error('Falha ao autenticar no PayPal');
  const data = await res.json();
  return data.access_token;
}

export async function createOrder(returnUrl, cancelUrl) {
  const token = await getAccessToken();
  const res = await fetch(`${BASE_URL}/v2/checkout/orders`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      intent: 'CAPTURE',
      purchase_units: [
        {
          amount: {
            currency_code: PREMIUM_CURRENCY,
            value: PREMIUM_PRICE,
          },
          description: 'NexChat Premium - 30 dias',
        },
      ],
      application_context: {
        brand_name: 'NexChat',
        landing_page: 'LOGIN',
        user_action: 'PAY_NOW',
        return_url: returnUrl,
        cancel_url: cancelUrl,
      },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`PayPal createOrder error: ${err}`);
  }
  return res.json();
}

export async function captureOrder(orderId) {
  const token = await getAccessToken();
  const res = await fetch(`${BASE_URL}/v2/checkout/orders/${orderId}/capture`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`PayPal captureOrder error: ${err}`);
  }
  return res.json();
}

export function getPremiumPrice() {
  return {
    price: PREMIUM_PRICE,
    currency: PREMIUM_CURRENCY,
    days: 30,
  };
}
