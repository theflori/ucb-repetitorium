/**
 * Cloudflare Pages Middleware
 * 
 * STRATEGY: Only check auth for explicitly protected paths.
 * Everything else passes through (login page, API endpoints, assets, etc.)
 * 
 * This avoids redirect loops because the login page (/) is NOT protected.
 */

export async function onRequest(context) {
  const { request, env, next } = context;
  const url = new URL(request.url);
  const path = url.pathname;

  // ONLY these paths require authentication
  const protectedPaths = [
    '/dashboard.html',
    '/api/bookings',
    '/api/leads',
  ];
  
  // Match exact path OR path starting with `/api/leads/`
  const requiresAuth = 
    protectedPaths.includes(path) ||
    path.startsWith('/api/leads/');

  if (!requiresAuth) {
    return next();
  }

  // Check the auth cookie
  const cookieHeader = request.headers.get('Cookie') || '';
  const cookieMatch = cookieHeader.match(/ucb_auth=([^;]+)/);
  const token = cookieMatch ? cookieMatch[1] : null;

  const authorized = await verifyToken(token, env.AUTH_SECRET);

  if (!authorized) {
    // HTML request → redirect to login (which is /)
    const acceptHeader = request.headers.get('Accept') || '';
    if (acceptHeader.indexOf('text/html') !== -1) {
      return Response.redirect(url.origin + '/', 302);
    }
    // API request → 401
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return next();
}

async function verifyToken(token, secret) {
  if (!token || !secret) return false;
  
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  
  const timestamp = parts[0];
  const signature = parts[1];
  
  // Check timestamp validity
  const ts = parseInt(timestamp, 10);
  if (isNaN(ts)) return false;
  
  const age = Math.floor(Date.now() / 1000) - ts;
  if (age < 0 || age > 86400) return false; // 24h max
  
  // Verify signature
  const expectedSignature = await hmacSha256(timestamp, secret);
  return signature === expectedSignature;
}

async function hmacSha256(message, secret) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  const bytes = new Uint8Array(signature);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}
