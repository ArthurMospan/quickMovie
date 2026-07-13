// Retry with exponential backoff for 429 rate limits
async function fetchWithRetry(url, options, maxRetries = 2) {
  let response;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    response = await fetch(url, options);

    if (response.status === 429 && attempt < maxRetries) {
      const delay = Math.pow(2, attempt) * 1500 + Math.random() * 500;
      console.log(`[Gemini] 429 retry ${attempt + 1}/${maxRetries}, waiting ${Math.round(delay)}ms`);
      await new Promise(r => setTimeout(r, delay));
      continue;
    }
    return response;
  }
  return response;
}

// Models in order of preference. Primary: Gemini 3.5 Flash.
// ВАЖЛИВО: gemini-2.0-flash вимкнений Google 01.06.2026, gemini-2.5-flash
// вимикається до 16.10.2026 (фактично вже віддає помилки) — саме тому
// пошук падав з "ШІ перевантажений" на першому ж запиті.
const MODELS = [
  'gemini-3.5-flash',
  'gemini-3.1-flash-lite',
  'gemini-2.5-flash' // останній fallback, поки Google його остаточно не вимкнув
];

const buildPrompt = (description) => `Ти — кіноексперт. Користувач описує фільм або серіал своїми словами: "${description}"

Визнач, що це за фільм/серіал, і відповідай СУВОРО у такому форматі (3 рядки):
<1-2 коротких дружніх речення українською: що це за фільм і чому підходить під опис>
TITLE: <оригінальна назва англійською>
YEAR: <рік виходу>
TYPE: <movie або tv>

Якщо взагалі не можеш розпізнати — відповідай одним словом: UNKNOWN`;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY not configured in Vercel' });

  const { description } = req.body;
  if (!description?.trim()) return res.status(400).json({ error: 'Text required' });

  const prompt = buildPrompt(description);
  let lastError = '';

  for (const model of MODELS) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
    console.log(`[Gemini] Trying model: ${model}`);

    // IMPORTANT: thinking is ON by default and its tokens count toward
    // maxOutputTokens — without limiting it the answer comes back EMPTY.
    // Gemini 2.5 uses thinkingBudget, Gemini 3.x uses thinkingLevel.
    const generationConfig = {
      temperature: 0.3,
      maxOutputTokens: 1024
    };
    if (model.startsWith('gemini-2.5')) {
      generationConfig.thinkingConfig = { thinkingBudget: 0 };
    } else if (model.startsWith('gemini-3.5')) {
      generationConfig.thinkingConfig = { thinkingLevel: 'minimal' };
    }

    try {
      const response = await fetchWithRetry(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig
        })
      });

      if (response.status === 429) {
        console.log(`[Gemini] ${model} returned 429, trying next model...`);
        lastError = `${model}: 429 rate limit`;
        continue;
      }

      if (!response.ok) {
        const txt = await response.text();
        console.error(`[Gemini] ${model} error ${response.status}:`, txt);
        lastError = `${model}: ${response.status} ${txt.slice(0, 180)}`;
        continue;
      }

      const data = await response.json();
      const resultText = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

      if (!resultText) {
        console.error(`[Gemini] ${model} returned empty text, finishReason:`, data.candidates?.[0]?.finishReason);
        lastError = `${model}: empty text (${data.candidates?.[0]?.finishReason || 'no candidates'})`;
        continue;
      }

      console.log(`[Gemini] Success with model: ${model}`);
      return res.status(200).json({ result: resultText });

    } catch (err) {
      console.error(`[Gemini] ${model} fetch error:`, err.message);
      lastError = `${model}: ${err.message}`;
      continue;
    }
  }

  // detail — справжня причина останньої помилки (видно у Vercel logs і devtools)
  console.error('[Gemini] All models failed. Last error:', lastError);
  return res.status(503).json({
    error: 'ШІ зараз недоступний. Спробуйте за хвилину.',
    detail: lastError
  });
}
