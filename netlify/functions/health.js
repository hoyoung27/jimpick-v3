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
  return json(200, {
    ok: true,
    geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
    supabaseConfigured: Boolean(
      process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY
    ),
    checkedAt: new Date().toISOString(),
  });
};
