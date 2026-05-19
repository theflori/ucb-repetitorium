/**
 * GET /api/bookings  -> list all bookings
 */

export async function onRequestGet({ env }) {
  try {
    if (!env.AIRTABLE_API_KEY) return jsonErr('AIRTABLE_API_KEY missing', 500);
    if (!env.AIRTABLE_BASE_ID) return jsonErr('AIRTABLE_BASE_ID missing', 500);
    if (!env.AIRTABLE_BOOKINGS_TABLE) return jsonErr('AIRTABLE_BOOKINGS_TABLE missing', 500);

    const records = await fetchAllRecords(env.AIRTABLE_BOOKINGS_TABLE, env);
    return new Response(JSON.stringify({ records, count: records.length }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return jsonErr(`Airtable: ${err.message}`, 500);
  }
}

function jsonErr(message, status) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function fetchAllRecords(tableName, env) {
  const all = [];
  let offset = null;
  let useSort = true;

  do {
    const url = new URL(`https://api.airtable.com/v0/${env.AIRTABLE_BASE_ID}/${encodeURIComponent(tableName)}`);
    url.searchParams.set('pageSize', '100');
    if (useSort) {
      url.searchParams.set('sort[0][field]', 'Created_At');
      url.searchParams.set('sort[0][direction]', 'desc');
    }
    if (offset) url.searchParams.set('offset', offset);

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${env.AIRTABLE_API_KEY}` },
    });

    if (!res.ok) {
      const errText = await res.text();
      if (useSort && (errText.includes('Created_At') || errText.includes('UNKNOWN_FIELD_NAME') || errText.includes('INVALID_REQUEST'))) {
        useSort = false;
        offset = null;
        all.length = 0;
        continue;
      }
      throw new Error(`HTTP ${res.status}: ${errText}`);
    }

    const json = await res.json();
    all.push(...json.records.map(r => ({ id: r.id, ...r.fields })));
    offset = json.offset;
  } while (offset);

  return all;
}
