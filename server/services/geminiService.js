const KapNews = require('../models/KapNews');

/**
 * Yapay zeka yorum servisi - OpenRouter kullanır (Türkiye dahil her yerden erişilebilir)
 * Fallback sırası: OpenRouter -> Gemini REST API
 */

async function callOpenRouter(prompt) {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) return null;

    try {
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
                'HTTP-Referer': 'https://borsabot.app',
                'X-Title': 'BorsaBot'
            },
            body: JSON.stringify({
                model: 'meta-llama/llama-4-scout:free', 
                messages: [{ role: 'user', content: prompt }],
                max_tokens: 512,
                temperature: 0.7
            })
        });

        if (!response.ok) {
            const err = await response.text();
            console.warn('[AI] OpenRouter hatasi:', response.status, err.substring(0, 200));
            return null;
        }

        const data = await response.json();
        return data?.choices?.[0]?.message?.content?.trim() || null;
    } catch (err) {
        console.warn('[AI] OpenRouter baglanti hatasi:', err.message);
        return null;
    }
}

async function callGemini(prompt) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return null;

    const models = ['gemini-2.0-flash-lite', 'gemini-2.0-flash', 'gemini-1.5-flash'];

    for (const modelName of models) {
        try {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: { temperature: 0.7, maxOutputTokens: 512 }
                })
            });

            if (!response.ok) continue;

            const data = await response.json();
            const comment = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
            if (comment) {
                console.log(`[AI] Gemini ${modelName} ile yorum uretildi.`);
                return comment;
            }
        } catch (err) {
            console.warn(`[AI] Gemini ${modelName} hatasi:`, err.message);
        }
    }
    return null;
}

async function generateCommentForNews(news) {
    if (news.aiComment) return news.aiComment;

    if (!process.env.OPENROUTER_API_KEY && !process.env.GEMINI_API_KEY) {
        console.warn('[AI] AI API anahtari bulunamadi.');
        return null;
    }

    const prompt = `Sen bir Türk borsa analistisin. Aşağıdaki KAP bildirimini kısa ve net şekilde yorumla (3-4 cümle, Türkçe).

Hisse: ${news.symbol}
Şirket: ${news.companyName || news.symbol}
Başlık: ${news.title}
${news.summary ? `İçerik: ${news.summary.substring(0, 500)}` : ''}

Yorumda şunlara değin:
- Haberin yatırımcı açısından anlamı
- Hisse fiyatına olası etkisi (olumlu/olumsuz/nötr)

Not: Kesin alım/satım tavsiyesi VERME.`;

    // Önce OpenRouter dene (küresel erişim), sonra Gemini
    const comment = await callOpenRouter(prompt) || await callGemini(prompt);

    if (!comment) {
        console.error('[AI] Hicbir AI servisi calismiyor.');
    }

    return comment;
}

async function processPendingComments() {
    if (!process.env.OPENROUTER_API_KEY && !process.env.GEMINI_API_KEY) return;

    try {
        const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000);
        const pendingNews = await KapNews.find({
            aiComment: null,
            createdAt: { $gte: cutoff }
        }).limit(10).sort({ publishedAt: -1 });

        if (pendingNews.length === 0) {
            console.log('[AI] Bekleyen yorum yok.');
            return;
        }

        console.log(`[AI] ${pendingNews.length} haber icin yorum uretiliyor...`);

        for (const news of pendingNews) {
            const comment = await generateCommentForNews(news);
            if (comment) {
                news.aiComment = comment;
                news.aiCommentAt = new Date();
                await news.save();
                console.log(`[AI] Yorum kaydedildi: ${news.symbol}`);
            }
            await new Promise(r => setTimeout(r, 2000));
        }
    } catch (err) {
        console.error('[AI] processPendingComments hatasi:', err.message);
    }
}

module.exports = { generateCommentForNews, processPendingComments };
