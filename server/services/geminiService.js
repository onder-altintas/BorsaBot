const KapNews = require('../models/KapNews');

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const MODELS_TO_TRY = [
    'gemini-2.5-flash-preview-04-17',
    'gemini-2.0-flash-lite',
    'gemini-2.0-flash'
];

/**
 * Tek bir haber için Gemini AI yorumu üretir.
 */
async function generateCommentForNews(news) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.warn('[Gemini] GEMINI_API_KEY eksik, yorum üretilemiyor.');
        return null;
    }

    if (news.aiComment) {
        return news.aiComment;
    }

    const prompt = `
Sen bir Türk borsa analistisin. Aşağıdaki KAP (Kamuyu Aydınlatma Platformu) bildirimini kısa ve net şekilde yorumla.

Hisse: ${news.symbol}
Şirket: ${news.companyName || news.symbol}
Bildirim Başlığı: ${news.title}
${news.summary ? `İçerik: ${news.summary}` : ''}
Tarih: ${news.publishedAt?.toLocaleDateString('tr-TR') || ''}

Lütfen şu formatta yanıtla (toplamda 3-4 cümle):
- Bu haberin yatırımcı açısından anlamı nedir?
- Hisse fiyatına olumlu mu olumsuz mu etkisi olabilir, neden?

Önemli: Kesin alım/satım tavsiyesi VERME. Sadece haberi yorumla. Türkçe yaz.
    `.trim();

    for (const modelName of MODELS_TO_TRY) {
        try {
            const url = `${GEMINI_API_BASE}/${modelName}:generateContent?key=${apiKey}`;
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: { temperature: 0.7, maxOutputTokens: 512 }
                })
            });

            if (!response.ok) {
                const errText = await response.text();
                console.warn(`[Gemini] Model ${modelName} hatasi (${response.status}): ${errText.substring(0, 200)}`);
                continue;
            }

            const data = await response.json();
            const comment = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
            if (comment) {
                console.log(`[Gemini] Yorum uretildi (${modelName}): ${news.symbol}`);
                return comment;
            }
        } catch (err) {
            console.warn(`[Gemini] Model ${modelName} istek hatasi:`, err.message);
        }
    }

    console.error(`[Gemini] Hicbir model calismiyor. Son denenen: ${MODELS_TO_TRY.join(', ')}`);
    return null;
}

/**
 * Veritabanında aiComment'i null olan haberlerin yorumlarını üretir.
 */
async function processPendingComments() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return;

    try {
        const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000);
        const pendingNews = await KapNews.find({
            aiComment: null,
            createdAt: { $gte: cutoff }
        }).limit(10).sort({ publishedAt: -1 });

        if (pendingNews.length === 0) {
            console.log('[Gemini] Bekleyen yorum yok.');
            return;
        }

        console.log(`[Gemini] ${pendingNews.length} haber icin yorum uretiliyor...`);

        for (const news of pendingNews) {
            const comment = await generateCommentForNews(news);
            if (comment) {
                news.aiComment = comment;
                news.aiCommentAt = new Date();
                await news.save();
            }
            await new Promise(r => setTimeout(r, 2000));
        }
    } catch (err) {
        console.error('[Gemini] processPendingComments hatasi:', err.message);
    }
}

module.exports = { generateCommentForNews, processPendingComments };
