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

/**
 * Belirli bir hisse için KAP bildirimlerini çeker.
 * kap.org.tr'nin bildirim listesi sayfasını parse eder.
 */
async function fetchKapNewsForSymbol(symbol) {
    const cleanSymbol = symbol.replace('.IS', '');
    const url = `${KAP_BASE_URL}/tr/bildirim-sorgu?sectionType=index&textTypeName=&orderBy=date&orderDir=desc&isLarge=false&owner=member&indexType=0&period=&year=&term=&ruleType=&bdkReview=&disclosureClass=&index=&stock=${cleanSymbol}&kriterler=&kategori=&raporTur=&sectorId=&bgfId=`;

    const response = await axios.get(url, {
        timeout: 10000,
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.8',
            'Accept-Encoding': 'gzip, deflate',
            'Referer': 'https://www.kap.org.tr/',
        },
        responseEncoding: 'utf8'
    });

    const $ = cheerio.load(response.data);
    const items = [];

    // KAP bildirim satırlarını parse et
    $('.notification-row, .w-clearfix.w-inline-block.comp-row').each((i, el) => {
        const $el = $(el);

        const titleEl = $el.find('.notification-title, .comp-text, h5, .basic-text-area');
        const dateEl = $el.find('.notification-date, .comp-date, .column-date');
        const linkEl = $el.find('a').first();

        const title = titleEl.first().text().trim();
        const dateText = dateEl.first().text().trim();
        const href = linkEl.attr('href') || '';

        if (!title || title.length < 5) return;

        // Tarih parse etme (DD.MM.YYYY HH:MM veya YYYY-MM-DD formatları)
        let publishedAt = parseTurkishDate(dateText);
        if (!publishedAt) publishedAt = new Date();

        const kapId = href ? href.split('/').pop() : null;

        items.push({
            symbol: cleanSymbol,
            kapId,
            title,
            url: href ? (href.startsWith('http') ? href : `${KAP_BASE_URL}${href}`) : null,
            publishedAt,
            companyName: cleanSymbol,
        });
    });

    // Eğer bildirim satırları bulunamadıysa alternatif selector dene
    if (items.length === 0) {
        $('tr').each((i, el) => {
            if (i === 0) return; // başlık satırı
            const $el = $(el);
            const cells = $el.find('td');
            if (cells.length < 2) return;

            const dateText = $(cells[0]).text().trim();
            const title = $(cells[1]).text().trim();
            const href = $el.find('a').first().attr('href') || '';

            if (!title || title.length < 5) return;

            let publishedAt = parseTurkishDate(dateText);
            if (!publishedAt) return;

            const kapId = href ? href.split('/').pop() : null;

            items.push({
                symbol: cleanSymbol,
                kapId,
                title,
                url: href ? (href.startsWith('http') ? href : `${KAP_BASE_URL}${href}`) : null,
                publishedAt,
                companyName: cleanSymbol,
            });
        });
    }

    return items.slice(0, 10); // Son 10 bildirim
}

/**
 * Türkçe tarih string'ini Date'e çevirir.
 * Formatlar: "10.03.2026 14:30", "2026-03-10", "10 Mart 2026"
 */
function parseTurkishDate(dateStr) {
    if (!dateStr) return null;

    const months = {
        'Ocak': '01', 'Şubat': '02', 'Mart': '03', 'Nisan': '04',
        'Mayıs': '05', 'Haziran': '06', 'Temmuz': '07', 'Ağustos': '08',
        'Eylül': '09', 'Ekim': '10', 'Kasım': '11', 'Aralık': '12'
    };

    // Format: "10.03.2026 14:30"
    const dotMatch = dateStr.match(/(\d{2})\.(\d{2})\.(\d{4})(?:\s+(\d{2}):(\d{2}))?/);
    if (dotMatch) {
        const [, day, month, year, hour = '00', min = '00'] = dotMatch;
        return new Date(`${year}-${month}-${day}T${hour}:${min}:00+03:00`);
    }

    // Format: "2026-03-10"
    const isoMatch = dateStr.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) {
        return new Date(dateStr);
    }

    // Format: "10 Mart 2026"
    for (const [trMonth, numMonth] of Object.entries(months)) {
        if (dateStr.includes(trMonth)) {
            const parts = dateStr.replace(trMonth, numMonth).match(/(\d+)\s+(\d+)\s+(\d+)/);
            if (parts) {
                const [, day, month, year] = parts;
                return new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`);
            }
        }
    }

    return null;
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
        console.log(`[KAP] Toplam ${totalSaved} yeni bildirim kaydedildi. Gemini yorumları üretiliyor...`);
        // Yeni haberler varsa AI yorumlarını üret
        await processPendingComments();
    } else {
        console.log('[KAP] Yeni bildirim bulunamadı.');
    }
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
