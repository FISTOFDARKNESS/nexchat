import webpush from 'web-push';
import { sql } from '@/lib/db';

let _wp = null;
function getWebPush() {
  if (_wp === null) {
    if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
      try {
        webpush.setVapidDetails(
          `mailto:${process.env.SMTP_FROM || 'no-reply@nexchat.app'}`,
          process.env.VAPID_PUBLIC_KEY,
          process.env.VAPID_PRIVATE_KEY
        );
        _wp = webpush;
      } catch (e) {
        console.error('[push] init:', e.message);
        _wp = false;
      }
    } else {
      _wp = false;
    }
  }
  return _wp || null;
}

export async function sendPushNotificationToUser(userId, payload) {
  const wp = getWebPush();
  if (!wp || !userId) return;
  try {
    const rows = await sql(
      'SELECT endpoint, p256dh, auth FROM "PushSubscription" WHERE "userId" = $1',
      [userId]
    );
    for (const sub of rows) {
      try {
        await wp.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(payload)
        );
      } catch (err) {
        if (err.statusCode === 410 || err.statusCode === 404) {
          await sql('DELETE FROM "PushSubscription" WHERE endpoint = $1', [sub.endpoint]).catch(() => {});
        }
      }
    }
  } catch (e) {
    console.error('[push] send:', e.message);
  }
}
