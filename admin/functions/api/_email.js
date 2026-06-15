/**
 * Shared email helpers (Resend).
 * Used by stripe-webhook.js and bookings/[id]/resend-email.js
 */

export function buildCustomerConfirmationHtml(booking, invoiceUrl) {
  const firstName = booking.Vorname || '';
  const bookingId = (booking.id || '').substring(0, 8).toUpperCase();
  const invoiceLine = invoiceUrl
    ? `<p style="margin:0 0 16px">Deine Rechnung kannst du hier abrufen: <a href="${invoiceUrl}" style="color:#421D1D">Rechnung ansehen</a></p>`
    : '';

  return `<!DOCTYPE html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
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
}

export async function sendMail(opts, env) {
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
