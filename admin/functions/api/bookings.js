/**
 * GET /api/bookings  -> list all bookings
 * Protected by middleware.
 */

export async function onRequestGet({ env }) {
  // Validate env vars
  if (!env.AIRTABLE_API_KEY) {
    return errorResponse('AIRTABLE_API_KEY environment variable not set', 500);
  }
  if (!env.AIRTABLE_BASE_ID) {
    return errorResponse('AIRTABLE_BASE_ID environment variable not set', 500);
  }
  if (!env.AIRTABLE_BOOKINGS_TABLE) {
    return errorResponse('AIRTABLE_BOOKINGS_TABLE environment variable not set', 500);
  }

  try {
    const records = await fetchAllRecords(env);
    return new Response(JSON.stringify({ records: records, count: records.length }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return errorResponse('Airtable error: ' + err.message, 500);
  }
}

function errorResponse(message, status) {
  return new Response(JSON.stringify({ error: message }), {
    status: status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function fetchAllRecords(env) {
  const baseId = env.AIRTABLE_BASE_ID;
  const tableName = env.AIRTABLE_BOOKINGS_TABLE;
  const apiKey = env.AIRTABLE_API_KEY;
  
  const allRecords = [];
  let offset = null;
  let useSort = true;

  do {
    const url = new URL('https://api.airtable.com/v0/' + baseId + '/' + encodeURIComponent(tableName));
    url.searchParams.set('pageSize', '100');
    if (useSort) {
      url.searchParams.set('sort[0][field]', 'Created_At');
      url.searchParams.set('sort[0][direction]', 'desc');
    }
    if (offset) url.searchParams.set('offset', offset);

    const response = await fetch(url.toString(), {
      headers: { 'Authorization': 'Bearer ' + apiKey },
    });

    if (!response.ok) {
      const errorText = await response.text();
      // If sort field missing, retry without sort
      if (useSort && errorText.indexOf('Created_At') >= 0) {
        useSort = false;
        offset = null;
        allRecords.length = 0;
        continue;
      }
      throw new Error('HTTP ' + response.status + ': ' + errorText);
    }

    const data = await response.json();
    if (data.records) {
      for (const record of data.records) {
        const entry = { id: record.id };
        if (record.fields) {
          for (const key in record.fields) {
            entry[key] = record.fields[key];
          }
        }
        allRecords.push(entry);
      }
    }
    offset = data.offset || null;
  } while (offset);

  return allRecords;
}
