// --- Try backend serverless function first ---
const callBackendProxy = async (description) => {
    console.log('[AI Search] Trying backend /api/search...');
    
    const response = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description })
    });

    if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `Backend error: ${response.status}`);
    }

    const data = await response.json();
    return data.result;
};

// --- Direct Gemini call (fallback for local dev or if backend is down) ---
const callGeminiDirect = async (description) => {
    const apiKey = localStorage.getItem('GEMINI_API_KEY') 
        || import.meta.env.VITE_GEMINI_API_KEY 
        || null;
    
    if (!apiKey) {
        throw new Error("AI-пошук тимчасово недоступний. Спробуйте через хвилину.");
    }

    console.log('[AI Search] Trying direct Gemini call...');

    // Try lighter model first
    const models = ['gemini-2.0-flash-lite', 'gemini-2.0-flash'];
    
    for (const model of models) {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

        const prompt = `Ти - експерт з кіно. Користувач описує фільм: "${description}". 
            Напиши ЛИШЕ назву українською та в дужках (Original Title, Year). 
            Наприклад: Матриця (The Matrix, 1999). Якщо не впізнав: "Не вдалося розпізнати фільм".`;

        try {
            await new Promise(r => setTimeout(r, 300));

            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-goog-api-client': 'genai-js/0.1.0'
                },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: { temperature: 0.2, maxOutputTokens: 60 }
                })
            });

            if (response.status === 429) {
                console.warn(`[AI Search] ${model} returned 429, trying next...`);
                continue;
            }

            if (!response.ok) continue;

            const data = await response.json();
            const title = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim()?.replace(/['"]/g, '');
            if (title) return title;
        } catch (e) {
            console.warn(`[AI Search] ${model} failed:`, e.message);
            continue;
        }
    }
    
    throw new Error('AI перевантажений. Спробуйте через 30 секунд.');
};

// --- Main export ---
export const guessMovieFromDescription = async (description) => {
    try {
        return await callBackendProxy(description);
    } catch (backendErr) {
        console.warn('[AI Search] Backend failed:', backendErr.message);
        return await callGeminiDirect(description);
    }
};

// Extract English title for TMDB search
export const extractEnglishTitle = (geminiResponse) => {
    const match = geminiResponse.match(/\(([^,)]+)/);
    if (match) return match[1].trim();
    return geminiResponse.replace(/\([^)]*\)/g, '').trim();
};
