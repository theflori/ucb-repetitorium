/**
 * PATCH /api/leads/:id
 * Update a single lead (e.g. mark as contacted)
 * Protected by middleware.
 */

export async function onRequestPatch({ request, params, env }) {
  if (!env.AIRTABLE_API_KEY || !env.AIRTABLE_BASE_ID || !env.AIRTABLE_LEADS_TABLE) {
    return jsonResponse({ error: 'Airtable env vars missing' }, 500);
  }

  try {
    const id = params.id;
    if (!id) {
      return jsonResponse({ error: 'Missing lead id' }, 400);
    }
    
    const data = await request.json();
    
    // Whitelist allowed fields
    const allowedFields = ['Status', 'Internal_Notes'];
    const fields = {};
    for (const key of allowedFields) {
      if (data[key] !== undefined) {
        fields[key] = data[key];
      }
    }
    
    // Auto-set Contacted_At when marking as contacted
    if (data.Status === 'contacted') {
      fields.Contacted_At = new Date().toISOString();
    }

    const url = 'https://api.airtable.com/v0/' + env.AIRTABLE_BASE_ID + '/' + 
                encodeURIComponent(env.AIRTABLE_LEADS_TABLE) + '/' + id;

    const response = await fetch(url, {
      method: 'PATCH',
      headers: {
        'Authorization': 'Bearer ' + env.AIRTABLE_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ fields: fields }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error('Airtable: ' + errText);
    }

    return jsonResponse({ success: true });
  } catch (err) {
    return jsonResponse({ error: err.message }, 500);
  }
}

function jsonResponse(body, status) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
