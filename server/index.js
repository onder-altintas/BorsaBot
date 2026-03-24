require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const path = require('path');
const mongoose = require('mongoose');
const YahooFinance = require('yahoo-finance2').default;
const yahooFinance = new YahooFinance();
const User = require('./models/User');
const KapNews = require('./models/KapNews');
const SignalHistory = require('./models/SignalHistory');
const { startKapPollingService } = require('./services/kapService');


const app = express();
const PORT = process.env.PORT || 5000;


let lastMarketFetchTime = 0;
const MARKETS_CACHE_TTL = 20000; // 20 saniye
let globalFetchError = null;

// MongoDB Bağlantısı
mongoose.set('bufferCommands', false);

const connectDB = async () => {
    if (mongoose.connection.readyState >= 1) {
        return mongoose.connection;
    }

    if (!process.env.MONGODB_URI) {
        throw new Error('MONGODB_URI ortam değişkeni eksik!');
    }

    try {
        await mongoose.connect(process.env.MONGODB_URI, {
            serverSelectionTimeoutMS: 5000
        });
        console.log('✅ MongoDB Bağlantısı Başarılı');
        await migrateSymbols();
        return mongoose.connection;
    } catch (err) {
        console.error('❌ MongoDB Bağlantısı Başarısız:', err.message);
        throw err;
    }
};

// CORS Ayarları
const allowedOrigins = [
    'http://localhost:5173',
    'http://localhost:3000',
    'http://88.198.174.52:5000',
    'http://88.198.174.52'
];

app.use(cors({
    origin: function (origin, callback) {
        if (!origin) return callback(null, true);
        if (allowedOrigins.indexOf(origin) === -1) {
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

// İstek Günlükçü Middleware
app.use('/api', async (req, res, next) => {
    console.log(`[${new Date().toLocaleTimeString('tr-TR', { timeZone: 'Europe/Istanbul' })}] ${req.method} ${req.url} - Kullanıcı: ${req.headers['x-user'] || 'Misafir'}`);

    try {
        await connectDB();
    } catch (err) {
        return res.status(503).json({ error: 'Veritabanına bağlanılamadı.', details: err.message });
    }

    const now = Date.now();
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

// QQE İndikatörü hesaplama fonksiyonu (tüm zaman dilimleri için ortak)
const calculateQQESignal = (history) => {
    if (history.length < 2) return 'TUT';
    const prices = history.map(h => h.price);

    const rsiLength = 14;
    const ssf = 5;
    const qqeFactor = 4.236;

    const calcRMA = (data, period) => {
        let arr = [data[0]];
        const alpha = 1 / period;
        for (let i = 1; i < data.length; i++) {
            arr[i] = alpha * (data[i] ?? arr[i - 1]) + (1 - alpha) * arr[i - 1];
        }
        return arr;
    };

    const calcRSI = (data, period) => {
        if (data.length < 2) return data.map(() => 50);
        const gains = [0], losses = [0];
        for (let i = 1; i < data.length; i++) {
            const d = data[i] - data[i - 1];
            gains.push(Math.max(0, d));
            losses.push(Math.max(0, -d));
        }
        const ag = calcRMA(gains, period);
        const al = calcRMA(losses, period);
        return ag.map((g, i) => al[i] === 0 ? 100 : 100 - (100 / (1 + g / al[i])));
    };

    const calcEMAArr = (data, period) => {
        let arr = [data[0]];
        const alpha = 2 / (period + 1);
        for (let i = 1; i < data.length; i++) {
            arr[i] = alpha * (data[i] ?? arr[i - 1]) + (1 - alpha) * arr[i - 1];
        }
        return arr;
    };

    const QQEF = calcEMAArr(calcRSI(prices, rsiLength), ssf);
    const TR = [0];
    for (let i = 1; i < QQEF.length; i++) TR.push(Math.abs(QQEF[i] - QQEF[i - 1]));

    const dar = calcEMAArr(calcEMAArr(TR, 27), 27).map(v => v * qqeFactor);
    const QUP = QQEF.map((v, i) => v + dar[i]);
    const QDN = QQEF.map((v, i) => v - dar[i]);
    const QQES = [0];

    for (let i = 1; i < QQEF.length; i++) {
        const prev = QQES[i - 1] || 0;
        let cur = prev;
        if (QUP[i] < prev) cur = QUP[i];
        else if (QQEF[i] > prev && QQEF[i - 1] < prev) cur = QDN[i];
        else if (QDN[i] > prev) cur = QDN[i];
        else if (QQEF[i] < prev && QQEF[i - 1] > prev) cur = QUP[i];
        QQES.push(cur);
    }

    return QQEF[QQEF.length - 1] > QQES[QQES.length - 1] ? 'AL' : 'SAT';
};

// Gösterge hesaplama fonksiyonu (geriye dönük uyumluluk için)
const calculateIndicators = (history, currentPrice, symbol) => {
    if (history.length < 2) return { sma5: 0, sma10: 0, ema7: 0, rsi: 50, macd: { line: 0, signal: 0, hist: 0 }, bollinger: { upper: 0, middle: 0, lower: 0 }, qqe_1h: 'TUT', qqe_4h: 'TUT', qqe_1d: 'TUT' };
    const prices = history.map(h => h.price);

    const ema7 = calculateEMA(prices, 7);
    const sma5 = prices.slice(-5).reduce((a, b) => a + b, 0) / Math.min(prices.length, 5);
    const sma10 = prices.slice(-10).reduce((a, b) => a + b, 0) / Math.min(prices.length, 10);

    let gains = 0, losses = 0;
    for (let i = Math.max(1, prices.length - 14); i < prices.length; i++) {
        const diff = prices[i] - prices[i - 1];
        if (diff >= 0) gains += diff; else losses -= diff;
    }
    const rsi = losses === 0 ? 100 : 100 - (100 / (1 + gains / losses));

    const ema12 = calculateEMA(prices, 12);
    const ema26 = calculateEMA(prices, 26);
    const macdLine = ema12 - ema26;
    const macdSignal = macdLine * 0.9;
    const macdHist = macdLine - macdSignal;

    const bbPeriod = Math.min(prices.length, 20);
    const bbMiddle = prices.slice(-bbPeriod).reduce((a, b) => a + b, 0) / bbPeriod;
    const variance = prices.slice(-bbPeriod).reduce((a, b) => a + Math.pow(b - bbMiddle, 2), 0) / bbPeriod;
    const stdDev = Math.sqrt(variance);

    const qqe_1h = calculateQQESignal(history);

    return {
        sma5: parseFloat(sma5.toFixed(2)),
        sma10: parseFloat(sma10.toFixed(2)),
        ema7: parseFloat(ema7.toFixed(2)),
        rsi: parseFloat(rsi.toFixed(2)),
        macd: { line: parseFloat(macdLine.toFixed(2)), signal: parseFloat(macdSignal.toFixed(2)), hist: parseFloat(macdHist.toFixed(2)) },
        bollinger: { upper: parseFloat((bbMiddle + stdDev * 2).toFixed(2)), middle: parseFloat(bbMiddle.toFixed(2)), lower: parseFloat((bbMiddle - stdDev * 2).toFixed(2)) },
        qqe_1h,
        qqe_4h: 'TUT', // fetchRealMarketData tarafından doldurulur
        qqe_1d: 'TUT'  // fetchRealMarketData tarafından doldurulur
    };
};

// Gerçek piyasa verilerini Yahoo Finance üzerinden çekme fonksiyonu
const fetchRealMarketData = async () => {
    try {
        const now = new Date();
        const symbols = marketData.map(s => s.symbol);

        console.log(`FETCH_MARKET: Yahoo Finance'den ${symbols.length} sembol cekiliyor...`);
        const quotes = await yahooFinance.quote(symbols);
        console.log(`FETCH_MARKET: ${quotes.length} hisse fiyatı basariyla cekildi.`);

        const mapHistory = (quotes) => quotes
            .filter(h => h.close !== null && h.close !== undefined)
            .map(h => ({
                time: h.date.toLocaleTimeString('tr-TR', { timeZone: 'Europe/Istanbul' }),
                price: h.close,
                volume: h.volume || 0,
                high: h.high || h.close,
                low: h.low || h.close
            }));

        const fetchPromises = marketData.map(async (stock) => {
            try {
                const quote = quotes.find(q => q.symbol === stock.symbol);
                if (!quote) return stock;

                const newPrice = quote.regularMarketPrice;
                const prevClose = quote.regularMarketPreviousClose || newPrice;
                const change = newPrice - prevClose;
                const changePercent = (change / prevClose) * 100;

                // 1 Saatlik veri (son 7 gün) — temel göstergeler + qqe_1h
                const start1h = new Date();
                start1h.setDate(start1h.getDate() - 7);
                const chart1h = await yahooFinance.chart(stock.symbol, { period1: start1h, interval: '1h' });
                const history1h = mapHistory(chart1h.quotes).slice(-60);

                // 4 Saatlik veri (son 60 günlük 1h mumları 4'erli grupla)
                const start4h = new Date();
                start4h.setDate(start4h.getDate() - 60);
                const chart4h = await yahooFinance.chart(stock.symbol, { period1: start4h, interval: '1h' });
                const raw4h = mapHistory(chart4h.quotes);
                const history4h = [];
                for (let i = 0; i < raw4h.length; i += 4) {
                    const group = raw4h.slice(i, i + 4);
                    if (group.length === 0) continue;
                    history4h.push({
                        time: group[group.length - 1].time,
                        price: group[group.length - 1].price,
                        volume: group.reduce((s, x) => s + x.volume, 0),
                        high: Math.max(...group.map(x => x.high)),
                        low: Math.min(...group.map(x => x.low))
                    });
                }

                // Günlük veri (son 180 gün)
                const start1d = new Date();
                start1d.setDate(start1d.getDate() - 180);
                const chart1d = await yahooFinance.chart(stock.symbol, { period1: start1d, interval: '1d' });
                const history1d = mapHistory(chart1d.quotes).slice(-100);

                // QQE Sinyalleri: her zaman dilimi için ayrı hesapla
                const qqe_1h = calculateQQESignal(history1h);
                const qqe_4h = calculateQQESignal(history4h);
                const qqe_1d = calculateQQESignal(history1d);

                const indicators = calculateIndicators(history1h, newPrice, stock.symbol);
                indicators.qqe_1h = qqe_1h;
                indicators.qqe_4h = qqe_4h;
                indicators.qqe_1d = qqe_1d;

                return {
                    ...stock,
                    price: newPrice,
                    dayStartPrice: prevClose,
                    change: parseFloat(change.toFixed(2)),
                    changePercent: parseFloat(changePercent.toFixed(2)),
                    priceHistory: history1h,
                    indicators
                };
            } catch (err) {
                console.error(`${stock.symbol} verisi işlenirken hata (detay):`, err.stack);
                globalFetchError = `[Hata: ${stock.symbol}] ${err.stack || err.message}`;
                return stock;
            }
        });

        const updatedData = await Promise.all(fetchPromises);

        if (updatedData && updatedData.some(d => d.price > 0)) {
            marketData = updatedData;
            globalFetchError = null;
        } else {
            if (!globalFetchError) globalFetchError = "FETCH_MARKET_CRASH: Bütün hisse çekimleri başarısız oldu veya dizi boş!";
            console.error(globalFetchError);
        }

        // Kullanıcı işlemleri ve botları yönet
        if (mongoose.connection.readyState === 1) {
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

                            // Zaman dilimine göre sinyal seç
                            const timeframe = config.timeframe || '1h';
                            let rec = 'TUT';
                            if (timeframe === '4h') {
                                rec = stock.indicators?.qqe_4h || 'TUT';
                            } else if (timeframe === '1d') {
                                rec = stock.indicators?.qqe_1d || 'TUT';
                            } else {
                                rec = stock.indicators?.qqe_1h || 'TUT';
                            }

                            // Sinyal değişimi algılama
                            if (rec === 'AL' || rec === 'SAT') {
                                if (config.lastSignal !== rec) {
                                    config.lastSignal = rec;
                                    config.signalStartTime = Date.now();
                                    config.lastAction = 'NONE';
                                    userChanged = true;
                                    console.log(`[BOT SIGNAL CHANGED] User: ${user.username} | Symbol: ${symbol} | TF: ${timeframe} | New Signal: ${rec} | Timer Reset`);

                                    // Sinyal geçmişine kaydet
                                    try {
                                        await SignalHistory.create({ symbol, signal: rec, timeframe, price: stock.price });
                                    } catch (shErr) {
                                        console.error('[SignalHistory] Kayıt hatası:', shErr.message);
                                    }

                                    // Eğer sinyal SAT ise ANINDA satış yap
                                    if (rec === 'SAT') {
                                        const stockInPortfolio = user.portfolio.find(p => p.symbol === stock.symbol);
                                        if (stockInPortfolio && stockInPortfolio.amount > 0) {
                                            const sellAmount = stockInPortfolio.amount;
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
                                                reason: 'QQE(' + timeframe + ') Sinyali (Anında)'
                                            }, ...user.history];

                                            config.lastAction = 'SELL';
                                            userChanged = true;
                                        }
                                    }
                                }
                            } else {
                                // TUT sinyali geldiğinde lastSignal'i sıfırla ki bir sonraki AL yeni sayaç başlatsın
                                if (config.lastSignal === 'AL' && config.lastAction === 'BUY') {
                                    config.lastSignal = 'TUT';
                                    userChanged = true;
                                } else if (config.lastSignal === 'SAT' && config.lastAction === 'SELL') {
                                    config.lastSignal = 'TUT';
                                    userChanged = true;
                                }
                            }

                            // 1 Saatlik AL Sinyali Bekleme ve İşleme
                            if (config.lastSignal === 'AL' && config.lastAction !== 'BUY') {
                                if (!config.signalStartTime) {
                                    config.signalStartTime = Date.now();
                                    userChanged = true;
                                    console.log(`[BOT] signalStartTime eksikti, şimdi başlatıldı: ${user.username} | ${symbol}`);
                                }
                                const waitTimeMs = 60 * 60 * 1000; // 1 saat
                                const elapsed = Date.now() - config.signalStartTime;
                                console.log(`[BOT TIMER] ${user.username} | ${symbol} | TF: ${timeframe} | Gecen: ${Math.round(elapsed / 60000)}dk / 60dk`);

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
                                            reason: 'QQE(' + timeframe + ') Sinyali (1 Saat Gecikmeli)'
                                        }, ...user.history];

                                        config.lastAction = 'BUY';
                                        userChanged = true;
                                    } else {
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
                                        config.lastAction = 'BUY';
                                        userChanged = true;
                                    }
                                }
                            }

                            // Stop-Loss ve Take-Profit Kontrolleri
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
                        user.markModified('botConfigs');
                        user.markModified('portfolio');
                        user.markModified('history');
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

// Piyasa verilerini 20 saniyede bir güncelle
setInterval(fetchRealMarketData, 20000);

// API Endpoints
app.get('/api/market', (req, res) => res.json({
    version: '5.3',
    timestamp: Date.now(),
    data: marketData,
    error: globalFetchError
}));

// Sinyal Geçmişi API
app.get('/api/signals/history', async (req, res) => {
    try {
        const { symbol, timeframe, limit = 100 } = req.query;
        const query = {};
        if (symbol) query.symbol = symbol;
        if (timeframe) query.timeframe = timeframe;
        const records = await SignalHistory.find(query)
            .sort({ date: -1 })
            .limit(parseInt(limit))
            .lean();
        res.json({ success: true, data: records, total: records.length });
    } catch (err) {
        console.error('[API] /api/signals/history hatası:', err.message);
        res.status(500).json({ success: false, error: 'Sinyal geçmişi alınamadı.' });
    }
});






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

// ==================== KAP HABER API'LERİ ====================

/**
 * GET /api/kap-news
 * Tüm izlenen hisseler için son haberleri döner.
 * Query params: ?symbol=THYAO&limit=20
 */
app.get('/api/kap-news', async (req, res) => {
    try {
        const { symbol, limit = 30 } = req.query;
        const query = {};

        if (symbol) {
            // Birden fazla sembol virgülle gelebilir: ?symbol=THYAO,GARAN
            const symbols = symbol.split(',').map(s => s.trim().replace('.IS', '').toUpperCase());
            query.symbol = { $in: symbols };
        }

        const news = await KapNews.find(query)
            .sort({ publishedAt: -1 })
            .limit(parseInt(limit))
            .lean();

        res.json({ success: true, data: news, total: news.length });
    } catch (err) {
        console.error('[API] /api/kap-news hatası:', err.message);
        res.status(500).json({ success: false, error: 'Haberler alınamadı.' });
    }
});

/**
 * GET /api/kap-news/:symbol
 * Belirli bir hisse için son haberleri döner.
 */
app.get('/api/kap-news/:symbol', async (req, res) => {
    try {
        const symbol = req.params.symbol.replace('.IS', '').toUpperCase();
        const limit = parseInt(req.query.limit) || 20;

        const news = await KapNews.find({ symbol })
            .sort({ publishedAt: -1 })
            .limit(limit)
            .lean();

        res.json({ success: true, data: news, symbol });
    } catch (err) {
        console.error(`[API] /api/kap-news/${req.params.symbol} hatası:`, err.message);
        res.status(500).json({ success: false, error: 'Haberler alınamadı.' });
    }
});
/**
 * POST /api/kap-news/:id/analyze
 * Belirli bir haber için anında AI yorumu üretir.
 */
app.post('/api/kap-news/:id/analyze', async (req, res) => {
    try {
        const { id } = req.params;
        const newsItem = await KapNews.findById(id);
        
        if (!newsItem) {
            return res.status(404).json({ success: false, error: 'Haber bulunamadı.' });
        }

        if (newsItem.aiComment) {
            return res.json({ success: true, aiComment: newsItem.aiComment });
        }

        const { generateCommentForNews } = require('./services/geminiService');
        const comment = await generateCommentForNews(newsItem);
        
        if (comment) {
            newsItem.aiComment = comment;
            newsItem.aiCommentAt = new Date();
            await newsItem.save();
            res.json({ success: true, aiComment: comment });
        } else {
            res.status(500).json({ success: false, error: 'Yorum üretilemedi (API hatası veya kota sorunu).' });
        }
    } catch (err) {
        console.error(`[API] /api/kap-news/analyze hatası:`, err.message);
        res.status(500).json({ success: false, error: 'Yorum üretirken bir hata oluştu.' });
    }
});

// ==================== FRONTEND STATIC ====================

// Serve frontend static files
app.use(express.static(path.join(__dirname, '../dist')));

// Catch-all route to serve the frontend's index.html for unknown paths (SPA routing)
app.use((req, res, next) => {
    // Exclude /api routes from this catch-all just in case
    if (req.path.startsWith('/api/')) {
        return res.status(404).json({ error: 'API endpoint not found' });
    }
    res.sendFile(path.join(__dirname, '../dist', 'index.html'));
});

app.listen(PORT, '0.0.0.0', async () => {
    console.log(`Sunucu ${PORT} portunda çalışıyor`);
    try {
        await connectDB();
        // KAP bildirim takip servisini başlat
        startKapPollingService();
    } catch (e) {
        console.error('Veritabanı başlatma hatası:', e.message);
    }
});
