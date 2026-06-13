/**
 * GET /api/debug
 * Shows what's wrong with the Airtable connection — for debugging only
 */

export async function onRequestGet({ env }) {
  const result = {
    env_check: {
      AIRTABLE_API_KEY: env.AIRTABLE_API_KEY ? `set (${env.AIRTABLE_API_KEY.substring(0, 8)}...${env.AIRTABLE_API_KEY.substring(env.AIRTABLE_API_KEY.length - 4)})` : 'MISSING',
      AIRTABLE_BASE_ID: env.AIRTABLE_BASE_ID || 'MISSING',
      AIRTABLE_BOOKINGS_TABLE: env.AIRTABLE_BOOKINGS_TABLE || 'MISSING',
      AIRTABLE_LEADS_TABLE: env.AIRTABLE_LEADS_TABLE || 'MISSING',
    },
    stripe_check: {
      STRIPE_SECRET_KEY: env.STRIPE_SECRET_KEY ? `set (${env.STRIPE_SECRET_KEY.substring(0, 7)}...${env.STRIPE_SECRET_KEY.substring(env.STRIPE_SECRET_KEY.length - 4)})` : 'MISSING',
      STRIPE_PRICE_KLAUSUREN_AUG26: env.STRIPE_PRICE_KLAUSUREN_AUG26 || 'MISSING',
      STRIPE_WEBHOOK_SECRET: env.STRIPE_WEBHOOK_SECRET ? `set (${env.STRIPE_WEBHOOK_SECRET.substring(0, 7)}...)` : 'MISSING',
      PUBLIC_SITE_URL: env.PUBLIC_SITE_URL || 'MISSING',
    },
    stripe_price_test: null,
    bookings_test: null,
    leads_test: null,
    raw_bookings_response: null,
  };

  // Verify the price exists in THIS account/mode using the secret key
  if (env.STRIPE_SECRET_KEY && env.STRIPE_PRICE_KLAUSUREN_AUG26) {
    try {
      const res = await fetch(`https://api.stripe.com/v1/prices/${env.STRIPE_PRICE_KLAUSUREN_AUG26}`, {
        headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}` },
      });
      const j = await res.json();
      result.stripe_price_test = {
        status: res.status,
        ok: res.ok,
        price_active: j.active ?? null,
        price_amount: j.unit_amount ?? null,
        price_currency: j.currency ?? null,
        livemode: j.livemode ?? null,
        error: j.error ? { type: j.error.type, message: j.error.message } : null,
      };
    } catch (err) {
      result.stripe_price_test = { error: err.message };
    }
  }

  // Try to fetch from Bookings table
  if (env.AIRTABLE_API_KEY && env.AIRTABLE_BASE_ID && env.AIRTABLE_BOOKINGS_TABLE) {
    try {
      const url = `https://api.airtable.com/v0/${env.AIRTABLE_BASE_ID}/${encodeURIComponent(env.AIRTABLE_BOOKINGS_TABLE)}?maxRecords=3`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${env.AIRTABLE_API_KEY}` },
      });
      const text = await res.text();
      result.bookings_test = {
        status: res.status,
        ok: res.ok,
        url_called: url,
      };
      try {
        const json = JSON.parse(text);
        result.raw_bookings_response = {
          fields_found: json.records?.[0] ? Object.keys(json.records[0].fields || {}) : 'no records',
          record_count: json.records?.length || 0,
          error: json.error || null,
        };
      } catch {
        result.raw_bookings_response = { raw: text.substring(0, 500) };
      }
    } catch (err) {
      result.bookings_test = { error: err.message };
    }
  }

  // Try to fetch from Leads table
  if (env.AIRTABLE_API_KEY && env.AIRTABLE_BASE_ID && env.AIRTABLE_LEADS_TABLE) {
    try {
      const url = `https://api.airtable.com/v0/${env.AIRTABLE_BASE_ID}/${encodeURIComponent(env.AIRTABLE_LEADS_TABLE)}?maxRecords=3`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${env.AIRTABLE_API_KEY}` },
      });
      const text = await res.text();
      result.leads_test = {
        status: res.status,
        ok: res.ok,
      };
      try {
        const json = JSON.parse(text);
        if (json.error) result.leads_test.error = json.error;
      } catch {
        result.leads_test.raw = text.substring(0, 200);
      }
    } catch (err) {
      result.leads_test = { error: err.message };
    }
  }

  return new Response(JSON.stringify(result, null, 2), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
