function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'POST,OPTIONS',
    },
    body: JSON.stringify(body),
  };
}

async function supabaseRequest(url, key, options = {}) {
  return fetch(url, {
    ...options,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return json(200, { ok: true });
  if (event.httpMethod !== 'POST') return json(405, { error: 'POST만 허용됩니다.' });

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return json(500, { error: 'Supabase 서버 설정이 부족합니다.' });
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return json(400, { error: '요청 형식 오류' });
  }

  const userId = body.userId;
  if (!userId) return json(400, { error: '사용자 정보가 없습니다.' });

  const now = new Date().toISOString();

  const subResponse = await supabaseRequest(
    `${supabaseUrl}/rest/v1/subscriptions?user_id=eq.${encodeURIComponent(userId)}`,
    serviceRoleKey,
    {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        status: 'canceled',
        canceled_at: now,
        updated_at: now,
      }),
    }
  );

  if (!subResponse.ok) {
    return json(500, { error: '구독 정보 변경 실패' });
  }

  const profileResponse = await supabaseRequest(
    `${supabaseUrl}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}`,
    serviceRoleKey,
    {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        subscription_status: 'canceled',
      }),
    }
  );

  if (!profileResponse.ok) {
    return json(500, { error: '회원 구독상태 변경 실패' });
  }

  return json(200, { ok: true, status: 'canceled' });
};
