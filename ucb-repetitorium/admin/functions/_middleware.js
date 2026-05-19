/**
 * Cloudflare Pages Functions middleware
 * Protects /dashboard.html and /api/bookings, /api/leads (but NOT public endpoints)
 *
 * Required env vars:
 *  - AUTH_SECRET
 */

export async function onRequest(context) {
  const { request, env, next } = context;
  const url = new URL(request.url);
  const path = url.pathname;

  // Public paths (no auth required)
  const publicPaths = [
    '/',
    '/index.html',
    '/api/auth',           // login endpoint itself
    '/api/create-checkout', // called by public site
    '/api/stripe-webhook',  // called by Stripe
    '/api/submit-lead',     // called by public site
  ];
  const isPublic = publicPaths.includes(path) || path.startsWith('/favicon') || path.startsWith('/_emails');
  if (isPublic) {
    return next();
  }

  // Protected paths — check auth cookie
  const cookie = request.headers.get('Cookie') || '';
  const match = cookie.match(/ucb_admin=([^;]+)/);
  const token = match ? match[1] : null;
  
  const ok = await verifyToken(token, env.AUTH_SECRET);
  if (!ok) {
    // For HTML requests redirect to login
    if (request.headers.get('Accept')?.includes('text/html')) {
      return Response.redirect(`${url.origin}/`, 302);
    }
    // For API requests return 401
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return next();
}

async function verifyToken(token, secret) {
  if (!token) return false;
  const [ts, sig] = token.split('.');
  if (!ts || !sig) return false;
  const age = Math.floor(Date.now() / 1000) - parseInt(ts, 10);
  if (age > 86400 || age < 0) return false;
  const expected = await hmacSha256(ts, secret);
  return expected === sig;
}

async function hmacSha256(message, secret) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}
