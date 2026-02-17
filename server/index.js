const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'x-user']
}));
app.use(express.json());

// Database setup (multi-user structure)
const DB_PATH = path.join(__dirname, 'db.json');

const createUserData = () => ({
    balance: 100000.00,
    portfolio: [],
    history: [],
    wealthHistory: [{ time: new Date().toLocaleTimeString(), wealth: 100000 }],
    botConfigs: {}
});

function readDb() {
    if (!fs.existsSync(DB_PATH)) {
        const initial = { users: {} };
        fs.writeFileSync(DB_PATH, JSON.stringify(initial, null, 2));
        return initial;
    }
    const data = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));

    // Migration: If old format exists, move to 'users.önder'
    if (!data.users) {
        const oldData = { ...data };
        const migrated = {
            users: {
                'önder': oldData
            }
        };
        // Clean up root level
        delete migrated.users['önder'].users;
        writeDb(migrated);
        return migrated;
    }
    return data;
}

function writeDb(data) {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

function getUser(db, username) {
    if (!username) return null;
    if (!db.users[username]) {
        db.users[username] = createUserData();
    }
    return db.users[username];
}

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
    indicators: { sma5: stock.basePrice, sma10: stock.basePrice, rsi: 50, recommendation: 'TUT' }
}));

const calculateIndicators = (history, currentPrice) => {
    if (history.length < 2) return { sma5: 0, sma10: 0, rsi: 50, recommendation: 'TUT' };
    const prices = history.map(h => h.price);
    const sma5 = prices.slice(-5).reduce((a, b) => a + b, 0) / Math.min(prices.length, 5);
    const sma10 = prices.slice(-10).reduce((a, b) => a + b, 0) / Math.min(prices.length, 10);
    let gains = 0;
    let losses = 0;
    for (let i = 1; i < prices.length; i++) {
        const diff = prices[i] - prices[i - 1];
        if (diff >= 0) gains += diff;
        else losses -= diff;
    }
    const rsi = losses === 0 ? 100 : 100 - (100 / (1 + (gains / losses)));
    let recommendation = 'TUT';
    if (rsi < 30 && currentPrice > sma5) recommendation = 'GÜÇLÜ AL';
    else if (rsi < 45 || currentPrice > sma10) recommendation = 'AL';
    else if (rsi > 70 && currentPrice < sma5) recommendation = 'GÜÇLÜ SAT';
    else if (rsi > 55 || currentPrice < sma10) recommendation = 'SAT';

    return {
        sma5: parseFloat(sma5.toFixed(2)),
        sma10: parseFloat(sma10.toFixed(2)),
        rsi: parseFloat(rsi.toFixed(2)),
        recommendation
    };
};

// Simulation Engine: Runs every 3 seconds
setInterval(() => {
    try {
        marketData = marketData.map(stock => {
            const volatility = 0.002;
            const change = (Math.random() - 0.5) * 2 * volatility * stock.price;
            const newPrice = parseFloat((stock.price + change).toFixed(2));
            const totalChange = newPrice - stock.basePrice;
            const totalChangePercent = (totalChange / stock.basePrice) * 100;

            const newHistory = [...stock.priceHistory, { time: new Date().toLocaleTimeString(), price: newPrice }].slice(-20);
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

        // Execute Bots for ALL Users
        const db = readDb();
        let dbChanged = false;

        Object.keys(db.users).forEach(username => {
            const userData = db.users[username];
            marketData.forEach(stock => {
                const config = userData.botConfigs[stock.symbol];
                if (config && config.active) {
                    const rec = stock.indicators?.recommendation;
                    if (rec === 'GÜÇLÜ AL') {
                        const cost = stock.price * (config.amount || 1);
                        if (userData.balance >= cost) {
                            userData.balance -= cost;
                            const existing = userData.portfolio.find(p => p.symbol === stock.symbol);
                            if (existing) {
                                const totalOwned = existing.amount + (config.amount || 1);
                                existing.averageCost = (existing.averageCost * existing.amount + cost) / totalOwned;
                                existing.amount = totalOwned;
                            } else {
                                userData.portfolio.push({ symbol: stock.symbol, amount: (config.amount || 1), averageCost: stock.price });
                            }
                            userData.history.unshift({
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
                    } else if (rec === 'GÜÇLÜ SAT') {
                        const stockInPortfolio = userData.portfolio.find(p => p.symbol === stock.symbol);
                        if (stockInPortfolio && stockInPortfolio.amount >= (config.amount || 1)) {
                            const revenue = stock.price * (config.amount || 1);
                            userData.balance += revenue;
                            stockInPortfolio.amount -= (config.amount || 1);
                            if (stockInPortfolio.amount === 0) {
                                userData.portfolio = userData.portfolio.filter(p => p.symbol !== stock.symbol);
                            }
                            userData.history.unshift({
                                id: Date.now() + Math.random(),
                                type: 'SATIM',
                                symbol: stock.symbol,
                                amount: config.amount || 1,
                                price: stock.price,
                                total: revenue,
                                date: new Date().toLocaleString('tr-TR'),
                                isAuto: true
                            });
                            dbChanged = true;
                        }
                    }
                }
            });
        });

        if (dbChanged) writeDb(db);
    } catch (error) {
        console.error('Simülasyon Hatası:', error);
    }
}, 3000);

// wealth history update every 10 seconds
setInterval(() => {
    try {
        const db = readDb();
        let dbChanged = false;
        Object.keys(db.users).forEach(username => {
            const userData = db.users[username];
            const currentPortfolioValue = userData.portfolio.reduce((acc, item) => {
                const mStock = marketData.find(s => s.symbol === item.symbol);
                return acc + (mStock ? mStock.price * item.amount : 0);
            }, 0);
            const totalWealth = userData.balance + currentPortfolioValue;
            userData.wealthHistory = [...userData.wealthHistory, { time: new Date().toLocaleTimeString(), wealth: totalWealth }].slice(-30);
            dbChanged = true;
        });
        if (dbChanged) writeDb(db);
    } catch (error) {
        console.error('Varlık Geçmişi Güncelleme Hatası:', error);
    }
}, 10000);

// API Endpoints
app.get('/api/market', (req, res) => res.json(marketData));

app.get('/api/user/data', (req, res) => {
    const username = req.headers['x-user'];
    if (!username) return res.status(401).json({ error: 'Auth required' });
    const db = readDb();
    const userData = getUser(db, username);
    writeDb(db); // Save if auto-created
    res.json(userData);
});

app.post('/api/trade/buy', (req, res) => {
    const username = req.headers['x-user'];
    if (!username) return res.status(401).json({ error: 'Auth required' });
    const { symbol, amount } = req.body;
    const stock = marketData.find(s => s.symbol === symbol);
    if (!stock) return res.status(404).json({ success: false, message: 'Hisse bulunamadı.' });

    const db = readDb();
    const userData = getUser(db, username);
    const cost = stock.price * amount;
    if (cost > userData.balance) return res.status(400).json({ success: false, message: 'Yetersiz bakiye.' });

    userData.balance -= cost;
    const existing = userData.portfolio.find(p => p.symbol === symbol);
    if (existing) {
        const totalOwned = existing.amount + amount;
        existing.averageCost = (existing.averageCost * existing.amount + cost) / totalOwned;
        existing.amount = totalOwned;
    } else {
        userData.portfolio.push({ symbol, amount, averageCost: stock.price });
    }

    userData.history.unshift({
        id: Date.now(),
        type: 'ALIM',
        symbol,
        amount,
        price: stock.price,
        total: cost,
        date: new Date().toLocaleString('tr-TR'),
        isAuto: false
    });

    writeDb(db);
    res.json({ success: true, data: userData });
});

app.post('/api/trade/sell', (req, res) => {
    const username = req.headers['x-user'];
    if (!username) return res.status(401).json({ error: 'Auth required' });
    const { symbol, amount } = req.body;
    const db = readDb();
    const userData = getUser(db, username);
    const stockInPortfolio = userData.portfolio.find(p => p.symbol === symbol);
    if (!stockInPortfolio || stockInPortfolio.amount < amount) {
        return res.status(400).json({ success: false, message: 'Yetersiz hisse adedi.' });
    }

    const stock = marketData.find(s => s.symbol === symbol);
    const revenue = (stock ? stock.price : 0) * amount;

    userData.balance += revenue;
    stockInPortfolio.amount -= amount;
    if (stockInPortfolio.amount === 0) {
        userData.portfolio = userData.portfolio.filter(p => p.symbol !== symbol);
    }

    userData.history.unshift({
        id: Date.now(),
        type: 'SATIM',
        symbol,
        amount,
        price: stock ? stock.price : 0,
        total: revenue,
        date: new Date().toLocaleString('tr-TR'),
        isAuto: false
    });

    writeDb(db);
    res.json({ success: true, data: userData });
});

app.post('/api/bot/config', (req, res) => {
    const username = req.headers['x-user'];
    if (!username) return res.status(401).json({ error: 'Auth required' });
    const { symbol, config } = req.body;
    const db = readDb();
    const userData = getUser(db, username);
    userData.botConfigs[symbol] = { ...userData.botConfigs[symbol], ...config };
    writeDb(db);
    res.json({ success: true, data: userData.botConfigs });
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
