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
  const firstName = booking.Vorname || '';
  const bookingId = (booking.id || '').substring(0, 8).toUpperCase();
  const invoiceLine = invoiceUrl
    ? `<p style="margin:0 0 16px">Deine Rechnung kannst du hier abrufen: <a href="${invoiceUrl}" style="color:#421D1D">Rechnung ansehen</a></p>`
    : '';

  const html = `<!DOCTYPE html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:#F8F4EE;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1A1A1A;line-height:1.6">
  <div style="max-width:560px;margin:0 auto;padding:32px 24px">
    <div style="background:#421D1D;color:#F0B66B;padding:20px 24px;border-radius:10px 10px 0 0;font-size:18px;font-weight:700;letter-spacing:.02em">UCB REPETITORIUM</div>
    <div style="background:#fff;padding:28px 24px;border:1px solid #E5DDD0;border-top:none;border-radius:0 0 10px 10px">
      <p style="margin:0 0 16px">Hallo ${firstName},</p>
      <p style="margin:0 0 16px">vielen Dank — deine Buchung ist bei uns eingegangen und bestätigt.</p>
      <table style="width:100%;border-collapse:collapse;margin:0 0 20px;font-size:14px">
        <tr><td style="padding:8px 0;color:#7A6E64">Kurs</td><td style="padding:8px 0;text-align:right;font-weight:600">Repetitorium — Erstes Juristisches Staatsexamen Bayern</td></tr>
        <tr><td style="padding:8px 0;color:#7A6E64;border-top:1px solid #E5DDD0">Termin</td><td style="padding:8px 0;text-align:right;font-weight:600;border-top:1px solid #E5DDD0">2.–9. August 2026, Bad Aibling</td></tr>
        <tr><td style="padding:8px 0;color:#7A6E64;border-top:1px solid #E5DDD0">Buchungsnummer</td><td style="padding:8px 0;text-align:right;font-weight:600;border-top:1px solid #E5DDD0">${bookingId}</td></tr>
      </table>
      ${invoiceLine}
      <p style="margin:0 0 16px">Wir melden uns persönlich bei dir, um dein Coaching-Gespräch vor Kursstart zu vereinbaren.</p>
      <p style="margin:0 0 4px">Bei Fragen erreichst du uns unter <a href="mailto:info@ucb-muc.de" style="color:#421D1D">info@ucb-muc.de</a> oder 089 645205.</p>
      <p style="margin:24px 0 0;color:#7A6E64;font-size:13px">UCB - Lohmer Repetitorium UG (haftungsbeschränkt)</p>
    </div>
  </div>
</body></html>`;

  await sendMail({
    to: booking.Email,
    from: 'UCB Repetitorium <noreply@ucb-rep.de>',
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

  const bookedAt = new Date().toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' });
  const html = `<!DOCTYPE html><html lang="de"><head><meta charset="utf-8"></head>
<body style="margin:0;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1A1A1A;line-height:1.6">
  <div style="max-width:560px;margin:0 auto;padding:24px">
    <h2 style="margin:0 0 16px;font-size:18px">Neue Buchung — ${booking.Vorname} ${booking.Nachname}</h2>
    <table style="width:100%;border-collapse:collapse;font-size:14px">
      <tr><td style="padding:6px 0;color:#7A6E64">Name</td><td style="padding:6px 0;text-align:right">${booking.Vorname} ${booking.Nachname}</td></tr>
      <tr><td style="padding:6px 0;color:#7A6E64">E-Mail</td><td style="padding:6px 0;text-align:right">${booking.Email}</td></tr>
      <tr><td style="padding:6px 0;color:#7A6E64">Telefon</td><td style="padding:6px 0;text-align:right">${booking.Telefon || '—'}</td></tr>
      <tr><td style="padding:6px 0;color:#7A6E64">Universität</td><td style="padding:6px 0;text-align:right">${booking.Uni || '—'}</td></tr>
      <tr><td style="padding:6px 0;color:#7A6E64">Zahlart</td><td style="padding:6px 0;text-align:right">${pmLabel}</td></tr>
      <tr><td style="padding:6px 0;color:#7A6E64">Newsletter</td><td style="padding:6px 0;text-align:right">${booking.Newsletter ? 'Ja' : 'Nein'}</td></tr>
      <tr><td style="padding:6px 0;color:#7A6E64">Gebucht am</td><td style="padding:6px 0;text-align:right">${bookedAt}</td></tr>
    </table>
    <p style="margin:16px 0 0;font-size:13px;color:#7A6E64">Coaching-Gespräch vor Kursstart vereinbaren.</p>
  </div>
</body></html>`;

  await sendMail({
    to: env.ADMIN_EMAIL,
    from: 'UCB Buchungen <noreply@ucb-rep.de>',
    subject: `Neue Buchung — ${booking.Vorname} ${booking.Nachname}`,
    html,
  }, env);
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
