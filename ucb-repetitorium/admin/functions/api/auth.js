/**
 * POST /api/auth   -> Login (set cookie)
 * DELETE /api/auth -> Logout (clear cookie)
 *
 * Required env vars:
 *  - ADMIN_PASSWORD  (the password — set as secret)
 *  - AUTH_SECRET     (random string for signing tokens — set as secret)
 */

export async function onRequestPost({ request, env }) {
  try {
    const { password } = await request.json();
    if (!password || password !== env.ADMIN_PASSWORD) {
      return json({ error: 'Falsches Passwort' }, 401);
    }

    // Create signed token
    const token = await createToken(env.AUTH_SECRET);
    
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': `ucb_admin=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=86400`,
      },
    });
  } catch (err) {
    return json({ error: err.message }, 500);
  }
}

export async function onRequestDelete() {
  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': 'ucb_admin=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0',
    },
  });
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function createToken(secret) {
  // Token = timestamp + signature
  const ts = Math.floor(Date.now() / 1000).toString();
  const sig = await hmacSha256(ts, secret);
  return `${ts}.${sig}`;
}

export async function verifyToken(token, secret) {
  if (!token) return false;
  const [ts, sig] = token.split('.');
  if (!ts || !sig) return false;
  // Check age (24h)
  const age = Math.floor(Date.now() / 1000) - parseInt(ts, 10);
  if (age > 86400 || age < 0) return false;
  // Verify signature
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
