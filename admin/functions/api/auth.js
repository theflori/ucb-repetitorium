/**
 * POST /api/auth   -> Login (verifies password, sets cookie)
 * DELETE /api/auth -> Logout (clears cookie)
 *
 * Required env: ADMIN_PASSWORD, AUTH_SECRET
 */

export async function onRequestPost({ request, env }) {
  try {
    if (!env.ADMIN_PASSWORD) {
      return jsonResponse({ error: 'Server-Fehler: ADMIN_PASSWORD nicht gesetzt' }, 500);
    }
    if (!env.AUTH_SECRET) {
      return jsonResponse({ error: 'Server-Fehler: AUTH_SECRET nicht gesetzt' }, 500);
    }

    const body = await request.json();
    const password = body && body.password;

    if (!password || password !== env.ADMIN_PASSWORD) {
      return jsonResponse({ error: 'Falsches Passwort' }, 401);
    }

    const token = await createToken(env.AUTH_SECRET);

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': `ucb_auth=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=86400`,
      },
    });
  } catch (err) {
    return jsonResponse({ error: 'Server-Fehler: ' + err.message }, 500);
  }
}

export async function onRequestDelete() {
  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': 'ucb_auth=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0',
    },
  });
}

function jsonResponse(body, status) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function createToken(secret) {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = await hmacSha256(timestamp, secret);
  return timestamp + '.' + signature;
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
