require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const mongoose = require('mongoose');
const User = require('./models/User');

const app = express();
const PORT = process.env.PORT || 5000;

// Database State
let isAtlasOnline = false;

// MongoDB Connection with improved error handling
const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI, {
            serverSelectionTimeoutMS: 5000 // 5 saniye içinde bağlanamazsa hata ver
        });
        isAtlasOnline = true;
        console.log('✅ MongoDB Atlas Bağlantısı Başarılı');
    } catch (err) {
        isAtlasOnline = false;
        console.error('❌ MongoDB Atlas Bağlantısı Başarısız. Uygulama çalışmak için MongoDB bağlantısına ihtiyaç duyuyor.', err.message);
        process.exit(1); // Bağlantı olmazsa uygulamayı kapat (Opsiyonel: Eğer çalışmaya devam etsin derseniz log bırakıp bekletebiliriz)
    }
};
connectDB();

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
        if (allowedOrigins.indexOf(origin) === -1) {
            const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
            return callback(new Error(msg), false);
        }
        return callback(null, true);
    },
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'x-user'],
    credentials: true
}));
app.use(express.json());

// Request Logger Middleware
app.use((req, res, next) => {
    console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.url} - User: ${req.headers['x-user'] || 'Guest'}`);
    next();
});

const COMMISSION_RATE = 0.0005; // 5/10000 commission rate

// Helper for initial user
const getInitialUserData = (username) => ({
    username,
    balance: 100000.00,
    portfolio: [],
    history: [],
    wealthHistory: [{ time: new Date().toLocaleTimeString(), wealth: 100000 }],
    botConfigs: {},
    stats: { winRate: 0, bestStock: '-', totalTrades: 0, profitableTrades: 0 }
});

// BIST 100 Major Stocks
const BIST_STOCK_SYMBOLS = [
    { symbol: 'THYAO', name: 'Türk Hava Yolları', basePrice: 285.50 },
    { symbol: 'ASELS', name: 'Aselsan', basePrice: 62.20 },
    { symbol: 'EREGL', name: 'Erdemir', basePrice: 48.15 },
    { symbol: 'KCHOL', name: 'Koç Holding', basePrice: 175.80 },
    { symbol: 'SASAn', name: 'Sasa Polyester', basePrice: 38.40 },
    { symbol: 'TUPRS', name: 'Tüpraş', basePrice: 162.90 },
    { symbol: 'SISE', name: 'Şişecam', basePrice: 46.30 },
    { symbol: 'GARAN', name: 'Garanti BBVA', basePrice: 72.40 },
    { symbol: 'AKBNK', name: 'Akbank', basePrice: 44.10 },
    { symbol: 'BIMAS', name: 'BİM Mağazalar', basePrice: 388.00 },
];

let marketData = BIST_STOCK_SYMBOLS.map(stock => ({
    ...stock,
    price: stock.basePrice,
    change: 0,
    changePercent: 0,
    priceHistory: [{ time: new Date().toLocaleTimeString(), price: stock.basePrice }],
    indicators: {
        sma5: stock.basePrice,
        sma10: stock.basePrice,
        rsi: 50,
        recommendation: 'TUT',
        macd: { line: 0, signal: 0, hist: 0 },
        bollinger: { upper: stock.basePrice, middle: stock.basePrice, lower: stock.basePrice }
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

const calculateIndicators = (history, currentPrice) => {
    if (history.length < 2) return { sma5: 0, sma10: 0, rsi: 50, recommendation: 'TUT', macd: { line: 0, signal: 0, hist: 0 }, bollinger: { upper: 0, middle: 0, lower: 0 } };
    const prices = history.map(h => h.price);

    // SMA
    const sma5 = prices.slice(-5).reduce((a, b) => a + b, 0) / Math.min(prices.length, 5);
    const sma10 = prices.slice(-10).reduce((a, b) => a + b, 0) / Math.min(prices.length, 10);

    // RSI
    let gains = 0;
    let losses = 0;
    for (let i = Math.max(1, prices.length - 14); i < prices.length; i++) {
        const diff = prices[i] - prices[i - 1];
        if (diff >= 0) gains += diff;
        else losses -= diff;
    }
    const rsi = losses === 0 ? 100 : 100 - (100 / (1 + (gains / losses)));

    // MACD (12, 26, 9)
    const ema12 = calculateEMA(prices, 12);
    const ema26 = calculateEMA(prices, 26);
    const macdLine = ema12 - ema26;
    const macdSignal = macdLine * 0.9;
    const macdHist = macdLine - macdSignal;

    // Bollinger Bands (20, 2)
    const bbPeriod = Math.min(prices.length, 20);
    const bbMiddle = prices.slice(-bbPeriod).reduce((a, b) => a + b, 0) / bbPeriod;
    const variance = prices.slice(-bbPeriod).reduce((a, b) => a + Math.pow(b - bbMiddle, 2), 0) / bbPeriod;
    const stdDev = Math.sqrt(variance);
    const bbUpper = bbMiddle + (stdDev * 2);
    const bbLower = bbMiddle - (stdDev * 2);

    let recommendation = 'TUT';
    const isBullish = macdLine > macdSignal && currentPrice > sma5 && rsi < 70;
    const isBearish = macdLine < macdSignal && currentPrice < sma5 && rsi > 30;

    if (rsi < 30 && currentPrice <= bbLower) recommendation = 'GÜÇLÜ AL';
    else if (isBullish || rsi < 40) recommendation = 'AL';
    else if (rsi > 70 && currentPrice >= bbUpper) recommendation = 'GÜÇLÜ SAT';
    else if (isBearish || rsi > 60) recommendation = 'SAT';

    return {
        sma5: parseFloat(sma5.toFixed(2)),
        sma10: parseFloat(sma10.toFixed(2)),
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
        recommendation
    };
};

const executeSimulation = async () => {
    try {
        if (!isAtlasOnline || mongoose.connection.readyState !== 1) return;

        // 1. Update Market Data
        marketData = marketData.map(stock => {
            const volatility = 0.002;
            const change = (Math.random() - 0.5) * 2 * volatility * stock.price;
            const newPrice = parseFloat((stock.price + change).toFixed(2));
            const totalChange = newPrice - stock.basePrice;
            const totalChangePercent = (totalChange / stock.basePrice) * 100;

            const newHistory = [...stock.priceHistory, { time: new Date().toLocaleTimeString(), price: newPrice }].slice(-100);
            const indicators = calculateIndicators(newHistory, newPrice);

            return {
                ...stock,
                price: newPrice,
                change: parseFloat(totalChange.toFixed(2)),
                changePercent: parseFloat(totalChangePercent.toFixed(2)),
                priceHistory: newHistory,
                indicators
            };
        });

        // 2. Identify Users to Process
        const usersToProcess = await User.find({});

        for (let user of usersToProcess) {
            let userChanged = false;

            // Execute Bots
            const botConfigs = user.botConfigs;
            if (botConfigs) {
                const entries = (botConfigs instanceof Map) ? botConfigs.entries() : Object.entries(botConfigs);

                for (let [symbol, config] of entries) {
                    if (config && config.active) {
                        const stock = marketData.find(s => s.symbol === symbol);
                        if (!stock) continue;

                        const rec = stock.indicators?.recommendation;
                        if (rec === 'GÜÇLÜ AL') {
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
                        } else {
                            const stockInPortfolio = user.portfolio.find(p => p.symbol === stock.symbol);
                            if (stockInPortfolio) {
                                const profitPercent = ((stock.price - stockInPortfolio.averageCost) / stockInPortfolio.averageCost) * 100;
                                const shouldSellSL = config.stopLoss && profitPercent <= -Math.abs(config.stopLoss);
                                const shouldSellTP = config.takeProfit && profitPercent >= Math.abs(config.takeProfit);
                                const shouldSellSignal = rec === 'GÜÇLÜ SAT';

                                if (shouldSellSignal || shouldSellSL || shouldSellTP) {
                                    const sellAmount = Math.min(stockInPortfolio.amount, (config.amount || 1));
                                    const stockRevenue = stock.price * sellAmount;
                                    const commission = stockRevenue * COMMISSION_RATE;
                                    const netRevenue = stockRevenue - commission;

                                    user.balance += netRevenue;
                                    stockInPortfolio.amount -= sellAmount;

                                    let reason = 'Sinyal';
                                    if (shouldSellSL) reason = 'Stop-Loss';
                                    else if (shouldSellTP) reason = 'Take-Profit';

                                    if (stockInPortfolio.amount === 0) {
                                        user.portfolio = user.portfolio.filter(p => p.symbol !== stock.symbol);
                                    }
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
                                        reason: reason
                                    });
                                    userChanged = true;
                                }
                            }
                        }
                    }
                }
            }

            // Update Wealth History
            const currentPortfolioValue = user.portfolio.reduce((acc, item) => {
                const mStock = marketData.find(s => s.symbol === item.symbol);
                return acc + (mStock ? mStock.price * item.amount : 0);
            }, 0);
            const totalWealth = user.balance + currentPortfolioValue;
            user.wealthHistory = [...(user.wealthHistory || []), { time: new Date().toLocaleTimeString(), wealth: totalWealth }].slice(-50);

            // Update Wealth Snapshots (günlük / haftalık / aylık dönem başı)
            const now = new Date();
            const todayStr = now.toLocaleDateString('tr-TR');
            const monthStr = `${now.getFullYear()}-${now.getMonth() + 1}`;
            // Haftanın başı: Pazartesi
            const weekStart = new Date(now);
            weekStart.setDate(now.getDate() - ((now.getDay() + 6) % 7));
            const weekStr = weekStart.toLocaleDateString('tr-TR');

            if (!user.wealthSnapshots) user.wealthSnapshots = {};

            if (!user.wealthSnapshots.dayStart || user.wealthSnapshots.dayStart.date !== todayStr) {
                user.wealthSnapshots.dayStart = { date: todayStr, wealth: totalWealth };
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

            userChanged = true;

            // Save Progress
            if (userChanged && typeof user.save === 'function') {
                await user.save();
            }

        }
    } catch (error) {
        console.error('Simülasyon Hatası:', error);
    }
};

setInterval(executeSimulation, 3000);

// API Endpoints
app.get('/api/market', (req, res) => res.json(marketData));

app.get('/api/user/data', async (req, res) => {
    const username = req.headers['x-user']?.toLowerCase();
    if (!username) return res.status(401).json({ error: 'Auth required' });

    try {
        if (!isAtlasOnline) return res.status(503).json({ error: 'Veritabanı bağlantısı yok' });

        let user = await User.findOne({ username });
        if (!user) {
            user = await User.create(getInitialUserData(username));
        }

        // Calculate Extended Stats
        const history = user.history || [];
        const sellTrades = history.filter(t => t.type === 'SATIM');

        let totalWin = 0;
        const stockStats = {};

        sellTrades.forEach(trade => {
            // Kar hesabı: Satış tutarı - (Hisse Adedi * Alış Maliyeti)
            // (Not: Alış maliyetine zaten komisyon dahil edilmiştir)
            // Burada basitçe karlı işlem sayısını buluyoruz
            // trade.total net gelirdir (komisyon düşülmüş satış tutarı)
            const profit = trade.total - (trade.amount * (trade.price / (1 + COMMISSION_RATE))); // Bu yaklaşık bir maliyet
            // Daha doğru bakiye bazlı kar hesabı gerekirse modellerde maliyet saklanmalı
            if (trade.total > (trade.amount * trade.price * (1 - COMMISSION_RATE))) { /* Kar */ }

            // Mevcut mantığa göre winRate tahmini:
            if (trade.total > 0) totalWin++; // Sadeleştirilmiş
            if (!stockStats[trade.symbol]) stockStats[trade.symbol] = 0;
            stockStats[trade.symbol] += trade.total;
        });

        const winRate = sellTrades.length > 0 ? ((totalWin / sellTrades.length) * 100).toFixed(1) : 0;
        const bestStock = Object.keys(stockStats).sort((a, b) => stockStats[b] - stockStats[a])[0] || '-';

        user.stats = {
            winRate,
            bestStock,
            totalTrades: history.length,
            profitableTrades: totalWin
        };

        await user.save();
        return res.json(user);
    } catch (err) {
        console.error('User Data API Error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

app.post('/api/trade/buy', async (req, res) => {
    const username = req.headers['x-user']?.toLowerCase();
    if (!username) return res.status(401).json({ error: 'Auth required' });

    const { symbol, amount } = req.body;
    const stock = marketData.find(s => s.symbol === symbol);
    if (!stock) return res.status(404).json({ success: false, message: 'Hisse bulunamadı.' });

    try {
        if (!isAtlasOnline) return res.status(503).json({ error: 'Veritabanı bağlantısı yok' });
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
        console.error('Buy Trade Error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

app.post('/api/trade/sell', async (req, res) => {
    const username = req.headers['x-user']?.toLowerCase();
    if (!username) return res.status(401).json({ error: 'Auth required' });

    const { symbol, amount } = req.body;
    try {
        if (!isAtlasOnline) return res.status(503).json({ error: 'Veritabanı bağlantısı yok' });
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
        console.error('Sell Trade Error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

app.post('/api/user/reset', async (req, res) => {
    const username = req.headers['x-user']?.toLowerCase();
    if (!username) return res.status(401).json({ error: 'Auth required' });

    try {
        if (!isAtlasOnline) return res.status(503).json({ error: 'Veritabanı bağlantısı yok' });
        const initialData = getInitialUserData(username);
        let user = await User.findOne({ username });
        if (user) {
            user.balance = initialData.balance;
            user.portfolio = initialData.portfolio;
            user.history = initialData.history;
            user.wealthHistory = initialData.wealthHistory;
            user.stats = initialData.stats;
            await user.save();
        }
        res.json({ success: true, data: user });
    } catch (err) {
        console.error('Reset Error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

app.post('/api/bot/config', async (req, res) => {
    const username = req.headers['x-user']?.toLowerCase();
    if (!username) return res.status(401).json({ error: 'Auth required' });

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
        console.error('Bot Config Error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
