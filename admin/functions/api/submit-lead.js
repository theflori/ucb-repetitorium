/**
 * POST /api/submit-lead
 *
 * Body: { examen, vorname, nachname, email, telefon, uni, stand, nachricht, datenschutz }
 *
 * Stores lead in Airtable + sends confirmation mail + internal notification.
 *
 * Required env vars:
 *  - AIRTABLE_API_KEY, AIRTABLE_BASE_ID
 *  - AIRTABLE_LEADS_TABLE (e.g. "Leads")
 *  - RESEND_API_KEY
 *  - ADMIN_EMAIL
 *  - PUBLIC_SITE_URL
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function onRequestPost({ request, env }) {
  try {
    const data = await request.json();

    // Validate
    const required = ['examen', 'vorname', 'nachname', 'email', 'uni'];
    for (const f of required) {
      if (!data[f] || String(data[f]).trim() === '') {
        return json({ error: `Pflichtfeld fehlt: ${f}` }, 400);
      }
    }
    if (!data.datenschutz) {
      return json({ error: 'Bitte stimme der Datenschutzerklärung zu.' }, 400);
    }
    if (!isValidEmail(data.email)) {
      return json({ error: 'Bitte gib eine gültige E-Mail-Adresse ein.' }, 400);
    }

    // Save to Airtable
    const leadId = await createLead(data, env);

    // Email translation for examen
    const examenLabel = {
      '1_staatsexamen': 'Erstes Juristisches Staatsexamen',
      '2_staatsexamen': 'Zweites Staatsexamen Bayern',
    }[data.examen] || data.examen;

    // Send confirmation to lead
    await sendLeadConfirmation(data, examenLabel, leadId, env);

    // Send internal notification
    await sendInternalLeadNotification(data, examenLabel, leadId, env);

    return json({ success: true, leadId }, 200);

  } catch (err) {
    console.error('submit-lead error:', err);
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

async function createLead(data, env) {
  const res = await fetch(
    `https://api.airtable.com/v0/${env.AIRTABLE_BASE_ID}/${encodeURIComponent(env.AIRTABLE_LEADS_TABLE)}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.AIRTABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fields: {
          Status: 'new',
          Examen: data.examen,
          Vorname: data.vorname,
          Nachname: data.nachname,
          Email: data.email,
          Telefon: data.telefon || '',
          Uni: data.uni,
          Nachricht: data.nachricht || '',
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
  return json.id;
}

async function sendLeadConfirmation(data, examenLabel, leadId, env) {
  const html = await renderEmail('lead-confirmation', {
    FIRST_NAME: data.vorname,
    EXAMEN: examenLabel,
    LEAD_ID: leadId.substring(0, 8).toUpperCase(),
    RECIPIENT_EMAIL: data.email,
    SUBJECT: 'Anfrage erhalten — Wir melden uns persönlich',
    PREHEADER: 'Vielen Dank für deine Anfrage. Wir melden uns innerhalb von 48 Stunden bei dir.',
  }, env);

  await sendMail({
    to: data.email,
    from: 'UCB Repetitorium <noreply@ucb-repetitorium.de>',
    reply_to: 'info@ucb-muc.de',
    subject: 'Anfrage erhalten — Wir melden uns persönlich',
    html,
  }, env);
}

async function sendInternalLeadNotification(data, examenLabel, leadId, env) {
  const html = await renderEmail('internal-lead', {
    FIRST_NAME: data.vorname,
    LAST_NAME: data.nachname,
    EMAIL: data.email,
    PHONE: data.telefon || '',
    UNI: data.uni,
    EXAMEN: examenLabel,
    MESSAGE: data.nachricht || '',
    LEAD_ID: leadId.substring(0, 8).toUpperCase(),
    SUBMITTED_AT: new Date().toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' }),
    RECIPIENT_EMAIL: env.ADMIN_EMAIL,
    SUBJECT: `Neue Anfrage — ${data.vorname} ${data.nachname}`,
    PREHEADER: `${data.vorname} interessiert sich für ${examenLabel}.`,
  }, env);

  await sendMail({
    to: env.ADMIN_EMAIL,
    from: 'UCB Anfragen <noreply@ucb-repetitorium.de>',
    subject: `📩 Neue Anfrage — ${data.vorname} ${data.nachname}`,
    html,
  }, env);
}

async function renderEmail(templateName, vars, env) {
  const layoutRes = await fetch(`${env.PUBLIC_SITE_URL}/_emails/_layout.html`);
  const tplRes = await fetch(`${env.PUBLIC_SITE_URL}/_emails/${templateName}.html`);
  let layout = await layoutRes.text();
  let template = await tplRes.text();

  template = handleConditionals(template, vars);
  let html = layout.replace('{{CONTENT}}', template);

  for (const [key, val] of Object.entries(vars)) {
    html = html.replaceAll(`{{${key}}}`, String(val ?? ''));
  }
  html = html.replace(/\{\{[A-Z_]+\}\}/g, '');
  return html;
}

function handleConditionals(template, vars) {
  return template.replace(/\{\{IF_([A-Z_]+)\}\}([\s\S]*?)\{\{END_IF\}\}/g, (match, key, content) => {
    const v = vars[key] || vars[key.toLowerCase()];
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
    // Don't throw — lead is saved, mail is secondary
  }
}
