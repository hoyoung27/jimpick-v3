const ALLOWED_ITEMS = [
  '침대','옷장','서랍장','책상','책장','의자','화장대','컴퓨터',
  'TV','에어컨','스타일러','행거','선풍기','박스','바구니','기타',
  '소파','거실장','TV스탠드','안마의자','공기청정기','테이블',
  '러닝머신','장식장','화분','스피커','냉장고','김치냉장고','식탁',
  '전자레인지','에어프라이어','밥솥','정수기','식기세척기',
  '가스레인지','수납장','세탁기','건조기','빨래건조대'
];

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

function extractText(data) {
  return data?.candidates?.[0]?.content?.parts
    ?.map((part) => part.text || '')
    .join('')
    .trim() || '';
}

function cleanJsonText(text) {
  return String(text || '')
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/, '')
    .replace(/\s*```$/, '')
    .trim();
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return json(200, { ok: true });
  }

  if (event.httpMethod !== 'POST') {
    return json(405, { error: 'POST 요청만 허용됩니다.' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return json(500, {
      error: 'Netlify 환경변수 GEMINI_API_KEY가 설정되지 않았습니다.',
    });
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch {
    return json(400, { error: '요청 형식이 올바르지 않습니다.' });
  }

  const images = Array.isArray(payload.images) ? payload.images.slice(0, 6) : [];
  if (!images.length) {
    return json(400, { error: '분석할 사진이 없습니다.' });
  }

  const validImages = images.filter(
    (img) =>
      img &&
      typeof img.data === 'string' &&
      img.data.length > 100 &&
      typeof img.mimeType === 'string'
  );

  if (!validImages.length) {
    return json(400, { error: '올바른 사진 데이터가 없습니다.' });
  }

  const prompt = `당신은 한국 이사업체의 현장 견적 사진 분석 도우미입니다.
사진에 보이는 이삿짐 품목을 세고 JSON만 반환하세요.

규칙:
1. 같은 물건이 여러 사진에 중복되었으면 한 번만 계산하세요.
2. 확실히 보이는 물건만 계산하세요.
3. 작은 생활용품과 잡동사니는 박스 수량으로 추정하세요.
4. 품목명은 반드시 아래 목록 중 하나만 사용하세요.
${ALLOWED_ITEMS.join(', ')}
5. 장롱/장농은 옷장, 매트리스는 침대, 티비는 TV, 쇼파는 소파로 처리하세요.
6. 각 품목에 confidence를 0~1 숫자로 넣으세요.
7. 사진에 가려졌거나 확실하지 않은 품목은 confidence를 0.55 미만으로 넣으세요.
8. 같은 물건을 여러 각도로 찍은 사진은 중복 계산하지 마세요.
9. 박스 수량은 보이는 박스와 수납된 잔짐을 함께 고려하되 과장하지 마세요.

반환 형식:
{"items":[{"name":"냉장고","qty":1,"confidence":0.95},{"name":"소파","qty":1,"confidence":0.9}],"summary":"짧은 한국어 설명"}`;

  const body = {
    contents: [
      {
        role: 'user',
        parts: [
          { text: prompt },
          ...validImages.map((img) => ({
            inlineData: {
              mimeType: img.mimeType,
              data: img.data,
            },
          })),
        ],
      },
    ],
    generationConfig: {
      temperature: 0.1,
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: {
          items: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: {
                name: { type: 'STRING' },
                qty: { type: 'INTEGER' },
                confidence: { type: 'NUMBER' },
              },
              required: ['name', 'qty', 'confidence'],
            },
          },
          summary: { type: 'STRING' },
        },
        required: ['items'],
      },
    },
  };

  const models = ['gemini-2.5-flash', 'gemini-2.0-flash'];
  let lastError = '';

  for (const model of models) {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }
    );

    if (response.ok) {
      const data = await response.json();
      const text = extractText(data);

      try {
        const parsed = JSON.parse(cleanJsonText(text));
        return json(200, parsed);
      } catch {
        return json(502, { error: 'AI 결과를 읽지 못했습니다.' });
      }
    }

    lastError = `${response.status}: ${await response.text()}`;
    if (response.status !== 404) break;
  }

  console.error('Gemini API error:', lastError);
  return json(502, { error: 'AI 분석 서버에서 오류가 발생했습니다.' });
};
