/**
 * POST /api/stripe-webhook
 * 
 * Receives Stripe webhook events (checkout.session.completed, etc.)
 * Verifies signature, updates Airtable, sends confirmation emails.
 * 
 * Required env vars:
 *  - STRIPE_WEBHOOK_SECRET   (whsec_xxx from Stripe webhook setup)
 *  - STRIPE_SECRET_KEY       (for fetching invoice PDF URL)
 *  - AIRTABLE_API_KEY, AIRTABLE_BASE_ID, AIRTABLE_BOOKINGS_TABLE
 *  - RESEND_API_KEY
 *  - ADMIN_EMAIL             (e.g. info@ucb-muc.de)
 *  - PUBLIC_SITE_URL
 */

export async function onRequestPost({ request, env }) {
  const body = await request.text();
  const sig = request.headers.get('stripe-signature');

  // Verify webhook signature
  let event;
  try {
    event = await verifyStripeWebhook(body, sig, env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return new Response(`Webhook Error: ${err.message}`, { status: 400 });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(event.data.object, env);
        break;
      case 'checkout.session.expired':
        await handleCheckoutExpired(event.data.object, env);
        break;
      // Add more event types if needed
      default:
        console.log(`Unhandled event type: ${event.type}`);
    }
    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Webhook handler error:', err);
    // Return 200 anyway so Stripe doesn't retry forever for non-recoverable errors
    return new Response(JSON.stringify({ error: err.message }), { status: 200 });
  }
}

// === Event Handlers ===

async function handleCheckoutCompleted(session, env) {
  const bookingId = session.metadata?.booking_id;
  if (!bookingId) {
    console.error('No booking_id in session metadata');
    return;
  }

  // Get invoice PDF URL if available
  let invoiceUrl = '';
  if (session.invoice) {
    try {
      const invoice = await stripeGet(`invoices/${session.invoice}`, env.STRIPE_SECRET_KEY);
      invoiceUrl = invoice.hosted_invoice_url || '';
    } catch (e) {
      console.error('Could not fetch invoice:', e);
    }
  }

  // Update Airtable booking to "paid"
  await updateBooking(bookingId, {
    Status: 'paid',
    Stripe_Session_Id: session.id,
    Stripe_Payment_Intent: session.payment_intent || '',
    Stripe_Customer_Id: session.customer || '',
    Invoice_Url: invoiceUrl,
    Paid_At: new Date().toISOString(),
    Amount_Paid: (session.amount_total || 0) / 100,
  }, env);

  // Fetch booking details for the email
  const booking = await getBooking(bookingId, env);

  // Send customer confirmation email
  await sendCustomerConfirmation(booking, invoiceUrl, env);
  
  // Send internal notification
  await sendInternalNotification(booking, session, env);
}

async function handleCheckoutExpired(session, env) {
  const bookingId = session.metadata?.booking_id;
  if (!bookingId) return;
  await updateBooking(bookingId, {
    Status: 'expired',
    Expired_At: new Date().toISOString(),
  }, env);
}

// === Airtable ===

async function updateBooking(recordId, fields, env) {
  const res = await fetch(
    `https://api.airtable.com/v0/${env.AIRTABLE_BASE_ID}/${encodeURIComponent(env.AIRTABLE_BOOKINGS_TABLE)}/${recordId}`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${env.AIRTABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ fields }),
    }
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Airtable update failed: ${err}`);
  }
  return res.json();
}

async function getBooking(recordId, env) {
  const res = await fetch(
    `https://api.airtable.com/v0/${env.AIRTABLE_BASE_ID}/${encodeURIComponent(env.AIRTABLE_BOOKINGS_TABLE)}/${recordId}`,
    {
      headers: { Authorization: `Bearer ${env.AIRTABLE_API_KEY}` },
    }
  );
  if (!res.ok) throw new Error(`Airtable read failed: ${await res.text()}`);
  const json = await res.json();
  return { id: json.id, ...json.fields };
}

// === Stripe ===

async function stripeGet(path, secretKey) {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    headers: { Authorization: `Bearer ${secretKey}` },
  });
  if (!res.ok) throw new Error(`Stripe API error: ${await res.text()}`);
  return await res.json();
}

async function verifyStripeWebhook(payload, sigHeader, secret) {
  // Parse Stripe signature header: t=timestamp,v1=signature
  if (!sigHeader) throw new Error('Missing signature header');
  
  const parts = sigHeader.split(',').reduce((acc, kv) => {
    const [k, v] = kv.split('=');
    acc[k] = v;
    return acc;
  }, {});

  if (!parts.t || !parts.v1) throw new Error('Invalid signature format');

  // Construct signed payload
  const signedPayload = `${parts.t}.${payload}`;

  // Compute HMAC-SHA256 using Web Crypto API (available in Cloudflare Workers)
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signed = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signedPayload));
  const computedSig = Array.from(new Uint8Array(signed))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  if (computedSig !== parts.v1) {
    throw new Error('Signature mismatch');
  }

  // Check timestamp (within 5 minutes)
  const age = Math.floor(Date.now() / 1000) - parseInt(parts.t, 10);
  if (age > 300) throw new Error('Webhook timestamp too old');

  return JSON.parse(payload);
}

// === Emails (via Resend) ===

async function sendCustomerConfirmation(booking, invoiceUrl, env) {
  const html = await renderEmail('booking-confirmation', {
    FIRST_NAME: booking.Vorname,
    LAST_NAME: booking.Nachname,
    EMAIL: booking.Email,
    BOOKING_ID: booking.id.substring(0, 8).toUpperCase(),
    INVOICE_URL: invoiceUrl || `${env.PUBLIC_SITE_URL}`,
    COURSE_DATES: 'August 2026',
    RECIPIENT_EMAIL: booking.Email,
    SUBJECT: 'Buchung bestätigt — Repetitorium Bad Aibling',
    PREHEADER: 'Deine Buchung ist eingegangen. Hier sind die nächsten Schritte und deine Rechnung.',
  }, env);

  await sendMail({
    to: booking.Email,
    from: 'UCB Repetitorium <noreply@ucb-repetitorium.de>',
    reply_to: 'info@ucb-muc.de',
    subject: 'Buchung bestätigt — Repetitorium Bad Aibling',
    html,
  }, env);
}

async function sendInternalNotification(booking, session, env) {
  const paymentMethod = session.payment_method_types?.[0] || 'card';
  const pmLabel = {
    card: 'Kreditkarte',
    sepa_debit: 'SEPA-Lastschrift',
    paypal: 'PayPal',
    klarna: 'Klarna',
  }[paymentMethod] || paymentMethod;

  const html = await renderEmail('internal-booking', {
    FIRST_NAME: booking.Vorname,
    LAST_NAME: booking.Nachname,
    EMAIL: booking.Email,
    PHONE: booking.Telefon || '—',
    UNI: booking.Uni,
    BOOKING_ID: booking.id.substring(0, 8).toUpperCase(),
    BOOKED_AT: new Date().toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' }),
    COURSE_DATES: 'August 2026',
    PAYMENT_METHOD: pmLabel,
    NEWSLETTER_OPT_IN: booking.Newsletter ? 'Ja' : 'Nein',
    RECIPIENT_EMAIL: env.ADMIN_EMAIL,
    SUBJECT: `Neue Buchung — ${booking.Vorname} ${booking.Nachname}`,
    PREHEADER: `${booking.Vorname} hat gerade gebucht. Coaching-Gespräch in 48h vereinbaren.`,
  }, env);

  await sendMail({
    to: env.ADMIN_EMAIL,
    from: 'UCB Buchungen <noreply@ucb-repetitorium.de>',
    subject: `🎉 Neue Buchung — ${booking.Vorname} ${booking.Nachname}`,
    html,
  }, env);
}

async function renderEmail(templateName, vars, env) {
  // In production: serve _layout.html and template HTML from Cloudflare Pages assets or KV
  // For now: fetch from public path
  const layoutRes = await fetch(`${env.PUBLIC_SITE_URL}/_emails/_layout.html`);
  const tplRes = await fetch(`${env.PUBLIC_SITE_URL}/_emails/${templateName}.html`);
  let layout = await layoutRes.text();
  let template = await tplRes.text();
  
  // Replace template-specific conditionals first
  template = handleConditionals(template, vars);
  
  // Inject template content into layout
  let html = layout.replace('{{CONTENT}}', template);

  // Replace all variables
  for (const [key, val] of Object.entries(vars)) {
    html = html.replaceAll(`{{${key}}}`, String(val ?? ''));
  }
  // Strip any unfilled placeholders
  html = html.replace(/\{\{[A-Z_]+\}\}/g, '');
  return html;
}

function handleConditionals(template, vars) {
  // Handles {{IF_X}}...{{END_IF}} — strips block if X is empty/false
  return template.replace(/\{\{IF_([A-Z_]+)\}\}([\s\S]*?)\{\{END_IF\}\}/g, (match, key, content) => {
    const v = vars[key] || vars[`${key}_STRING`] || vars[key.toLowerCase()];
    return v && String(v).trim() !== '' && v !== false ? content : '';
  });
}

async function sendMail(opts, env) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: opts.from,
      to: [opts.to],
      reply_to: opts.reply_to ? [opts.reply_to] : undefined,
      subject: opts.subject,
      html: opts.html,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    console.error('Resend error:', err);
    throw new Error(`Mail send failed: ${err}`);
  }
  return await res.json();
}
