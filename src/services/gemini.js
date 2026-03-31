// --- Try backend serverless function first (the proper way on Vercel) ---
const callBackendProxy = async (description) => {
    console.log('Gemini: trying backend /api/search...');
    
    const response = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description })
    });

    if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        const msg = errData.error || `Backend error: ${response.status}`;
        console.warn('Backend proxy failed:', msg);
        throw new Error(msg);
    }

    const data = await response.json();
    return data.result;
};

// --- Direct Gemini call (fallback — works on localhost AND Vercel if backend is down) ---
const callGeminiDirect = async (description) => {
    // Check multiple sources for the API key
    const apiKey = localStorage.getItem('GEMINI_API_KEY') 
        || import.meta.env.VITE_GEMINI_API_KEY 
        || null;
    
    if (!apiKey) {
        throw new Error("Gemini API ключ відсутній. Додайте VITE_GEMINI_API_KEY в Vercel Dashboard.");
    }

    console.log('Gemini: trying direct call with key...');

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

    const prompt = `Ти - експерт з кіно. Користувач описує фільм своїми словами: "${description}". 
        Твоє завдання - відгадати цей фільм. 
        Напиши ЛИШЕ назву фільму українською мовою та в дужках оригінальну англійську назву і рік випуску (наприклад: "Матриця (The Matrix, 1999)"). 
        Якщо за описом підходить кілька, напиши найвідоміший. Якщо взагалі незрозуміло, напиши "Не вдалося розпізнати фільм". 
        Не пиши ніякого іншого тексту, привітань чи пояснень.`;

    // Small delay to reduce 429s
    await new Promise(r => setTimeout(r, 500));

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

    if (response.status === 429) {
        throw new Error('Занадто багато запитів. Зачекайте 10 секунд і спробуйте знову.');
    }

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
        return await callBackendProxy(description);
    } catch (backendErr) {
        console.warn('Backend failed:', backendErr.message, '— trying direct...');
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
