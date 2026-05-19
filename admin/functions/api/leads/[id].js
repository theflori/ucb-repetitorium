/**
 * PATCH /api/leads/:id
 * Update a single lead (e.g. mark as contacted)
 * Protected by middleware.
 */

export async function onRequestPatch({ request, params, env }) {
  try {
    const id = params.id;
    const data = await request.json();
    
    // Only allow updating specific fields
    const allowed = ['Status', 'Internal_Notes'];
    const fields = {};
    for (const k of allowed) {
      if (data[k] !== undefined) fields[k] = data[k];
    }
    
    if (data.Status === 'contacted' && !data.Contacted_At) {
      fields.Contacted_At = new Date().toISOString();
    }
    
    const res = await fetch(
      `https://api.airtable.com/v0/${env.AIRTABLE_BASE_ID}/${encodeURIComponent(env.AIRTABLE_LEADS_TABLE)}/${id}`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${env.AIRTABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ fields }),
      }
    );
    if (!res.ok) throw new Error(await res.text());
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
