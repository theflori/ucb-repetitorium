/**
 * POST /api/create-checkout
 *
 * Body: { vorname, nachname, email, telefon, uni, stand, coaching_themen,
 *         adresse, plz, stadt, land, kurs, amount, agb, widerruf, newsletter }
 *
 * Creates a Stripe Checkout Session and returns the URL.
 * Pre-stores form data so we can pick it up later via the webhook.
 *
 * Required env vars (set in Cloudflare Pages settings):
 *  - STRIPE_SECRET_KEY            (sk_live_... or sk_test_...)
 *  - STRIPE_PRICE_KLAUSUREN_AUG26 (price_xxx from Stripe Dashboard)
 *  - PUBLIC_SITE_URL              (e.g. https://ucb-repetitorium.de)
 *  - AIRTABLE_API_KEY
 *  - AIRTABLE_BASE_ID
 *  - AIRTABLE_BOOKINGS_TABLE      (e.g. "Bookings")
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*', // tighten to https://ucb-repetitorium.de in prod
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function onRequestPost({ request, env }) {
  try {
    const data = await request.json();

    // Validate required fields
    const required = ['vorname', 'nachname', 'email', 'telefon', 'uni', 'stand', 'adresse', 'plz', 'stadt', 'land'];
    for (const f of required) {
      if (!data[f] || String(data[f]).trim() === '') {
        return json({ error: `Pflichtfeld fehlt: ${f}` }, 400);
      }
    }
    if (!data.agb || !data.widerruf) {
      return json({ error: 'Bitte stimme AGB und Widerrufsbelehrung zu.' }, 400);
    }
    if (!isValidEmail(data.email)) {
      return json({ error: 'Bitte gib eine gültige E-Mail-Adresse ein.' }, 400);
    }

    // Pre-create pending booking record in Airtable
    const bookingId = await createPendingBooking(data, env);

    // Create Stripe Checkout Session
    const session = await createStripeSession(data, bookingId, env);

    return json({ url: session.url }, 200);

  } catch (err) {
    console.error('create-checkout error:', err);
    return json({ error: err.message || 'Server-Fehler' }, 500);
  }
}

// === Helpers ===

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim());
}

async function createPendingBooking(data, env) {
  const res = await fetch(
    `https://api.airtable.com/v0/${env.AIRTABLE_BASE_ID}/${encodeURIComponent(env.AIRTABLE_BOOKINGS_TABLE)}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.AIRTABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fields: {
          Status: 'pending',
          Vorname: data.vorname,
          Nachname: data.nachname,
          Email: data.email,
          Telefon: data.telefon,
          Uni: data.uni,
          Stand: data.stand,
          Coaching_Themen: data.coaching_themen || '',
          Adresse: data.adresse,
          PLZ: data.plz,
          Stadt: data.stadt,
          Land: data.land,
          Kurs: data.kurs || 'klausurentraining-bad-aibling-aug-2026',
          Newsletter: !!data.newsletter,
          Created_At: new Date().toISOString(),
        },
      }),
    }
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Airtable Fehler: ${err}`);
  }
  const json = await res.json();
  return json.id; // Airtable record ID — we'll use this as our internal booking ID
}

async function createStripeSession(data, bookingId, env) {
  const params = new URLSearchParams();
  params.append('mode', 'payment');
  params.append('customer_email', data.email);
  
  // Line item: Repetitorium
  params.append('line_items[0][price]', env.STRIPE_PRICE_KLAUSUREN_AUG26);
  params.append('line_items[0][quantity]', '1');
  
  // Payment methods
  ['card', 'sepa_debit', 'paypal', 'klarna'].forEach((pm, i) => {
    params.append(`payment_method_types[${i}]`, pm);
  });

  // URLs
  params.append('success_url', `${env.PUBLIC_SITE_URL}/erfolg/?session_id={CHECKOUT_SESSION_ID}`);
  params.append('cancel_url', `${env.PUBLIC_SITE_URL}/buchen/`);

  // Metadata — these come back via webhook
  params.append('metadata[booking_id]', bookingId);
  params.append('metadata[vorname]', data.vorname);
  params.append('metadata[nachname]', data.nachname);
  params.append('metadata[uni]', data.uni);
  params.append('metadata[stand]', data.stand);
  params.append('metadata[telefon]', data.telefon);

  // Locale
  params.append('locale', 'de');
  
  // Billing details for invoice
  params.append('invoice_creation[enabled]', 'true');
  params.append('invoice_creation[invoice_data][description]', 'Repetitorium UCB Repetitorium — Bad Aibling, August 2026');
  params.append('invoice_creation[invoice_data][custom_fields][0][name]', 'USt-Hinweis');
  params.append('invoice_creation[invoice_data][custom_fields][0][value]', 'Umsatzsteuerfrei nach §4 Nr.21 UStG');

  const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Stripe Fehler: ${err}`);
  }
  return await res.json();
}
