const axios = require('axios');
const cheerio = require('cheerio');
const KapNews = require('../models/KapNews');
const { processPendingComments } = require('./geminiService');

// KAP bildirim tipi eşleştirmesi
const DISCLOSURE_TYPES = {
    'FR': 'Finansal Rapor',
    'ODA': 'Özel Durum Açıklaması',
    'BYI': 'Bağımsız Yönetim',
    'MYK': 'Mali Yükümlülük',
    'BOR': 'Borçlanma Aracı',
    'GN': 'Genel',
};

// BIST hisse sembollerine karşılık gelen KAP şirket kodları
const BIST_SYMBOLS = [
    'THYAO', 'ASELS', 'EREGL', 'KCHOL', 'SASA',
    'TUPRS', 'SISE', 'GARAN', 'AKBNK', 'BIMAS'
];

const KAP_BASE_URL = 'https://www.kap.org.tr';

const xml2js = require('xml2js');
const util = require('util');
const parseXml = util.promisify(xml2js.parseString);

/**
 * Belirli bir hisse için haberleri çeker.
 * kap.org.tr'nin WAF'i nedeniyle alternatif olarak Google News RSS'ten KAP araması yapar.
 */
async function fetchKapNewsForSymbol(symbol) {
    const cleanSymbol = symbol.replace('.IS', '');
    const url = `https://news.google.com/rss/search?q=${cleanSymbol}+KAP&hl=tr&gl=TR&ceid=TR:tr`;

    const response = await axios.get(url, {
        timeout: 10000,
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept-Language': 'tr-TR,tr;q=0.9',
        }
    });

    const result = await parseXml(response.data);
    const channel = result?.rss?.channel?.[0];
    const items = channel?.item || [];

    const newsItems = [];

    for (const item of items) {
        let title = item.title?.[0] || '';
        const link = item.link?.[0] || '';
        const pubDateText = item.pubDate?.[0] || '';
        
        // Remove source name from title if it exists (e.g. "- Hürriyet")
        title = title.replace(/\s-\s[^-]+$/, '');

        if (!title || title.length < 5) continue;

        let publishedAt = new Date(pubDateText);
        if (isNaN(publishedAt.getTime())) publishedAt = new Date();

        // Use a hash of the URL or the link itself as kapId since we don't have the numerical ID
        const kapId = 'gn_' + Buffer.from(link).toString('base64').substring(0, 15);

        newsItems.push({
            symbol: cleanSymbol,
            kapId,
            title,
            url: link,
            publishedAt,
            companyName: cleanSymbol,
        });
    }

    return newsItems.slice(0, 10); // Son 10 haber
}

/**
 * Yeni haberleri veritabanına kaydeder (zaten var ise atlar).
 */
async function saveNewNews(newsItems) {
    let savedCount = 0;

    for (const item of newsItems) {
        try {
            // kapId varsa buna göre, yoksa sembol+tarih+başlık kombinasyonuna göre kontrol et
            const query = item.kapId
                ? { kapId: item.kapId }
                : { symbol: item.symbol, title: item.title, publishedAt: item.publishedAt };

            const exists = await KapNews.findOne(query);
            if (exists) continue; // Zaten var, atla

            await KapNews.create(item);
            savedCount++;
        } catch (err) {
            if (err.code === 11000) {
                // Duplicate key — zaten var, normal
            } else {
                console.error(`[KAP] Haber kaydetme hatası (${item.symbol}):`, err.message);
            }
        }
    }

    return savedCount;
}

/**
 * Ana polling fonksiyonu.
 * 15 dakikada bir çalışır, tüm BIST sembollerini tarar.
 * İstekler arasına rastgele jitter ekler.
 */
async function runKapPolling() {
    console.log('[KAP] Polling başladı...');
    let totalSaved = 0;

    for (const symbol of BIST_SYMBOLS) {
        try {
            // Jitter: 2-7 saniye arası rastgele bekleme (rate limit koruması)
            const jitter = 2000 + Math.random() * 5000;
            await new Promise(r => setTimeout(r, jitter));

            const news = await fetchKapNewsForSymbol(symbol);
            const saved = await saveNewNews(news);
            if (saved > 0) {
                console.log(`[KAP] ${symbol}: ${saved} yeni bildirim kaydedildi.`);
                totalSaved += saved;
            }
        } catch (err) {
            console.error(`[KAP] ${symbol} tarama hatası:`, err.message);
        }
    }

    if (totalSaved > 0) {
        console.log(`[KAP] Toplam ${totalSaved} yeni bildirim kaydedildi.`);
    } else {
        console.log('[KAP] Yeni bildirim bulunamadı.');
    }
    
    // Her halükarda bekleyen veya hata almış yorumlar için tekrar dene
    await processPendingComments();
}

/**
 * Polling servisini başlatır (15 dk aralıklarla + jitter).
 */
function startKapPollingService() {
    console.log('[KAP] Bildirim takip servisi başlatılıyor (15 dk aralıklarla)...');

    // İlk çalışmayı 10 saniye sonra yap (sunucu tam başlasın)
    setTimeout(async () => {
        await runKapPolling();
    }, 10000);

    // Sonraki çalışmalar: 15 dk + 0-2 dk rastgele jitter
    setInterval(async () => {
        const jitter = Math.random() * 2 * 60 * 1000; // 0-2 dk jitter
        await new Promise(r => setTimeout(r, jitter));
        await runKapPolling();
    }, 15 * 60 * 1000);
}

module.exports = {
    startKapPollingService,
    fetchKapNewsForSymbol,
    BIST_SYMBOLS
};
