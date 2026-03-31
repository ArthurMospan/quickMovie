const getGeminiApiKey = () => {
    return localStorage.getItem('GEMINI_API_KEY') || import.meta.env.VITE_GEMINI_API_KEY;
};

export const guessMovieFromDescription = async (description) => {
    const apiKey = getGeminiApiKey();
    if (!apiKey) throw new Error("Gemini API Key missing");
    
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
    
    const prompt = `Ти - експерт з кіно. Користувач описує фільм своїми словами: "${description}". 
        Твоє завдання - відгадати цей фільм. 
        Напиши ЛИШЕ назву фільму українською мовою та в дужках оригінальну англійську назву і рік випуску (наприклад: "Матриця (The Matrix, 1999)"). 
        Якщо за описом підходить кілька, напиши найвідоміший. Якщо взагалі незрозуміло, напиши "Не вдалося розпізнати фільм". 
        Не пиши ніякого іншого тексту, привітань чи пояснень.`;
    
    const body = {
        contents: [{
            parts: [{ text: prompt }]
        }],
        generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 60
        }
    };

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
    });

    if (!response.ok) {
        throw new Error(`Gemini API error: ${response.status}`);
    }

    const data = await response.json();
    try {
        const title = data.candidates[0].content.parts[0].text.trim();
        return title.replace(/['\"]/g, '');
    } catch (err) {
        console.error("Failed to parse Gemini response", data);
        throw new Error("Не вдалося розпізнати фільм.");
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
