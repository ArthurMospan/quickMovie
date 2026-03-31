// --- Random jitter to avoid bot detection ---
const jitter = () => new Promise(resolve => setTimeout(resolve, Math.random() * 300 + 100));

// --- Try backend serverless function first (bypasses Vercel IP blocks) ---
const callBackendProxy = async (description) => {
    const response = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description })
    });

    if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        const status = response.status;
        if (status === 429) {
          throw new Error('429: Rate Limit. Try again in 5s.');
        }
        throw new Error(errData.error || `Backend error: ${status}`);
    }

    const data = await response.json();
    return data.result;
};

// --- Direct Gemini call (fallback for local dev) ---
const callGeminiDirect = async (description) => {
    const apiKey = localStorage.getItem('GEMINI_API_KEY') || import.meta.env.VITE_GEMINI_API_KEY;
    if (!apiKey) throw new Error("Gemini API Key missing");

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

    const prompt = `Ти - експерт з кіно. Користувач описує фільм своїми словами: "${description}". 
        Твоє завдання - відгадати цей фільм. 
        Напиши ЛИШЕ назву фільму українською мовою та в дужках оригінальну англійську назву і рік випуску (наприклад: "Матриця (The Matrix, 1999)"). 
        Якщо за описом підходить кілька, напиши найвідоміший. Якщо взагалі незрозуміло, напиши "Не вдалося розпізнати фільм". 
        Не пиши ніякого іншого тексту, привітань чи пояснень.`;

    // Add jitter to reduce 429s (600ms for safety)
    await new Promise(r => setTimeout(r, 600));

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
        throw new Error(`Gemini API error: ${response.status}`);
    }

    const data = await response.json();
    try {
        const title = data.candidates[0].content.parts[0].text.trim();
        return title.replace(/['"]/g, '');
    } catch (err) {
        console.error("Failed to parse Gemini response", data);
        throw new Error("Не вдалося розпізнати фільм.");
    }
};

// --- Main export: backend first, then direct fallback ---
export const guessMovieFromDescription = async (description) => {
    try {
        // Try serverless backend first (works on Vercel, avoids 429)
        console.log('Trying backend /api/search...');
        return await callBackendProxy(description);
    } catch (backendErr) {
        console.warn('Backend proxy failed, trying direct Gemini call:', backendErr.message);
        // Fallback to direct call (works on localhost)
        return await callGeminiDirect(description);
    }
};

// Extract English title for TMDB search
export const extractEnglishTitle = (geminiResponse) => {
    // Try to extract text in parentheses like "Матриця (The Matrix, 1999)"
    const match = geminiResponse.match(/\(([^,)]+)/);
    if (match) return match[1].trim();
    // Fallback: return the whole response
    return geminiResponse.replace(/\([^)]*\)/g, '').trim();
};
