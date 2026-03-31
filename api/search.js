// Extended retry with more jitter and higher delays
async function fetchWithRetry(url, options, maxRetries = 4) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, options);
    
    if (response.status === 429 && attempt < maxRetries) {
      // Exponential backoff: 2s, 5s, 10s, 20s
      const delay = Math.pow(2, attempt) * 2000 + Math.random() * 1000;
      console.log(`[attempt ${attempt}] Gemini 429 detected. Sleeping ${Math.round(delay)}ms...`);
      await new Promise(r => setTimeout(r, delay));
      continue;
    }
    
    return response;
  }
}

export default async function handler(req, res) {
  // Region fix: fra1 (Frankfurt) is set in vercel.json to avoid US IP blocks
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY missing' });

  const { description } = req.body;
  if (!description?.trim()) return res.status(400).json({ error: 'Text required' });

  const prompt = `Ти - експерт з кіно. Користувач описує фільм: "${description}". 
    Напиши ТІЛЬКИ назву українською та в дужках (Original Title, Year). 
    Наприклад: Матриця (The Matrix, 1999). Якщо не впізнав, напиши "Не вдалося розпізнати фільм".`;

  // Switching to gemini-1.5-flash as it's more stable for Free Tier/Serverless than 2.0-flash
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent`;

  try {
    const response = await fetchWithRetry(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey, // More reliable header-based auth
        'x-goog-api-client': 'genai-js/0.1.0'
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 60 }
      })
    });

    if (!response.ok) {
      const txt = await response.text();
      console.error(`Gemini Error ${response.status}:`, txt);
      return res.status(response.status).json({ error: `AI Error ${response.status}`, details: txt });
    }

    const data = await response.json();
    const resultText = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim()?.replace(/['"]/g, '');
    
    if (!resultText) return res.status(500).json({ error: 'Empty AI response' });

    return res.status(200).json({ result: resultText });

  } catch (err) {
    console.error('Fetch error:', err);
    return res.status(500).json({ error: 'Backend connection failed' });
  }
}
