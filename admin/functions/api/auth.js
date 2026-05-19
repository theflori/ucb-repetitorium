/**
 * POST /api/auth   -> Login (set cookie)
 * DELETE /api/auth -> Logout
 */

export async function onRequestPost({ request, env }) {
  try {
    const { password } = await request.json();
    
    if (!env.ADMIN_PASSWORD) {
      return json({ error: 'ADMIN_PASSWORD nicht gesetzt' }, 500);
    }
    
    if (!password || password !== env.ADMIN_PASSWORD) {
      return json({ error: 'Falsches Passwort' }, 401);
    }

    const secret = env.AUTH_SECRET || env.ADMIN_PASSWORD; // fallback if AUTH_SECRET missing
    const token = await createToken(secret);
    
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': `ucb_admin=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=86400`,
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
      'Set-Cookie': 'ucb_admin=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0',
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
  const ts = Math.floor(Date.now() / 1000).toString();
  const sig = await hmacSha256(ts, secret);
  return `${ts}.${sig}`;
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
