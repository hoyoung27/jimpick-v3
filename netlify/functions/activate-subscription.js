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

function basicAuth(secretKey) {
  return `Basic ${Buffer.from(`${secretKey}:`).toString('base64')}`;
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return json(200, { ok: true });
  if (event.httpMethod !== 'POST') return json(405, { error: 'POST만 허용됩니다.' });

  const secretKey = process.env.TOSS_SECRET_KEY;
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!secretKey) return json(500, { error: 'TOSS_SECRET_KEY가 설정되지 않았습니다.' });
  if (!supabaseUrl || !serviceRoleKey) {
    return json(500, { error: 'Supabase 서버 키가 설정되지 않았습니다.' });
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch {
    return json(400, { error: '요청 형식이 올바르지 않습니다.' });
  }

  const { authKey, customerKey, userId, email } = payload;
  if (!authKey || !customerKey || !userId) {
    return json(400, { error: '필수 결제정보가 부족합니다.' });
  }

  try {
    // 1. 빌링키 발급
    const issueResponse = await fetch(
      'https://api.tosspayments.com/v1/billing/authorizations/issue',
      {
        method: 'POST',
        headers: {
          Authorization: basicAuth(secretKey),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ authKey, customerKey }),
      }
    );

    const issueData = await issueResponse.json();
    if (!issueResponse.ok) {
      throw new Error(issueData.message || '빌링키 발급 실패');
    }

    const billingKey = issueData.billingKey;
    if (!billingKey) throw new Error('빌링키가 발급되지 않았습니다.');

    // 2. 첫 달 22,000원 결제
    const orderId = `jimpick_${userId.replaceAll('-', '').slice(0, 20)}_${Date.now()}`;
    const chargeResponse = await fetch(
      `https://api.tosspayments.com/v1/billing/${encodeURIComponent(billingKey)}`,
      {
        method: 'POST',
        headers: {
          Authorization: basicAuth(secretKey),
          'Content-Type': 'application/json',
          'Idempotency-Key': orderId,
        },
        body: JSON.stringify({
          customerKey,
          amount: 22000,
          orderId,
          orderName: '짐픽 PRO 월 구독',
          customerEmail: email || undefined,
        }),
      }
    );

    const chargeData = await chargeResponse.json();
    if (!chargeResponse.ok) {
      throw new Error(chargeData.message || '첫 결제 실패');
    }

    const nextBilling = new Date();
    nextBilling.setMonth(nextBilling.getMonth() + 1);

    // 3. Supabase 구독정보 저장
    const upsertResponse = await fetch(`${supabaseUrl}/rest/v1/subscriptions`, {
      method: 'POST',
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=representation',
      },
      body: JSON.stringify({
        user_id: userId,
        customer_key: customerKey,
        billing_key: billingKey,
        status: 'active',
        amount: 22000,
        last_payment_key: chargeData.paymentKey || '',
        last_order_id: orderId,
        last_paid_at: new Date().toISOString(),
        next_billing_at: nextBilling.toISOString(),
        updated_at: new Date().toISOString(),
      }),
    });

    if (!upsertResponse.ok) {
      const text = await upsertResponse.text();
      throw new Error(`구독정보 저장 실패: ${text}`);
    }

    // 4. 프로필 구독 상태 업데이트
    const profileResponse = await fetch(
      `${supabaseUrl}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}`,
      {
        method: 'PATCH',
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({
          subscription_status: 'active',
          next_billing_at: nextBilling.toISOString(),
        }),
      }
    );

    if (!profileResponse.ok) {
      throw new Error('회원 구독상태 업데이트 실패');
    }

    return json(200, {
      ok: true,
      status: 'active',
      amount: 22000,
      nextBillingAt: nextBilling.toISOString(),
    });
  } catch (error) {
    console.error(error);
    return json(500, { error: error.message || String(error) });
  }
};
