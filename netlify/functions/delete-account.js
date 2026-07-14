function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization',
      'Access-Control-Allow-Methods': 'POST,OPTIONS',
    },
    body: JSON.stringify(body),
  };
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
  const authHeader = event.headers.authorization || event.headers.Authorization || '';
  const accessToken = authHeader.replace(/^Bearer\s+/i, '');

  if (!userId || !accessToken) {
    return json(401, { error: '로그인 정보가 없습니다.' });
  }

  try {
    // Verify caller token
    const verifyResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!verifyResponse.ok) {
      return json(401, { error: '로그인이 만료되었습니다.' });
    }

    const verifiedUser = await verifyResponse.json();
    if (verifiedUser.id !== userId) {
      return json(403, { error: '본인 계정만 삭제할 수 있습니다.' });
    }

    // Delete auth user. Related tables use ON DELETE CASCADE.
    const deleteResponse = await fetch(`${supabaseUrl}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
      method: 'DELETE',
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
    });

    if (!deleteResponse.ok) {
      const text = await deleteResponse.text();
      throw new Error(`계정 삭제 실패: ${text}`);
    }

    return json(200, { ok: true, deletedUserId: userId });
  } catch (error) {
    console.error(error);
    return json(500, { error: error.message || String(error) });
  }
};
