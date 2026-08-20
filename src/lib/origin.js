export function getBaseOrigin(req) {
  const proto = req.headers.get('x-forwarded-proto') || new URL(req.url).protocol.slice(0, -1);
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || new URL(req.url).host;
  return `${proto}://${host}`;
}
