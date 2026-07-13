// --- Shared prompt (same as api/search.js) ---
const buildPrompt = (description) => `Ти — кіноексперт. Користувач описує фільм або серіал своїми словами: "${description}"

Визнач, що це за фільм/серіал, і відповідай СУВОРО у такому форматі (3 рядки):
<1-2 коротких дружніх речення українською: що це за фільм і чому підходить під опис>
TITLE: <оригінальна назва англійською>
YEAR: <рік виходу>
TYPE: <movie або tv>

Якщо взагалі не можеш розпізнати — відповідай одним словом: UNKNOWN`;

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
        throw new Error("ШІ-пошук тимчасово недоступний. Спробуйте через хвилину.");
    }

    console.log('[AI Search] Trying direct Gemini call...');

    // gemini-2.0-flash вимкнено Google 01.06.2026; 2.5-flash — до 16.10.2026.
    // Актуальні стабільні: 3.5-flash та 3.1-flash-lite (тримати в синхроні з api/search.js).
    const models = ['gemini-3.5-flash', 'gemini-3.1-flash-lite', 'gemini-2.5-flash'];
    const prompt = buildPrompt(description);

    for (const model of models) {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

        // Disable/minimize thinking, otherwise it eats maxOutputTokens and returns empty text.
        // Gemini 2.5 → thinkingBudget, Gemini 3.5 → thinkingLevel.
        const generationConfig = { temperature: 0.3, maxOutputTokens: 1024 };
        if (model.startsWith('gemini-2.5')) {
            generationConfig.thinkingConfig = { thinkingBudget: 0 };
        } else if (model.startsWith('gemini-3.5')) {
            generationConfig.thinkingConfig = { thinkingLevel: 'minimal' };
        }

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig
                })
            });

            if (!response.ok) {
                console.warn(`[AI Search] ${model} returned ${response.status}, trying next...`);
                continue;
            }

            const data = await response.json();
            const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
            if (text) return text;
        } catch (e) {
            console.warn(`[AI Search] ${model} failed:`, e.message);
            continue;
        }
    }

    throw new Error('ШІ зараз недоступний. Спробуйте за хвилину.');
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

// --- Parse the structured AI answer ---
// Returns { unknown } or { text, title, year, type }
export const parseAIAnswer = (raw) => {
    if (!raw) return { unknown: true };
    const cleaned = raw.trim().replace(/\*\*/g, '');

    if (/^UNKNOWN\b/i.test(cleaned) || /Не вдалося розпізнати/i.test(cleaned)) {
        return { unknown: true };
    }

    const title = cleaned.match(/TITLE:\s*(.+)/i)?.[1]?.trim()?.replace(/["«»]/g, '');
    const yearStr = cleaned.match(/YEAR:\s*(\d{4})/i)?.[1];
    const typeStr = cleaned.match(/TYPE:\s*(movie|tv|series|серіал)/i)?.[1]?.toLowerCase();

    // Human-readable part = everything except the TITLE/YEAR/TYPE service lines
    const text = cleaned
        .split('\n')
        .filter(line => !/^\s*(TITLE|YEAR|TYPE):/i.test(line))
        .join('\n')
        .trim();

    if (title) {
        return {
            text: text || null,
            title,
            year: yearStr ? parseInt(yearStr) : null,
            type: typeStr === 'movie' ? 'movie' : (typeStr ? 'tv' : null)
        };
    }

    // Legacy format fallback: "Назва (Original Title, 1999)"
    const m = cleaned.match(/\(([^,()]+?)(?:,\s*(\d{4}))?\)/);
    if (m) {
        return { text: cleaned, title: m[1].trim(), year: m[2] ? parseInt(m[2]) : null, type: null };
    }

    // Last resort: treat the whole answer as a title
    return { text: null, title: cleaned.split('\n')[0].slice(0, 80), year: null, type: null };
};
