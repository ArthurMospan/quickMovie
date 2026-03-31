// Retry with exponential backoff for 429 rate limits
async function fetchWithRetry(url, options, maxRetries = 3) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, options);
    
    if (response.status === 429 && attempt < maxRetries) {
      const delay = Math.pow(2, attempt) * 2000 + Math.random() * 1000;
      console.log(`[Gemini] 429 retry ${attempt + 1}/${maxRetries}, waiting ${Math.round(delay)}ms`);
      await new Promise(r => setTimeout(r, delay));
      continue;
    }
    
    return response;
  }
}

// Try multiple models in order of preference
const MODELS = [
  'gemini-2.0-flash-lite',
  'gemini-2.0-flash', 
  'gemini-1.5-flash'
];

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY not configured in Vercel' });

  const { description } = req.body;
  if (!description?.trim()) return res.status(400).json({ error: 'Text required' });

  const prompt = `Ти - експерт з кіно. Користувач описує фільм: "${description}". 
    Напиши ТІЛЬКИ назву українською та в дужках (Original Title, Year). 
    Наприклад: Матриця (The Matrix, 1999). Якщо не впізнав: "Не вдалося розпізнати фільм".`;

  // Try each model until one works
  for (const model of MODELS) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
    
    console.log(`[Gemini] Trying model: ${model}`);

    try {
      const response = await fetchWithRetry(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
          'x-goog-api-client': 'genai-js/0.1.0'
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 60 }
        })
      });

      if (response.status === 429) {
        console.log(`[Gemini] ${model} returned 429, trying next model...`);
        continue; // Try next model
      }

      if (!response.ok) {
        const txt = await response.text();
        console.error(`[Gemini] ${model} error ${response.status}:`, txt);
        continue; // Try next model
      }

      const data = await response.json();
      const resultText = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim()?.replace(/['"]/g, '');
      
      if (!resultText) continue;

      console.log(`[Gemini] Success with model: ${model}`);
      return res.status(200).json({ result: resultText });

    } catch (err) {
      console.error(`[Gemini] ${model} fetch error:`, err.message);
      continue;
    }
  }

  // All models failed
  return res.status(429).json({ 
    error: 'Всі моделі AI перевантажені. Спробуйте через 30 секунд.' 
  });
}
