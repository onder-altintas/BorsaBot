const { GoogleGenerativeAI } = require('@google/generative-ai');
const KapNews = require('../models/KapNews');

let genAI = null;

function getGenAI() {
    if (!genAI && process.env.GEMINI_API_KEY) {
        genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    }
    return genAI;
}

/**
 * Tek bir haber için Gemini AI yorumu üretir.
 * Daha önce üretilmişse (aiComment dolu) tekrar üretmez.
 */
async function generateCommentForNews(news) {
    const ai = getGenAI();
    if (!ai) {
        console.warn('[Gemini] GEMINI_API_KEY eksik, yorum üretilemiyor.');
        return null;
    }

    if (news.aiComment) {
        return news.aiComment; // Zaten var, tekrar üretme
    }

    try {
        const model = ai.getGenerativeModel({ model: 'gemini-1.5-flash' });
        const prompt = `
Sen bir Türk borsa analistisin. Aşağıdaki KAP (Kamuyu Aydınlatma Platformu) bildirimini kısa ve net şekilde yorumla.

Hisse: ${news.symbol}
Şirket: ${news.companyName || news.symbol}
Bildirim Başlığı: ${news.title}
${news.summary ? `İçerik: ${news.summary}` : ''}
Tarih: ${news.publishedAt?.toLocaleDateString('tr-TR') || ''}

Lütfen şu formatta yanıtla (toplamda 3-4 cümle):
- Bu haberın yatırımcı açısından anlamı nedir?
- Hisse fiyatına olumlu mu olumsuz mu etkisi olabilir, neden?

Önemli: Kesin alım/satım tavsiyesi VERME. Sadece haberi yorumla. Türkçe yaz.
        `.trim();

        const result = await model.generateContent(prompt);
        const comment = result.response.text().trim();
        return comment;
    } catch (err) {
        console.error(`[Gemini] Yorum üretme hatası (${news.symbol}):`, err.message);
        return null;
    }
}

/**
 * Veritabanında aiComment'i null olan haberlerin yorumlarını üretir.
 * Rate limit koruması için sırayla işler.
 */
async function processPendingComments() {
    const ai = getGenAI();
    if (!ai) return;

    try {
        // Sadece aiComment'i null olan, son 48 saat içinde eklenen haberleri al
        const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000);
        const pendingNews = await KapNews.find({
            aiComment: null,
            createdAt: { $gte: cutoff }
        }).limit(10).sort({ publishedAt: -1 });

        if (pendingNews.length === 0) return;

        console.log(`[Gemini] ${pendingNews.length} haber için yorum üretiliyor...`);

        for (const news of pendingNews) {
            const comment = await generateCommentForNews(news);
            if (comment) {
                news.aiComment = comment;
                news.aiCommentAt = new Date();
                await news.save();
                console.log(`[Gemini] Yorum üretildi: ${news.symbol} - ${news.title.substring(0, 50)}...`);
            }
            // Rate limit koruması: istekler arasında 2 saniye bekle
            await new Promise(r => setTimeout(r, 2000));
        }
    } catch (err) {
        console.error('[Gemini] processPendingComments hatası:', err.message);
    }
}

module.exports = { generateCommentForNews, processPendingComments };
