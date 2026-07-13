function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
    },
    body: JSON.stringify(body),
  };
}

exports.handler = async () => {
  const clientKey = process.env.TOSS_CLIENT_KEY;
  if (!clientKey) {
    return json(500, { error: 'TOSS_CLIENT_KEY가 설정되지 않았습니다.' });
  }
  return json(200, { clientKey });
};
