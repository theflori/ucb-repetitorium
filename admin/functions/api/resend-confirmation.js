/**
 * POST /api/resend-confirmation   body: { "bookingId": "rec...", "to": "optional@override" }
 * Re-sends the customer booking confirmation (also usable as a test mail).
 * Protected: path is added to the middleware whitelist.
 */
import { buildCustomerConfirmationHtml, sendMail } from './_email.js';

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

export async function onRequestPost({ request, env }) {
  try {
    let body = {};
    try { body = await request.json(); } catch (_) {}

    const recordId = body.bookingId;
    if (!recordId) return json({ error: 'Keine Buchungs-ID (bookingId)' }, 400);

    const overrideTo =
      typeof body.to === 'string' && body.to.includes('@') ? body.to.trim() : null;

    const res = await fetch(
      `https://api.airtable.com/v0/${env.AIRTABLE_BASE_ID}/${encodeURIComponent(env.AIRTABLE_BOOKINGS_TABLE)}/${recordId}`,
      { headers: { Authorization: `Bearer ${env.AIRTABLE_API_KEY}` } }
    );
    if (!res.ok) return json({ error: `Airtable: ${await res.text()}` }, 502);

    const data = await res.json();
    const booking = { id: data.id, ...data.fields };

    const recipient = overrideTo || booking.Email;
    if (!recipient) return json({ error: 'Keine Empfänger-E-Mail' }, 400);

    const html = buildCustomerConfirmationHtml(booking, booking.Invoice_Url || null);

    await sendMail({
      to: recipient,
      from: 'UCB Repetitorium <noreply@ucb-rep.de>',
      reply_to: 'info@ucb-muc.de',
      subject: 'Buchung bestätigt — Repetitorium Bad Aibling',
      html,
    }, env);

    return json({ ok: true, sent_to: recipient });
  } catch (err) {
    console.error('resend-confirmation error:', err);
    return json({ error: err.message || 'Server-Fehler', detail: String(err && err.message) }, 500);
  }
}
