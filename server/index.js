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
const MARKETS_CACHE_TTL = 900000; // 15 dakika
let globalFetchError = null;

// MongoDB Connection with improved error handling for Serverless
mongoose.set('bufferCommands', false); // Mongoose'un veritabanına bağlanmadan işlemleri askıya almasını (buffering) devre dışı bırak.

const connectDB = async () => {
    if (mongoose.connection.readyState >= 1) return mongoose.connection;

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
    console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.url} - Kullanıcı: ${req.headers['x-user'] || 'Misafir'}`);

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
    wealthHistory: [{ time: new Date().toLocaleTimeString(), wealth: 100000 }],
    wealthSnapshots: {
        dayStart: { date: new Date().toLocaleDateString('tr-TR'), wealth: 100000 },
        weekStart: { date: new Date().toLocaleDateString('tr-TR'), wealth: 100000 },
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
    const volSMA25 = volumes.slice(-25).reduce((a, b) => a + b, 0) / Math.min(volumes.length, 25);
    const currentVol = volumes[volumes.length - 1] || 0;
    const isVolBullish = currentVol > volSMA25;

    // --- 4'LÜ KONSENSÜS SİNYAL MANTİĞI (SAATLİK VERİ BAZLI) ---
    // Bu mantık Fisher, EMA7, RSI ve Bollinger Bantlarının ortak kararına bakar.

    let buyScore = 0;
    let sellScore = 0;

    // 1. Fisher Transform (Hızlı Kesişim ve Trend)
    if (fish1 > fish2) buyScore++;
    else if (fish1 < fish2) sellScore++;

    // 2. EMA 7 (Trend Altı/Üstü)
    if (currentPrice > ema7) buyScore++;
    else if (currentPrice < ema7) sellScore++;

    // 3. RSI 14 (Aşırı Alım/Satım ve Orta Hat)
    if (rsi > 50) buyScore++;
    else if (rsi < 50) sellScore++;
    // Ekstra ağırlık: Aşırı bölgeler
    if (rsi < 35) buyScore++;
    if (rsi > 65) sellScore++;

    // 4. Bollinger Bantları (Konum)
    if (currentPrice < bbMiddle) buyScore++; // Orta bandın altında (Alım fırsatı)
    if (currentPrice > bbMiddle) sellScore++; // Orta bandın üstünde (Satış fırsatı)
    // Ekstra ağırlık: Bant dışına taşmalar
    if (currentPrice <= bbLower) buyScore++;
    if (currentPrice >= bbUpper) sellScore++;

    let recommendation = 'TUT';

    // Konsensüs Kararı: Skor 3 ve üzeri ise sinyal üret
    if (buyScore >= 3 && buyScore > sellScore) {
        recommendation = 'AL';
    } else if (sellScore >= 3 && sellScore > buyScore) {
        recommendation = 'SAT';
    }

    // GÜVENLİK FİLTRESİ: GÜÇLÜ ifadeleri tamamen kaldırıldı

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
        recommendation
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

                const hourlyData = await yahooFinance.historical(stock.symbol, {
                    period1: startDate,
                    interval: '1h'
                });

                let history = hourlyData.map(h => ({
                    time: h.date.toLocaleTimeString(),
                    price: h.close,
                    volume: h.volume,
                    high: h.high,
                    low: h.low
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
                return stock; // Eski 0'lı stock kopyası dönersek API sıfır olarak güncellenir. Ancak mecburen dönüyoruz.
            }
        });

        const updatedData = await Promise.all(fetchPromises);

        // Sadece başarılı fetch'leri (fiyatı > 0 olanları) tespit edersek global marketData'yı ezelim.
        if (updatedData && updatedData.some(d => d.price > 0)) {
            marketData = updatedData;
        } else {
            console.error("fetchRealMarketData hata: Bütün hisse çekimleri başarısız oldu veya dizi boş!");
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

                            const rec = stock.indicators?.recommendation;

                            // AL Sinyali İşleme
                            if (rec === 'AL') {
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
                                        user.portfolio.push({ symbol: stock.symbol, amount: (config.amount || 1), averageCost: (totalCost / (config.amount || 1)) });
                                    }
                                    user.history.unshift({
                                        id: Date.now() + Math.random(),
                                        type: 'ALIM',
                                        symbol: stock.symbol,
                                        amount: config.amount || 1,
                                        price: stock.price,
                                        commission: commission,
                                        total: totalCost,
                                        date: new Date().toLocaleString('tr-TR'),
                                        isAuto: true
                                    });
                                    userChanged = true;
                                }
                            }
                            // SAT Sinyali İşleme
                            else if (rec === 'SAT') {
                                const stockInPortfolio = user.portfolio.find(p => p.symbol === stock.symbol);
                                if (stockInPortfolio && stockInPortfolio.amount > 0) {
                                    const sellAmount = stockInPortfolio.amount; // TÜMÜNÜ SAT
                                    const stockRevenue = stock.price * sellAmount;
                                    const commission = stockRevenue * COMMISSION_RATE;
                                    const netRevenue = stockRevenue - commission;

                                    user.balance += netRevenue;
                                    user.portfolio = user.portfolio.filter(p => p.symbol !== stock.symbol);
                                    user.markModified('portfolio');

                                    user.history.unshift({
                                        id: Date.now() + Math.random(),
                                        type: 'SATIM',
                                        symbol: stock.symbol,
                                        amount: sellAmount,
                                        price: stock.price,
                                        commission: commission,
                                        total: netRevenue,
                                        date: new Date().toLocaleString('tr-TR'),
                                        isAuto: true,
                                        reason: '4\'lü İndikatör Sinyali'
                                    });
                                    userChanged = true;
                                }
                            }
                            // Stop-Loss ve Take-Profit Kontrolleri (İkincil tetikleyiciler)
                            else {
                                const stockInPortfolio = user.portfolio.find(p => p.symbol === stock.symbol);
                                if (stockInPortfolio) {
                                    const profitPercent = ((stock.price - stockInPortfolio.averageCost) / stockInPortfolio.averageCost) * 100;
                                    const isSL = config.stopLoss && profitPercent <= -Math.abs(config.stopLoss);
                                    const isTP = config.takeProfit && profitPercent >= Math.abs(config.takeProfit);

                                    if (isSL || isTP) {
                                        const sellAmount = stockInPortfolio.amount;
                                        const stockRevenue = stock.price * sellAmount;
                                        const commission = stockRevenue * COMMISSION_RATE;
                                        const netRevenue = stockRevenue - commission;

                                        user.balance += netRevenue;
                                        user.portfolio = user.portfolio.filter(p => p.symbol !== stock.symbol);
                                        user.markModified('portfolio');

                                        user.history.unshift({
                                            id: Date.now() + Math.random(),
                                            type: 'SATIM',
                                            symbol: stock.symbol,
                                            amount: sellAmount,
                                            price: stock.price,
                                            commission: commission,
                                            total: netRevenue,
                                            date: new Date().toLocaleString('tr-TR'),
                                            isAuto: true,
                                            reason: isSL ? 'Stop-Loss' : 'Take-Profit'
                                        });
                                        userChanged = true;
                                    }
                                }
                            }
                        }
                    }
                }

                // Varlık Geçmişini Güncelle
                const currentPortfolioValue = user.portfolio.reduce((acc, item) => {
                    const mStock = marketData.find(s => s.symbol === item.symbol);
                    return acc + (mStock ? mStock.price * item.amount : 0);
                }, 0);
                const totalWealth = user.balance + currentPortfolioValue;
                user.wealthHistory = [...(user.wealthHistory || []), { time: now.toLocaleTimeString(), wealth: totalWealth }].slice(-50);

                // Snapshotları Güncelle
                if (!user.wealthSnapshots) user.wealthSnapshots = {};
                const currentDate = now.toLocaleDateString('tr-TR');
                const weekStart = new Date(now);
                weekStart.setDate(now.getDate() - ((now.getDay() + 6) % 7));
                const weekStr = weekStart.toLocaleDateString('tr-TR');
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
                    await user.save();
                }
            }
        }
    } catch (error) {
        console.error('Piyasa Verisi Çekme Hatası:', error);
        globalFetchError = error.stack || error.message;
    }
};

// Vercel Serverless ortamında veriler her istekte değil 15 dakikada bir güncellenecek
if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
    setInterval(fetchRealMarketData, 900000); // Local'de de 15 dakikaya çektik dalgalanmayı önlemek için.
}

// Başlatırken bir kez veri çekmeyi dene
if (isAtlasOnline) {
    fetchRealMarketData();
}

// API Endpoints
app.get('/api/market', (req, res) => res.json({
    version: '5.0.15',
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
        const todayStr = now.toLocaleDateString('tr-TR');
        const monthStr = `${now.getFullYear()}-${now.getMonth() + 1}`;
        const yearStr = `${now.getFullYear()}`;
        const weekStart = new Date(now);
        weekStart.setDate(now.getDate() - ((now.getDay() + 6) % 7));
        const weekStr = weekStart.toLocaleDateString('tr-TR');

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
            user.portfolio.push({ symbol, amount, averageCost: (totalCost / amount) });
        }

        user.history.unshift({
            id: Date.now(),
            type: 'ALIM',
            symbol,
            amount,
            price: stock.price,
            commission: commission,
            total: totalCost,
            date: new Date().toLocaleString('tr-TR'),
            isAuto: false
        });

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

        user.history.unshift({
            id: Date.now(),
            type: 'SATIM',
            symbol,
            amount,
            price: stock ? stock.price : 0,
            commission: commission,
            total: netRevenue,
            date: new Date().toLocaleString('tr-TR'),
            isAuto: false
        });

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
        if (!isAtlasOnline) return res.status(503).json({ error: 'Veritabanı bağlantısı yok' });
        const user = await User.findOne({ username });
        if (!user) return res.status(404).json({ success: false, message: 'Kullanıcı bulunamadı.' });

        if (user.botConfigs && typeof user.botConfigs.set === 'function') {
            const existing = user.botConfigs.get(symbol) || {};
            user.botConfigs.set(symbol, { ...existing, ...config });
        } else {
            if (!user.botConfigs) user.botConfigs = {};
            user.botConfigs[symbol] = { ...(user.botConfigs[symbol] || {}), ...config };
        }

        user.markModified('botConfigs');
        await user.save();

        const responseData = user.botConfigs instanceof Map ?
            Object.fromEntries(user.botConfigs) : user.botConfigs;

        res.json({ success: true, data: responseData });
    } catch (err) {
        console.error('Bot Ayar Hatası:', err);
        res.status(500).json({ success: false, message: 'Sunucu hatası' });
    }
});

if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
    app.listen(PORT, () => console.log(`Sunucu ${PORT} portunda çalışıyor`));
}

module.exports = app;
