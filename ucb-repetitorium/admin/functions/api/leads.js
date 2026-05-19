/**
 * GET /api/leads             -> list all leads
 * PATCH /api/leads/:id       -> update a lead (e.g. mark as contacted)
 * 
 * Protected by middleware.
 */

export async function onRequestGet({ env }) {
  try {
    const records = await fetchAllRecords(env.AIRTABLE_LEADS_TABLE, env);
    return new Response(JSON.stringify({ records }), {
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

async function fetchAllRecords(tableName, env) {
  const all = [];
  let offset = null;
  do {
    const url = new URL(`https://api.airtable.com/v0/${env.AIRTABLE_BASE_ID}/${encodeURIComponent(tableName)}`);
    url.searchParams.set('pageSize', '100');
    url.searchParams.set('sort[0][field]', 'Created_At');
    url.searchParams.set('sort[0][direction]', 'desc');
    if (offset) url.searchParams.set('offset', offset);

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${env.AIRTABLE_API_KEY}` },
    });
    if (!res.ok) throw new Error(`Airtable: ${await res.text()}`);
    const json = await res.json();
    all.push(...json.records.map(r => ({ id: r.id, ...r.fields })));
    offset = json.offset;
  } while (offset);
  return all;
}
