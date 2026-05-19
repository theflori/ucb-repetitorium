/**
 * Cloudflare Pages Functions middleware
 * Protects /dashboard.html and admin read endpoints.
 * Allows public endpoints (Stripe checkout, lead submit, webhook) without auth.
 */

export async function onRequest(context) {
  const { request, env, next } = context;
  const url = new URL(request.url);
  const path = url.pathname;

  // Always-public paths (no auth required)
  const publicPaths = [
    '/',
    '/index.html',
    '/login.html',            // ← MUSS hier sein, sonst Redirect-Loop
    '/api/auth',              // login endpoint
    '/api/create-checkout',   // public site calls this
    '/api/stripe-webhook',    // Stripe calls this
    '/api/submit-lead',       // public site calls this
    '/api/debug',             // debug always open (for troubleshooting)
  ];
  
  const isPublic = 
    publicPaths.includes(path) || 
    path.startsWith('/favicon') || 
    path.startsWith('/assets') ||
    path.startsWith('/_emails');
  
  if (isPublic) {
    return next();
  }

  // Protected paths (dashboard + bookings/leads APIs)
  const cookie = request.headers.get('Cookie') || '';
  const match = cookie.match(/ucb_admin=([^;]+)/);
  const token = match ? match[1] : null;
  
  const secret = env.AUTH_SECRET || env.ADMIN_PASSWORD;
  const ok = await verifyToken(token, secret);
  
  if (!ok) {
    // HTML requests → redirect to login
    if (request.headers.get('Accept')?.includes('text/html')) {
      return Response.redirect(`${url.origin}/login.html`, 302);
    }
    // API requests → 401
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return next();
}

async function verifyToken(token, secret) {
  if (!token || !secret) return false;
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
