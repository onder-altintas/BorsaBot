require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const User = require('./models/User');

const app = express();
const PORT = process.env.PORT || 5000;

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('✅ MongoDB Atlas Bağlantısı Başarılı'))
    .catch(err => console.error('❌ MongoDB Bağlantı Hatası:', err));

app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'x-user']
}));
app.use(express.json());

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

// Migration Helper (Optional: Run once if needed)
async function migrateFromJson() {
    if (mongoose.connection.readyState !== 1) return;
    const DB_PATH = path.join(__dirname, 'db.json');
    if (fs.existsSync(DB_PATH)) {
        console.log('📦 db.json bulundu, veri göçü başlıyor...');
        try {
            const data = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
            const usersList = data.users || {};
            for (const username in usersList) {
                const existing = await User.findOne({ username });
                if (!existing) {
                    await User.create({ username, ...usersList[username] });
                    console.log(`✅ ${username} göç ettirildi.`);
                }
            }
        } catch (e) {
            console.error('❌ Göç hatası:', e);
        }
    }
}
// Run migration when connection is ready
mongoose.connection.once('connected', migrateFromJson);

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

    // Signal line is EMA 9 of MACD line. For simplicity in simulation, we use a small buffer of MACD lines
    // In a real system, we'd store macd history. Here we estimate based on recent trend.
    const macdSignal = macdLine * 0.9; // Dynamic placeholder for signal
    const macdHist = macdLine - macdSignal;

    // Bollinger Bands (20, 2)
    const bbPeriod = Math.min(prices.length, 20);
    const bbMiddle = prices.slice(-bbPeriod).reduce((a, b) => a + b, 0) / bbPeriod;
    const variance = prices.slice(-bbPeriod).reduce((a, b) => a + Math.pow(b - bbMiddle, 2), 0) / bbPeriod;
    const stdDev = Math.sqrt(variance);
    const bbUpper = bbMiddle + (stdDev * 2);
    const bbLower = bbMiddle - (stdDev * 2);

    let recommendation = 'TUT';

    // Combined Logic
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

// Simulation Engine: Runs every 3 seconds
setInterval(async () => {
    try {
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

        // 2. Execute DB Operations ONLY if connected
        if (mongoose.connection.readyState !== 1) return;

        const allUsers = await User.find({});
        for (let user of allUsers) {
            let dbChanged = false;

            // Execute Bots
            const botConfigs = user.botConfigs;
            if (botConfigs) {
                // Handle both Map (Mongoose) and plain Object
                const entries = botConfigs instanceof Map ? botConfigs.entries() : Object.entries(botConfigs);

                for (let [symbol, config] of entries) {
                    if (config && config.active) {
                        const stock = marketData.find(s => s.symbol === symbol);
                        if (!stock) continue;

                        const rec = stock.indicators?.recommendation;
                        if (rec === 'GÜÇLÜ AL') {
                            const cost = stock.price * (config.amount || 1);
                            if (user.balance >= cost) {
                                user.balance -= cost;
                                const existing = user.portfolio.find(p => p.symbol === stock.symbol);
                                if (existing) {
                                    const totalOwned = existing.amount + (config.amount || 1);
                                    existing.averageCost = (existing.averageCost * existing.amount + cost) / totalOwned;
                                    existing.amount = totalOwned;
                                } else {
                                    user.portfolio.push({ symbol: stock.symbol, amount: (config.amount || 1), averageCost: stock.price });
                                }
                                user.history.unshift({
                                    id: Date.now() + Math.random(),
                                    type: 'ALIM',
                                    symbol: stock.symbol,
                                    amount: config.amount || 1,
                                    price: stock.price,
                                    total: cost,
                                    date: new Date().toLocaleString('tr-TR'),
                                    isAuto: true
                                });
                                dbChanged = true;
                            }
                        } else {
                            // Check for GÜÇLÜ SAT OR Stop-Loss / Take-Profit
                            const stockInPortfolio = user.portfolio.find(p => p.symbol === stock.symbol);
                            if (stockInPortfolio) {
                                const profitPercent = ((stock.price - stockInPortfolio.averageCost) / stockInPortfolio.averageCost) * 100;
                                const shouldSellSL = config.stopLoss && profitPercent <= -Math.abs(config.stopLoss);
                                const shouldSellTP = config.takeProfit && profitPercent >= Math.abs(config.takeProfit);
                                const shouldSellSignal = rec === 'GÜÇLÜ SAT';

                                if (shouldSellSignal || shouldSellSL || shouldSellTP) {
                                    const sellAmount = Math.min(stockInPortfolio.amount, (config.amount || 1));
                                    const revenue = stock.price * sellAmount;
                                    user.balance += revenue;
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
                                        total: revenue,
                                        date: new Date().toLocaleString('tr-TR'),
                                        isAuto: true,
                                        reason: reason
                                    });
                                    dbChanged = true;
                                }
                            }
                        }
                    }
                }

                // 3. Update Wealth History
                const currentPortfolioValue = user.portfolio.reduce((acc, item) => {
                    const mStock = marketData.find(s => s.symbol === item.symbol);
                    return acc + (mStock ? mStock.price * item.amount : 0);
                }, 0);
                const totalWealth = user.balance + currentPortfolioValue;
                user.wealthHistory = [...user.wealthHistory, { time: new Date().toLocaleTimeString(), wealth: totalWealth }].slice(-50);

                // Auto-Save
                await user.save();
            }
        }
    } catch (error) {
        console.error('Simülasyon Hatası:', error);
    }
}, 3000);

// API Endpoints
app.get('/api/market', (req, res) => res.json(marketData));

app.get('/api/user/data', async (req, res) => {
    const username = req.headers['x-user']?.toLowerCase();
    if (!username) return res.status(401).json({ error: 'Auth required' });

    try {
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
            if (trade.total > (trade.amount * (trade.price * 0.95))) {
                totalWin++;
            }
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
        res.json(user);
    } catch (err) {
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
        const user = await User.findOne({ username });
        if (!user) return res.status(404).json({ success: false, message: 'Kullanıcı bulunamadı.' });

        const cost = stock.price * amount;
        if (cost > user.balance) return res.status(400).json({ success: false, message: 'Yetersiz bakiye.' });

        user.balance -= cost;
        const existing = user.portfolio.find(p => p.symbol === symbol);
        if (existing) {
            const totalOwned = existing.amount + amount;
            existing.averageCost = (existing.averageCost * existing.amount + cost) / totalOwned;
            existing.amount = totalOwned;
        } else {
            user.portfolio.push({ symbol, amount, averageCost: stock.price });
        }

        user.history.unshift({
            id: Date.now(),
            type: 'ALIM',
            symbol,
            amount,
            price: stock.price,
            total: cost,
            date: new Date().toLocaleString('tr-TR'),
            isAuto: false
        });

        await user.save();
        res.json({ success: true, data: user });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

app.post('/api/trade/sell', async (req, res) => {
    const username = req.headers['x-user']?.toLowerCase();
    if (!username) return res.status(401).json({ error: 'Auth required' });

    const { symbol, amount } = req.body;
    try {
        const user = await User.findOne({ username });
        if (!user) return res.status(404).json({ success: false, message: 'Kullanıcı bulunamadı.' });

        const stockInPortfolio = user.portfolio.find(p => p.symbol === symbol);
        if (!stockInPortfolio || stockInPortfolio.amount < amount) {
            return res.status(400).json({ success: false, message: 'Yetersiz hisse adedi.' });
        }

        const stock = marketData.find(s => s.symbol === symbol);
        const revenue = (stock ? stock.price : 0) * amount;

        user.balance += revenue;
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
            total: revenue,
            date: new Date().toLocaleString('tr-TR'),
            isAuto: false
        });

        await user.save();
        res.json({ success: true, data: user });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

app.post('/api/bot/config', async (req, res) => {
    const username = req.headers['x-user']?.toLowerCase();
    if (!username) return res.status(401).json({ error: 'Auth required' });

    const { symbol, config } = req.body;
    try {
        const user = await User.findOne({ username });
        if (!user) return res.status(404).json({ success: false, message: 'Kullanıcı bulunamadı.' });

        console.log(`🤖 Bot ayarı güncelleniyor: ${symbol}`, config);

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
