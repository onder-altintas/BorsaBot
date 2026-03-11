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
        let comment = null;
        let lastError = null;
        const modelsToTry = ['gemini-1.5-flash', 'gemini-1.5-pro-latest', 'gemini-pro'];

        for (const modelName of modelsToTry) {
            try {
                const model = ai.getGenerativeModel({ model: modelName });
                const result = await model.generateContent(prompt);
                comment = result.response.text().trim();
                break; // Basarili olursa donguden cik
            } catch (e) {
                console.warn(`[Gemini] Model ${modelName} basarisiz (${e.status || e.message}). Diger modele geciliyor...`);
                lastError = e;
            }
        }

        if (!comment) {
            console.error(`[Gemini] Hicbir model calismadi. Son hata:`, lastError?.message);
            return null;
        }

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
        console.log('[Gemini DEBUG] API baglantisi kuruluyor...');
        const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000);
        console.log(`[Gemini DEBUG] Cutoff date: ${cutoff}`);

        const pendingNews = await KapNews.find({
            aiComment: null,
            createdAt: { $gte: cutoff }
        }).limit(10).sort({ publishedAt: -1 });

        console.log(`[Gemini DEBUG] db'den cekilen pendingNews sayisi: ${pendingNews.length}`);

        if (pendingNews.length === 0) return;

        console.log(`[Gemini] ${pendingNews.length} haber için yorum üretiliyor...`);

        for (const news of pendingNews) {
            console.log(`[Gemini DEBUG] ID: ${news._id}, Symbol: ${news.symbol} icin yorum uretimi basliyor...`);
            const comment = await generateCommentForNews(news);
            if (comment) {
                news.aiComment = comment;
                news.aiCommentAt = new Date();
                await news.save();
                console.log(`[Gemini] Yorum üretildi: ${news.symbol} - ${news.title.substring(0, 50)}...`);
            } else {
                console.log(`[Gemini DEBUG] ID: ${news._id} icin uretim BASARISIZ veya return NULL (Loglari kontrol edin).`);
            }
            await new Promise(r => setTimeout(r, 2000));
        }
    } catch (err) {
        console.error('[Gemini DEBUG] processPendingComments kokundeki hata:', err);
    }
}

module.exports = { generateCommentForNews, processPendingComments };
