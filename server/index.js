require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const mongoose = require('mongoose');
const YahooFinance = require('yahoo-finance2').default;
const yahooFinance = new YahooFinance();
const User = require('./models/User');

const app = express();
const PORT = process.env.PORT || 5000;

let isAtlasOnline = false;
let lastMarketFetchTime = 0;
const MARKETS_CACHE_TTL = 20000; // 20 saniye
let globalFetchError = null;

// MongoDB Connection with improved error handling for Serverless
mongoose.set('bufferCommands', false); // Mongoose'un veritabanına bağlanmadan işlemleri askıya almasını (buffering) devre dışı bırak.

const connectDB = async () => {
    if (mongoose.connection.readyState >= 1) {
        isAtlasOnline = true;
        return mongoose.connection;
    }

    if (!process.env.MONGODB_URI) {
        throw new Error("MONGODB_URI ortam değişkeni eksik! Lütfen Vercel panelinden ayarlayın.");
    }

    try {
        await mongoose.connect(process.env.MONGODB_URI, {
            serverSelectionTimeoutMS: 5000 // 5 saniye içinde bağlanamazsa hata ver
        });
        isAtlasOnline = true;
        console.log('✅ MongoDB Atlas Bağlantısı Başarılı');
        await migrateSymbols(); // Bağlantıdan sonra sembol migrasyonunu çalıştır
        return mongoose.connection;
    } catch (err) {
        isAtlasOnline = false;
        console.error('❌ MongoDB Atlas Bağlantısı Başarısız:', err.message);
        throw err;
    }
};

// CORS Configuration
const allowedOrigins = [
    'http://localhost:5173',
    'http://localhost:3000',
    'https://borsa-bot-khaki.vercel.app',
    'https://borsabot.vercel.app'
];

app.use(cors({
    origin: function (origin, callback) {
        if (!origin) return callback(null, true);
        if (allowedOrigins.indexOf(origin) === -1 && !origin.endsWith('.vercel.app')) {
            const msg = 'Bu domain için CORS politikası erişime izin vermiyor.';
            return callback(new Error(msg), false);
        }
        return callback(null, true);
    },
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'x-user'],
    credentials: true
}));
app.use(express.json());

let activeFetchPromise = null;

// İstek Günlükçü ve Vercel-Bot Tetikleyici Middleware
app.use('/api', async (req, res, next) => {
    console.log(`[${new Date().toLocaleTimeString('tr-TR', { timeZone: 'Europe/Istanbul' })}] ${req.method} ${req.url} - Kullanıcı: ${req.headers['x-user'] || 'Misafir'}`);

    try {
        await connectDB();
    } catch (err) {
        return res.status(503).json({ error: "Veritabanına bağlanılamadı. Vercel ortam değişkenlerini veya MongoDB IP izinlerini kontrol edin.", details: err.message });
    }

    const now = Date.now();
    // Veri zaman aşımına uğradıysa veya fiyatlar hala 0 ise (Cold Start)
    if (now - lastMarketFetchTime > MARKETS_CACHE_TTL || (marketData[0] && marketData[0].price === 0)) {
        if (!activeFetchPromise) {
            console.log("FETCH REAL MARKET DATA TETIKLENDI (Fiyat 0 veya sure doldu)");
            lastMarketFetchTime = now;
            activeFetchPromise = fetchRealMarketData().catch(err => {
                console.error('Auto-trigger fetch error:', err);
            }).finally(() => {
                activeFetchPromise = null;
            });
        }

        // Bu istek beklemede olan getirme işlemini tamamlamasını beklesin
        try {
            await activeFetchPromise;
        } catch (err) { }
    }

    next();
});

const COMMISSION_RATE = 0.0005; // 5/10000 komisyon oranı

// Eski semboller için migrasyon (THYAO -> THYAO.IS)
const migrateSymbols = async () => {
    try {
        const users = await User.find({});
        for (let user of users) {
            let changed = false;
            // Portföy migrasyonu
            user.portfolio = user.portfolio.map(p => {
                if (!p.symbol.endsWith('.IS')) {
                    p.symbol = p.symbol + '.IS';
                    changed = true;
                }
                return p;
            });
            // History migration
            user.history = user.history.map(h => {
                if (h.symbol && !h.symbol.endsWith('.IS')) {
                    h.symbol = h.symbol + '.IS';
                    changed = true;
                }
                return h;
            });
            if (changed) {
                user.markModified('portfolio');
                user.markModified('history');
                await user.save();
                console.log(`Semboller güncellendi, kullanıcı: ${user.username}`);
            }
        }
    } catch (err) {
        console.error('Migrasyon Hatası:', err);
    }
};

// Yeni kullanıcı için başlangıç verileri
const getInitialUserData = (username) => ({
    username,
    balance: 100000.00,
    portfolio: [],
    history: [],
    wealthHistory: [{ time: new Date().toLocaleTimeString('tr-TR', { timeZone: 'Europe/Istanbul' }), wealth: 100000 }],
    wealthSnapshots: {
        dayStart: { date: new Date().toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul' }), wealth: 100000 },
        weekStart: { date: new Date().toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul' }), wealth: 100000 },
        monthStart: { date: `${new Date().getFullYear()}-${new Date().getMonth() + 1}`, wealth: 100000 },
        yearStart: { date: `${new Date().getFullYear()}`, wealth: 100000 }
    },
    botConfigs: {},
    stats: { winRate: 0, bestStock: '-', totalTrades: 0, profitableTrades: 0 }
});

// BIST 100 Başlıca Hisseler
const BIST_STOCK_SYMBOLS = [
    { symbol: 'THYAO.IS', name: 'Türk Hava Yolları' },
    { symbol: 'ASELS.IS', name: 'Aselsan' },
    { symbol: 'EREGL.IS', name: 'Erdemir' },
    { symbol: 'KCHOL.IS', name: 'Koç Holding' },
    { symbol: 'SASA.IS', name: 'Sasa Polyester' },
    { symbol: 'TUPRS.IS', name: 'Tüpraş' },
    { symbol: 'SISE.IS', name: 'Şişecam' },
    { symbol: 'GARAN.IS', name: 'Garanti BBVA' },
    { symbol: 'AKBNK.IS', name: 'Akbank' },
    { symbol: 'BIMAS.IS', name: 'BİM Mağazalar' },
];

let marketData = BIST_STOCK_SYMBOLS.map(stock => ({
    ...stock,
    price: 0,
    dayStartPrice: 0,
    change: 0,
    changePercent: 0,
    priceHistory: [],
    indicators: {
        sma5: 0,
        sma10: 0,
        rsi: 50,
        recommendation: 'TUT',
        macd: { line: 0, signal: 0, hist: 0 },
        bollinger: { upper: 0, middle: 0, lower: 0 },
        fisher: { val1: 0, val2: 0 }
    }
}));

const calculateEMA = (data, period) => {
    if (data.length < period) return data[data.length - 1];
    const k = 2 / (period + 1);
    let ema = data[0];
    for (let i = 1; i < data.length; i++) {
        ema = (data[i] * k) + (ema * (1 - k));
    }
    return ema;
};

// Gösterge hesaplama fonksiyonu
const calculateIndicators = (history, currentPrice, symbol) => {
    if (history.length < 2) return { sma5: 0, sma10: 0, ema7: 0, rsi: 50, recommendation: 'TUT', macd: { line: 0, signal: 0, hist: 0 }, bollinger: { upper: 0, middle: 0, lower: 0 }, fisher: { val1: 0, val2: 0 } };
    const prices = history.map(h => h.price);
    const volumes = history.map(h => h.volume || 0);

    // EMA 7 hesaplama
    const ema7 = calculateEMA(prices, 7);

    // SMA hesaplamaları
    const sma5 = prices.slice(-5).reduce((a, b) => a + b, 0) / Math.min(prices.length, 5);
    const sma10 = prices.slice(-10).reduce((a, b) => a + b, 0) / Math.min(prices.length, 10);

    // RSI (14) hesaplama
    let gains = 0;
    let losses = 0;
    for (let i = Math.max(1, prices.length - 14); i < prices.length; i++) {
        const diff = prices[i] - prices[i - 1];
        if (diff >= 0) gains += diff;
        else losses -= diff;
    }
    const rsi = losses === 0 ? 100 : 100 - (100 / (1 + (gains / losses)));

    // MACD (12, 26, 9) hesaplama
    const ema12 = calculateEMA(prices, 12);
    const ema26 = calculateEMA(prices, 26);
    const macdLine = ema12 - ema26;
    const macdSignal = macdLine * 0.9;
    const macdHist = macdLine - macdSignal;

    // Bollinger Bantları (20, 2) hesaplama
    const bbPeriod = Math.min(prices.length, 20);
    const bbMiddle = prices.slice(-bbPeriod).reduce((a, b) => a + b, 0) / bbPeriod;
    const variance = prices.slice(-bbPeriod).reduce((a, b) => a + Math.pow(b - bbMiddle, 2), 0) / bbPeriod;
    const stdDev = Math.sqrt(variance);
    const bbUpper = bbMiddle + (stdDev * 2);
    const bbLower = bbMiddle - (stdDev * 2);

    // --- 4'LÜ KOMBO ÖZEL: FISHER TRANSFORM (9) ---
    const fishLen = 9;
    const fishPrices = history.slice(-fishLen).map(h => (h.high + h.low) / 2 || h.price);
    const high_ = Math.max(...fishPrices);
    const low_ = Math.min(...fishPrices);

    const roundF = (val) => val > .99 ? .999 : val < -.99 ? -.999 : val;

    const prevIndicator = marketData.find(s => s.symbol === symbol)?.indicators;
    const prevFValue = prevIndicator?.fisherRaw || 0;
    const prevFish1 = prevIndicator?.fisher?.val1 || 0;

    const currentFValue = roundF(.66 * ((currentPrice - low_) / (Math.max(0.01, high_ - low_)) - .5) + .67 * prevFValue);
    const fish1 = .5 * Math.log((1 + currentFValue) / (Math.max(0.001, 1 - currentFValue))) + .5 * prevFish1;
    const fish2 = prevFish1;

    // --- 4'LÜ KOMBO ÖZEL: HACİM MOMENTUM ---
    const vEmaLen = 25;
    let nRes1_array = [0];
    let nRes2_array = [0];

    for (let i = 1; i < prices.length; i++) {
        let xROC = ((prices[i] - prices[i - 1]) / prices[i - 1]) * 100;
        let prevRes1 = nRes1_array[i - 1];
        let prevRes2 = nRes2_array[i - 1];

        let curRes1 = (volumes[i] < volumes[i - 1]) ? (prevRes1 + xROC) : prevRes1;
        let curRes2 = (volumes[i] > volumes[i - 1]) ? (prevRes2 + xROC) : prevRes2;

        nRes1_array.push(curRes1);
        nRes2_array.push(curRes2);
    }

    const sma = (arr, len) => {
        if (arr.length === 0) return 0;
        const period = Math.min(arr.length, len);
        const slice = arr.slice(-period);
        return slice.reduce((a, b) => a + b, 0) / period;
    };

    let nRes3 = nRes1_array[nRes1_array.length - 1] + nRes2_array[nRes2_array.length - 1];
    let nResEMA3 = sma(nRes1_array, vEmaLen) + sma(nRes2_array, vEmaLen);
    const isVolBullish = nRes3 > nResEMA3;

    // --- SİNYAL MANTIĞI (Fisher + Volume Momentum) ---
    let recommendation = 'TUT';

    // KESİN AL KURALI: Fisher Yönü Yukarı (fish1 > fish2) VE Hacim Momentum Yeşil (isVolBullish)
    if (fish1 > fish2 && isVolBullish) {
        recommendation = 'AL';
    }
    // KESİN SAT KURALI: Fisher Yönü Aşağı (fish1 < fish2)
    else if (fish1 < fish2) {
        recommendation = 'SAT';
    }

    // GÜVENLİK FİLTRESİ: GÜÇLÜ ifadeleri tamamen kaldırıldı

    // --- QQE İNDİKATÖRÜ EKLENTİSİ ---
    const rsiLength = 14;
    const ssf = 5;

    const calculateWildersRSI = (data, period) => {
        let rsiArr = [];
        if (data.length < period) return data.map(() => 50);

        let gains = 0, losses = 0;
        for (let i = 1; i <= period; i++) {
            const diff = data[i] - data[i - 1];
            if (diff > 0) gains += diff;
            else losses -= diff;
        }
        let avgGain = gains / period;
        let avgLoss = losses / period;

        rsiArr[period] = avgLoss === 0 ? 100 : 100 - (100 / (1 + (avgGain / avgLoss)));

        for (let i = period + 1; i < data.length; i++) {
            const diff = data[i] - data[i - 1];
            const gain = diff > 0 ? diff : 0;
            const loss = diff < 0 ? -diff : 0;

            avgGain = (avgGain * (period - 1) + gain) / period;
            avgLoss = (avgLoss * (period - 1) + loss) / period;

            let rs = avgGain / avgLoss;
            rsiArr[i] = avgLoss === 0 ? 100 : 100 - (100 / (1 + rs));
        }

        for (let i = 0; i <= period; i++) {
            if (rsiArr[i] === undefined) rsiArr[i] = rsiArr[period] || 50;
        }
        return rsiArr;
    };

    const calculateEMAArray = (data, period) => {
        let emaArr = [];
        let alpha = 2 / (period + 1);
        emaArr[0] = data[0];
        for (let i = 1; i < data.length; i++) {
            const val = data[i] !== undefined ? data[i] : emaArr[i - 1];
            emaArr[i] = alpha * val + (1 - alpha) * emaArr[i - 1];
        }
        return emaArr;
    };

    let rsiRaw = calculateWildersRSI(prices, rsiLength);
    let RSII = calculateEMAArray(rsiRaw, ssf);
    let QQEF = RSII;

    let TR = [0];
    for (let i = 1; i < RSII.length; i++) {
        TR.push(Math.abs(RSII[i] - RSII[i - 1]));
    }

    let wwalpha = 1 / rsiLength;
    let WWMA = [0];
    for (let i = 1; i < TR.length; i++) {
        let prevWWMA = WWMA[i - 1] || 0;
        WWMA.push(wwalpha * TR[i] + (1 - wwalpha) * prevWWMA);
    }

    let ATRRSI = [0];
    for (let i = 1; i < WWMA.length; i++) {
        let prevATRRSI = ATRRSI[i - 1] || 0;
        ATRRSI.push(wwalpha * WWMA[i] + (1 - wwalpha) * prevATRRSI);
    }

    let QUP = [];
    let QDN = [];
    let QQES = [];

    for (let i = 0; i < QQEF.length; i++) {
        QUP.push(QQEF[i] + ATRRSI[i] * 4.236);
        QDN.push(QQEF[i] - ATRRSI[i] * 4.236);

        if (i === 0) {
            QQES.push(0);
            continue;
        }

        let prevQQES = QQES[i - 1] || 0;
        let prevQQEF = QQEF[i - 1] || 0;

        let currentQQES = prevQQES;

        if (QUP[i] < prevQQES) currentQQES = QUP[i];
        else if (QQEF[i] > prevQQES && prevQQEF < prevQQES) currentQQES = QDN[i];
        else if (QDN[i] > prevQQES) currentQQES = QDN[i];
        else if (QQEF[i] < prevQQES && prevQQEF > prevQQES) currentQQES = QUP[i];

        QQES.push(currentQQES);
    }

    let currentQQEF = QQEF[QQEF.length - 1];
    let prevQQEF_val = QQEF[QQEF.length - 2];
    let currentQQES = QQES[QQES.length - 1];
    let prevQQES_val = QQES[QQES.length - 2];

    let recommendationQQE = 'TUT';
    if (currentQQEF > currentQQES && prevQQEF_val <= prevQQES_val) recommendationQQE = 'AL';
    else if (currentQQEF < currentQQES && prevQQEF_val >= prevQQES_val) recommendationQQE = 'SAT';

    return {
        sma5: parseFloat(sma5.toFixed(2)),
        sma10: parseFloat(sma10.toFixed(2)),
        ema7: parseFloat(ema7.toFixed(2)),
        rsi: parseFloat(rsi.toFixed(2)),
        macd: {
            line: parseFloat(macdLine.toFixed(2)),
            signal: parseFloat(macdSignal.toFixed(2)),
            hist: parseFloat(macdHist.toFixed(2))
        },
        bollinger: {
            upper: parseFloat(bbUpper.toFixed(2)),
            middle: parseFloat(bbMiddle.toFixed(2)),
            lower: parseFloat(bbLower.toFixed(2))
        },
        fisher: {
            val1: parseFloat(fish1.toFixed(3)),
            val2: parseFloat(fish2.toFixed(3))
        },
        fisherRaw: currentFValue,
        recommendation,
        recommendationQQE
    };
};

// Gerçek piyasa verilerini Yahoo Finance üzerinden çekme fonksiyonu
const fetchRealMarketData = async () => {
    try {
        if (!isAtlasOnline) return;

        const now = new Date();
        const symbols = marketData.map(s => s.symbol);

        // Güncel fiyatları çek
        console.log(`FETCH_MARKET: Yahoo Finance'den ${symbols.length} sembol cekiliyor...`);
        const quotes = await yahooFinance.quote(symbols);
        console.log(`FETCH_MARKET: ${quotes.length} hisse fiyatı basariyla cekildi.`);

        const fetchPromises = marketData.map(async (stock) => {
            try {
                const quote = quotes.find(q => q.symbol === stock.symbol);
                if (!quote) return stock;

                const newPrice = quote.regularMarketPrice;
                const prevClose = quote.regularMarketPreviousClose || newPrice;
                const change = newPrice - prevClose;
                const changePercent = (change / prevClose) * 100;

                // Saatlik veri çekme mantığı (İndikatörler için)
                const startDate = new Date();
                startDate.setDate(startDate.getDate() - 7); // Son 1 haftalık veri indikatörler için yeterli

                const chartData = await yahooFinance.chart(stock.symbol, {
                    period1: startDate,
                    interval: '1h'
                });

                let history = chartData.quotes
                    .filter(h => h.close !== null && h.close !== undefined)
                    .map(h => ({
                        time: h.date.toLocaleTimeString('tr-TR', { timeZone: 'Europe/Istanbul' }),
                        price: h.close,
                        volume: h.volume || 0,
                        high: h.high || h.close,
                        low: h.low || h.close
                    }));

                // Anlık fiyat GEÇMİŞ SAATLİK MUMLARA EKLENMİYOR
                // Sinyaller dalgalanmasın diye sadece kapanmış saatlik mumları tutuyoruz.
                history = history.slice(-60);

                const indicators = calculateIndicators(history, newPrice, stock.symbol);

                return {
                    ...stock,
                    price: newPrice,
                    dayStartPrice: prevClose,
                    change: parseFloat(change.toFixed(2)),
                    changePercent: parseFloat(changePercent.toFixed(2)),
                    priceHistory: history,
                    indicators
                };
            } catch (err) {
                console.error(`${stock.symbol} verisi işlenirken hata (detay):`, err.stack);
                globalFetchError = `[Hata: ${stock.symbol}] ${err.stack || err.message}`;
                return stock; // Eski 0'lı stock kopyası dönersek API sıfır olarak güncellenir. Ancak mecburen dönüyoruz.
            }
        });

        const updatedData = await Promise.all(fetchPromises);

        // Sadece başarılı fetch'leri (fiyatı > 0 olanları) tespit edersek global marketData'yı ezelim.
        if (updatedData && updatedData.some(d => d.price > 0)) {
            marketData = updatedData;
            globalFetchError = null;
        } else {
            if (!globalFetchError) globalFetchError = "FETCH_MARKET_CRASH: Bütün hisse çekimleri başarısız oldu veya dizi boş!";
            console.error(globalFetchError);
        }

        // Kullanıcı işlemleri ve botları yönet
        if (isAtlasOnline) {
            const usersToProcess = await User.find({});
            for (let user of usersToProcess) {
                let userChanged = false;

                const botConfigs = user.botConfigs;
                if (botConfigs) {
                    const entries = (botConfigs instanceof Map) ? botConfigs.entries() : Object.entries(botConfigs);
                    for (let [symbol, config] of entries) {
                        if (config && config.active) {
                            const stock = marketData.find(s => s.symbol === symbol);
                            if (!stock) continue;

                            const strategyType = config.strategy || 'QQE';
                            let rec = 'TUT';
                            if (strategyType === 'QQE') {
                                rec = stock.indicators?.recommendationQQE || 'TUT';
                            } else {
                                rec = stock.indicators?.recommendation || 'TUT';
                            }

                            // Sinyal değişimi algılama (TUT sinyalini yoksayıyoruz, böylece en son AL veya SAT durumunda kalır)
                            if (rec === 'AL' || rec === 'SAT') {
                                if (config.lastSignal !== rec) {
                                    config.lastSignal = rec;
                                    config.signalStartTime = Date.now();
                                    config.lastAction = 'NONE';
                                    userChanged = true;
                                    console.log(`[BOT SIGNAL CHANGED] User: ${user.username} | Symbol: ${symbol} | New Signal: ${rec}`);

                                    // Eğer sinyal SAT ise ANINDA satış yap
                                    if (rec === 'SAT') {
                                        const stockInPortfolio = user.portfolio.find(p => p.symbol === stock.symbol);
                                        if (stockInPortfolio && stockInPortfolio.amount > 0) {
                                            const sellAmount = stockInPortfolio.amount; // TÜMÜNÜ SAT
                                            const stockRevenue = stock.price * sellAmount;
                                            const commission = stockRevenue * COMMISSION_RATE;
                                            const netRevenue = stockRevenue - commission;

                                            user.balance += netRevenue;
                                            user.portfolio = user.portfolio.filter(p => p.symbol !== stock.symbol);
                                            user.markModified('portfolio');

                                            user.history = [{
                                                id: Date.now() + Math.random(),
                                                type: 'SATIM',
                                                symbol: stock.symbol,
                                                amount: sellAmount,
                                                price: stock.price,
                                                commission: commission,
                                                total: netRevenue,
                                                date: new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' }),
                                                isAuto: true,
                                                reason: strategyType + ' Sinyali (Anında)'
                                            }, ...user.history];

                                            config.lastAction = 'SELL';
                                            userChanged = true;
                                        }
                                    }
                                }
                            }

                            // 1 Saatlik AL Sinyali Bekleme ve İşleme
                            if (config.lastSignal === 'AL' && config.lastAction !== 'BUY') {
                                const waitTimeMs = 60 * 60 * 1000; // 1 saat
                                const elapsed = Date.now() - (config.signalStartTime || Date.now());

                                if (elapsed >= waitTimeMs) {
                                    const stockCost = stock.price * (config.amount || 1);
                                    const commission = stockCost * COMMISSION_RATE;
                                    const totalCost = stockCost + commission;

                                    if (user.balance >= totalCost) {
                                        user.balance -= totalCost;
                                        const existing = user.portfolio.find(p => p.symbol === stock.symbol);
                                        if (existing) {
                                            const totalOwned = existing.amount + (config.amount || 1);
                                            existing.averageCost = (existing.averageCost * existing.amount + totalCost) / totalOwned;
                                            existing.amount = totalOwned;
                                        } else {
                                            user.portfolio = [...user.portfolio, { symbol: stock.symbol, amount: (config.amount || 1), averageCost: (totalCost / (config.amount || 1)) }];
                                        }
                                        user.history = [{
                                            id: Date.now() + Math.random(),
                                            type: 'ALIM',
                                            symbol: stock.symbol,
                                            amount: config.amount || 1,
                                            price: stock.price,
                                            commission: commission,
                                            total: totalCost,
                                            date: new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' }),
                                            isAuto: true,
                                            reason: strategyType + ' Sinyali (1 Saat Gecikmeli)'
                                        }, ...user.history];

                                        config.lastAction = 'BUY'; // Başarıyla alım yapıldığını kaydet
                                        userChanged = true;
                                    } else {
                                        // Yetersiz bakiye uyarısı (spam yapmamak için lastAction'ı BUY_FAILED veya BUY yapalım)
                                        user.history = [{
                                            id: Date.now() + Math.random(),
                                            type: 'SİSTEM',
                                            symbol: stock.symbol,
                                            amount: 0,
                                            price: stock.price,
                                            commission: 0,
                                            total: totalCost,
                                            date: new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' }),
                                            isAuto: true,
                                            reason: `Yetersiz Bakiye! ${config.amount || 1} adet için ${totalCost.toFixed(2)} TL gerekli.`
                                        }, ...user.history];
                                        config.lastAction = 'BUY'; // Tekrar denemesin
                                        userChanged = true;
                                    }
                                }
                            }

                            // Stop-Loss ve Take-Profit Kontrolleri (İkincil tetikleyiciler)
                            // (Sadece elde hisse varsa ve bot açıksa çalışır)
                            const stockInPortfolioSLTP = user.portfolio.find(p => p.symbol === stock.symbol);
                            if (stockInPortfolioSLTP && config.lastAction !== 'SELL') {
                                const profitPercent = ((stock.price - stockInPortfolioSLTP.averageCost) / stockInPortfolioSLTP.averageCost) * 100;
                                const isSL = config.stopLoss && profitPercent <= -Math.abs(config.stopLoss);
                                const isTP = config.takeProfit && profitPercent >= Math.abs(config.takeProfit);

                                if (isSL || isTP) {
                                    const sellAmount = stockInPortfolioSLTP.amount;
                                    const stockRevenue = stock.price * sellAmount;
                                    const commission = stockRevenue * COMMISSION_RATE;
                                    const netRevenue = stockRevenue - commission;

                                    user.balance += netRevenue;
                                    user.portfolio = user.portfolio.filter(p => p.symbol !== stock.symbol);
                                    user.markModified('portfolio');

                                    user.history = [{
                                        id: Date.now() + Math.random(),
                                        type: 'SATIM',
                                        symbol: stock.symbol,
                                        amount: sellAmount,
                                        price: stock.price,
                                        commission: commission,
                                        total: netRevenue,
                                        date: new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' }),
                                        isAuto: true,
                                        reason: isSL ? 'Stop-Loss' : 'Take-Profit'
                                    }, ...user.history];

                                    config.lastAction = 'SELL';
                                    userChanged = true;
                                }
                            }
                        }
                    }

                    if (userChanged) {
                        user.markModified('botConfigs'); // Map ve obje değişiklikleri için kritik
                        user.markModified('portfolio');  // Güvenlik amaçlı her seferinde portföyü modifiye işaretle
                        user.markModified('history');    // Güvenlik amaçlı her seferinde history'yi modifiye işaretle
                    }
                }

                // Varlık Geçmişini Güncelle
                const currentPortfolioValue = user.portfolio.reduce((acc, item) => {
                    const mStock = marketData.find(s => s.symbol === item.symbol);
                    return acc + (mStock ? mStock.price * item.amount : 0);
                }, 0);
                const totalWealth = user.balance + currentPortfolioValue;
                user.wealthHistory = [...(user.wealthHistory || []), { time: now.toLocaleTimeString('tr-TR', { timeZone: 'Europe/Istanbul' }), wealth: totalWealth }].slice(-50);

                // Snapshotları Güncelle
                if (!user.wealthSnapshots) user.wealthSnapshots = {};
                const currentDate = now.toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul' });
                const weekStart = new Date(now);
                weekStart.setDate(now.getDate() - ((now.getDay() + 6) % 7));
                const weekStr = weekStart.toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul' });
                const monthStr = `${now.getFullYear()}-${now.getMonth() + 1}`;

                if (!user.wealthSnapshots.dayStart || user.wealthSnapshots.dayStart.date !== currentDate) {
                    user.wealthSnapshots.dayStart = { date: currentDate, wealth: totalWealth };
                    user.markModified('wealthSnapshots');
                }
                if (!user.wealthSnapshots.weekStart || user.wealthSnapshots.weekStart.date !== weekStr) {
                    user.wealthSnapshots.weekStart = { date: weekStr, wealth: totalWealth };
                    user.markModified('wealthSnapshots');
                }
                if (!user.wealthSnapshots.monthStart || user.wealthSnapshots.monthStart.date !== monthStr) {
                    user.wealthSnapshots.monthStart = { date: monthStr, wealth: totalWealth };
                    user.markModified('wealthSnapshots');
                }
                if (!user.wealthSnapshots.yearStart || user.wealthSnapshots.yearStart.date !== `${now.getFullYear()}`) {
                    user.wealthSnapshots.yearStart = { date: `${now.getFullYear()}`, wealth: totalWealth };
                    user.markModified('wealthSnapshots');
                }

                if (userChanged) {
                    try {
                        await user.save();
                        console.log(`[BOT DB UPDATE] Kullanici ${user.username} portfoyu/tarihcesi guncellendi.`);
                    } catch (e) {
                        console.error(`[CRITICAL BOT DB ERROR] Kullanici ${user.username} portfoyu KAYDEDILEMEDI:`, e.name, e.message);
                        if (e.name === 'VersionError') {
                            console.error('[VersionError] Ayni anda hem arayuzden islem yapildi hem bot tetiklendi. Kayit çakıştı!');
                        }
                    }
                }
            } // end processes
        } // end atlas block
    } catch (error) {
        console.error('Piyasa Verisi Çekme Hatası:', error);
        globalFetchError = error.stack || error.message;
    }
};

// Vercel Serverless ortamında veriler her istekte değil 20 saniyede bir güncellenecek
if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
    setInterval(fetchRealMarketData, 20000); // Local'de 20 saniyeye çektik.
}

// Başlatırken bir kez veri çekmeyi dene
if (isAtlasOnline) {
    fetchRealMarketData();
}

// API Endpoints
app.get('/api/market', (req, res) => res.json({
    version: '5.0.4',
    timestamp: Date.now(),
    data: marketData,
    error: globalFetchError
}));

app.get('/api/user/data', async (req, res) => {
    const username = req.headers['x-user']?.toLowerCase();
    if (!username) return res.status(401).json({ error: 'Yetkilendirme gerekli' });

    try {


        let user = await User.findOne({ username });
        if (!user) {
            user = await User.create(getInitialUserData(username));
        }

        // --- Snapshot İyileştirmesi: Veri istendiğinde snapshot yoksa hemen oluştur ---
        const now = new Date();
        const todayStr = now.toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul' });
        const monthStr = `${now.getFullYear()}-${now.getMonth() + 1}`;
        const yearStr = `${now.getFullYear()}`;
        const weekStart = new Date(now);
        weekStart.setDate(now.getDate() - ((now.getDay() + 6) % 7));
        const weekStr = weekStart.toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul' });

        if (!user.wealthSnapshots) user.wealthSnapshots = {};

        const currentPortfolioValue = user.portfolio.reduce((acc, item) => {
            const mStock = marketData.find(s => s.symbol === item.symbol);
            return acc + (mStock ? mStock.price * item.amount : 0);
        }, 0);
        const totalWealth = user.balance + currentPortfolioValue;

        let userUpdated = false;

        // Snapshot Kontrolleri
        if (!user.wealthSnapshots.dayStart || user.wealthSnapshots.dayStart.date !== todayStr) {
            user.wealthSnapshots.dayStart = { date: todayStr, wealth: totalWealth };
            userUpdated = true;
        }
        if (!user.wealthSnapshots.weekStart || user.wealthSnapshots.weekStart.date !== weekStr) {
            user.wealthSnapshots.weekStart = { date: weekStr, wealth: totalWealth };
            userUpdated = true;
        }
        if (!user.wealthSnapshots.monthStart || user.wealthSnapshots.monthStart.date !== monthStr) {
            user.wealthSnapshots.monthStart = { date: monthStr, wealth: totalWealth };
            userUpdated = true;
        }
        if (!user.wealthSnapshots.yearStart || user.wealthSnapshots.yearStart.date !== yearStr) {
            user.wealthSnapshots.yearStart = { date: yearStr, wealth: totalWealth };
            userUpdated = true;
        }

        // Genişletilmiş İstatistikleri Hesapla
        const history = user.history || [];
        const sellTrades = history.filter(t => t.type === 'SATIM');

        let totalWin = 0;
        const stockStats = {};

        sellTrades.forEach(trade => {
            // Kar hesabı: Satış tutarı - Maliyet
            if (trade.total > (trade.amount * trade.price * (1 - COMMISSION_RATE * 2))) {
                totalWin++;
            }
            if (!stockStats[trade.symbol]) stockStats[trade.symbol] = 0;
            stockStats[trade.symbol] += trade.total;
        });

        const winRate = sellTrades.length > 0 ? ((totalWin / sellTrades.length) * 100).toFixed(1) : 0;
        const bestStock = Object.keys(stockStats).sort((a, b) => stockStats[b] - stockStats[a])[0] || '-';

        const newStats = {
            winRate,
            bestStock,
            totalTrades: history.length,
            profitableTrades: totalWin,
            // Merkezi Hesaplamalar
            totalWealth: totalWealth,
            overallProfit: totalWealth - 100000,
            overallProfitPercent: (((totalWealth - 100000) / 100000) * 100).toFixed(2)
        };

        // Sadece değişiklik varsa kaydet
        if (userUpdated || JSON.stringify(user.stats) !== JSON.stringify(newStats)) {
            user.stats = newStats;
            if (userUpdated) user.markModified('wealthSnapshots');
            await user.save();
        }

        return res.json(user);
    } catch (err) {
        console.error('Kullanıcı Verisi API Hatası:', err);
        res.status(500).json({ error: 'Sunucu hatası', details: err.message, stack: err.stack });
    }
});

app.post('/api/trade/buy', async (req, res) => {
    const username = req.headers['x-user']?.toLowerCase();
    if (!username) return res.status(401).json({ error: 'Yetkilendirme gerekli' });

    const { symbol, amount } = req.body;
    const stock = marketData.find(s => s.symbol === symbol);
    if (!stock) return res.status(404).json({ success: false, message: 'Hisse bulunamadı.' });

    try {

        const user = await User.findOne({ username });
        if (!user) return res.status(404).json({ success: false, message: 'Kullanıcı bulunamadı.' });

        const stockCost = stock.price * amount;
        const commission = stockCost * COMMISSION_RATE;
        const totalCost = stockCost + commission;

        if (totalCost > user.balance) return res.status(400).json({ success: false, message: 'Yetersiz bakiye.' });

        user.balance -= totalCost;
        const existing = user.portfolio.find(p => p.symbol === symbol);
        if (existing) {
            const totalOwned = existing.amount + amount;
            existing.averageCost = (existing.averageCost * existing.amount + totalCost) / totalOwned;
            existing.amount = totalOwned;
        } else {
            user.portfolio = [...user.portfolio, { symbol, amount, averageCost: (totalCost / amount) }];
        }

        user.history = [{
            id: Date.now(),
            type: 'ALIM',
            symbol,
            amount,
            price: stock.price,
            commission: commission,
            total: totalCost,
            date: new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' }),
            isAuto: false
        }, ...user.history];

        await user.save();
        res.json({ success: true, data: user });
    } catch (err) {
        console.error('Alım İşlemi Hatası:', err);
        res.status(500).json({ success: false, message: 'Sunucu hatası' });
    }
});

app.post('/api/trade/sell', async (req, res) => {
    const username = req.headers['x-user']?.toLowerCase();
    if (!username) return res.status(401).json({ error: 'Yetkilendirme gerekli' });

    const { symbol, amount } = req.body;
    try {

        const user = await User.findOne({ username });
        if (!user) return res.status(404).json({ success: false, message: 'Kullanıcı bulunamadı.' });

        const stockInPortfolio = user.portfolio.find(p => p.symbol === symbol);
        if (!stockInPortfolio || stockInPortfolio.amount < amount) {
            return res.status(400).json({ success: false, message: 'Yetersiz hisse adedi.' });
        }

        const stock = marketData.find(s => s.symbol === symbol);
        const stockRevenue = (stock ? stock.price : 0) * amount;
        const commission = stockRevenue * COMMISSION_RATE;
        const netRevenue = stockRevenue - commission;

        user.balance += netRevenue;
        stockInPortfolio.amount -= amount;
        if (stockInPortfolio.amount === 0) {
            user.portfolio = user.portfolio.filter(p => p.symbol !== symbol);
        }

        user.history = [{
            id: Date.now(),
            type: 'SATIM',
            symbol,
            amount,
            price: stock ? stock.price : 0,
            commission: commission,
            total: netRevenue,
            date: new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' }),
            isAuto: false
        }, ...user.history];

        await user.save();
        res.json({ success: true, data: user });
    } catch (err) {
        console.error('Satım İşlemi Hatası:', err);
        res.status(500).json({ success: false, message: 'Sunucu hatası' });
    }
});

app.post('/api/user/reset', async (req, res) => {
    const username = req.headers['x-user']?.toLowerCase();
    if (!username) return res.status(401).json({ error: 'Yetkilendirme gerekli' });

    try {

        const initialData = getInitialUserData(username);
        let user = await User.findOne({ username });
        if (user) {
            user.balance = initialData.balance;
            user.portfolio = initialData.portfolio;
            user.history = initialData.history;
            user.wealthHistory = initialData.wealthHistory;
            user.stats = initialData.stats;
            user.botConfigs = initialData.botConfigs;
            // Snapshot'ları standart başlangıç değerlerine (100.000 TL) geri döndür
            user.wealthSnapshots = initialData.wealthSnapshots;
            user.markModified('wealthSnapshots');
            await user.save();
        }
        res.json({ success: true, data: user });
    } catch (err) {
        console.error('Sıfırlama Hatası:', err);
        res.status(500).json({ success: false, message: 'Sunucu hatası' });
    }
});


app.post('/api/bot/config', async (req, res) => {
    const username = req.headers['x-user']?.toLowerCase();
    if (!username) return res.status(401).json({ error: 'Yetkilendirme gerekli' });

    const { symbol, config } = req.body;
    try {
        await connectDB();
        let user = await User.findOne({ username });
        if (!user) {
            user = await User.create(getInitialUserData(username));
        }

        if (!user.botConfigs || user.botConfigs instanceof Map) {
            // Backward compatibility
            user.botConfigs = {};
        }

        const existing = user.botConfigs[symbol] || {};

        // Bot kapalıyken açıldıysa, eski sinyali unut ki sıradaki ilk AL/SAT sinyalini yakalayabilsin
        if (config.active === true && existing.active !== true) {
            existing.lastSignal = null;
            config.lastSignal = null; // config spread edildiğinde eski değeri ezmesini engelle
        }

        user.botConfigs[symbol] = { ...existing, ...config };

        user.markModified('botConfigs');
        await user.save();

        res.json({ success: true, data: user.botConfigs });
    } catch (err) {
        console.error('Bot Ayar Hatası:', err);
        res.status(500).json({ success: false, message: 'Sunucu hatası' });
    }
});

if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
    app.listen(PORT, async () => {
        console.log(`Sunucu ${PORT} portunda çalışıyor`);
        try {
            await connectDB();
            let user = await User.findOne({ username: 'testuser' });
            if (!user) user = await User.create(getInitialUserData('testuser'));
            if (!user.botConfigs || user.botConfigs instanceof Map) user.botConfigs = {};
            const existing = user.botConfigs['BIMAS.IS'] || {};
            user.botConfigs['BIMAS.IS'] = { ...existing, active: true };
            user.markModified('botConfigs');
            await user.save();
            console.log("BOT CONFIG SAVE TEST PASSED");
        } catch (e) {
            console.error("BOT CONFIG SAVE TEST FAILED:", e);
        }
    });
}

module.exports = app;
