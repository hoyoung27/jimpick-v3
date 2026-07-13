const crypto = require('crypto');

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
    body: JSON.stringify(body),
  };
}

function basicAuth(secretKey) {
  return `Basic ${Buffer.from(`${secretKey}:`).toString('base64')}`;
}

async function supabaseRequest(url, serviceRoleKey, options = {}) {
  return fetch(url, {
    ...options,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
}

exports.handler = async (event) => {
  const secret = process.env.BILLING_CRON_SECRET;
  const supplied =
    event.headers?.['x-billing-secret'] ||
    event.headers?.['X-Billing-Secret'] ||
    event.queryStringParameters?.secret;

  if (!secret || supplied !== secret) {
    return json(401, { error: '자동결제 인증 실패' });
  }

  const tossSecretKey = process.env.TOSS_SECRET_KEY;
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!tossSecretKey || !supabaseUrl || !serviceRoleKey) {
    return json(500, { error: '자동결제 서버 환경변수가 부족합니다.' });
  }

  const now = new Date().toISOString();
  const listResponse = await supabaseRequest(
    `${supabaseUrl}/rest/v1/subscriptions?status=eq.active&next_billing_at=lte.${encodeURIComponent(now)}&select=*`,
    serviceRoleKey
  );

  if (!listResponse.ok) {
    return json(500, { error: '결제 대상 조회 실패' });
  }

  const subscriptions = await listResponse.json();
  const results = [];

  for (const sub of subscriptions) {
    const orderId = `jimpick_renew_${sub.user_id.replaceAll('-', '').slice(0, 18)}_${Date.now()}`;
    try {
      const chargeResponse = await fetch(
        `https://api.tosspayments.com/v1/billing/${encodeURIComponent(sub.billing_key)}`,
        {
          method: 'POST',
          headers: {
            Authorization: basicAuth(tossSecretKey),
            'Content-Type': 'application/json',
            'Idempotency-Key': crypto.randomUUID(),
          },
          body: JSON.stringify({
            customerKey: sub.customer_key,
            amount: 22000,
            orderId,
            orderName: '짐픽 PRO 월 구독 자동결제',
          }),
        }
      );

      const chargeData = await chargeResponse.json();

      if (!chargeResponse.ok) {
        throw new Error(chargeData.message || '자동결제 실패');
      }

      const nextBilling = new Date();
      nextBilling.setMonth(nextBilling.getMonth() + 1);

      await supabaseRequest(
        `${supabaseUrl}/rest/v1/subscriptions?user_id=eq.${encodeURIComponent(sub.user_id)}`,
        serviceRoleKey,
        {
          method: 'PATCH',
          headers: { Prefer: 'return=minimal' },
          body: JSON.stringify({
            status: 'active',
            last_payment_key: chargeData.paymentKey || '',
            last_order_id: orderId,
            last_paid_at: new Date().toISOString(),
            next_billing_at: nextBilling.toISOString(),
            updated_at: new Date().toISOString(),
          }),
        }
      );

      await supabaseRequest(
        `${supabaseUrl}/rest/v1/profiles?id=eq.${encodeURIComponent(sub.user_id)}`,
        serviceRoleKey,
        {
          method: 'PATCH',
          headers: { Prefer: 'return=minimal' },
          body: JSON.stringify({
            subscription_status: 'active',
            last_paid_at: new Date().toISOString(),
            next_billing_at: nextBilling.toISOString(),
          }),
        }
      );

      await supabaseRequest(
        `${supabaseUrl}/rest/v1/payment_logs`,
        serviceRoleKey,
        {
          method: 'POST',
          headers: { Prefer: 'return=minimal' },
          body: JSON.stringify({
            user_id: sub.user_id,
            order_id: orderId,
            payment_key: chargeData.paymentKey || '',
            amount: 22000,
            status: 'paid',
            message: '자동결제 성공',
          }),
        }
      );

      results.push({ userId: sub.user_id, ok: true });
    } catch (error) {
      await supabaseRequest(
        `${supabaseUrl}/rest/v1/subscriptions?user_id=eq.${encodeURIComponent(sub.user_id)}`,
        serviceRoleKey,
        {
          method: 'PATCH',
          headers: { Prefer: 'return=minimal' },
          body: JSON.stringify({
            status: 'past_due',
            updated_at: new Date().toISOString(),
          }),
        }
      );

      await supabaseRequest(
        `${supabaseUrl}/rest/v1/profiles?id=eq.${encodeURIComponent(sub.user_id)}`,
        serviceRoleKey,
        {
          method: 'PATCH',
          headers: { Prefer: 'return=minimal' },
          body: JSON.stringify({
            subscription_status: 'past_due',
          }),
        }
      );

      await supabaseRequest(
        `${supabaseUrl}/rest/v1/payment_logs`,
        serviceRoleKey,
        {
          method: 'POST',
          headers: { Prefer: 'return=minimal' },
          body: JSON.stringify({
            user_id: sub.user_id,
            order_id: orderId,
            payment_key: '',
            amount: 22000,
            status: 'failed',
            message: error.message || String(error),
          }),
        }
      );

      results.push({
        userId: sub.user_id,
        ok: false,
        error: error.message || String(error),
      });
    }
  }

  return json(200, {
    checked: subscriptions.length,
    results,
    executedAt: new Date().toISOString(),
  });
};
