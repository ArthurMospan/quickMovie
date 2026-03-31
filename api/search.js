export default async function handler(req, res) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Gemini API key not configured on server' });
  }

  const { description } = req.body;
  if (!description || !description.trim()) {
    return res.status(400).json({ error: 'Description is required' });
  }

  const prompt = `Ти - експерт з кіно. Користувач описує фільм своїми словами: "${description}". 
    Твоє завдання - відгадати цей фільм. 
    Напиши ЛИШЕ назву фільму українською мовою та в дужках оригінальну англійську назву і рік випуску (наприклад: "Матриця (The Matrix, 1999)"). 
    Якщо за описом підходить кілька, напиши найвідоміший. Якщо взагалі незрозуміло, напиши "Не вдалося розпізнати фільм". 
    Не пиши ніякого іншого тексту, привітань чи пояснень.`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-client': 'genai-js/0.1.0'
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 60
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Gemini API error ${response.status}:`, errorText);
      return res.status(response.status).json({ 
        error: `Gemini API error: ${response.status}`,
        details: errorText 
      });
    }

    const data = await response.json();
    
    try {
      const title = data.candidates[0].content.parts[0].text.trim().replace(/['"]/g, '');
      return res.status(200).json({ result: title });
    } catch (parseErr) {
      console.error('Failed to parse Gemini response:', data);
      return res.status(500).json({ error: 'Failed to parse AI response' });
    }

  } catch (fetchErr) {
    console.error('Gemini fetch error:', fetchErr);
    return res.status(500).json({ error: 'Failed to connect to Gemini API' });
  }
}
