const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors()); // Allow all origins for easier setup
app.use(express.json());

// Database setup (simple JSON file for persistence)
const DB_PATH = path.join(__dirname, 'db.json');
const INITIAL_DATA = {
    balance: 100000.00,
    portfolio: [],
    history: [],
    wealthHistory: [{ time: new Date().toLocaleTimeString(), wealth: 100000 }],
    botConfigs: {}
};

function readDb() {
    if (!fs.existsSync(DB_PATH)) {
        fs.writeFileSync(DB_PATH, JSON.stringify(INITIAL_DATA, null, 2));
        return INITIAL_DATA;
    }
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
}

function writeDb(data) {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
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

    // Execute Bots
    const db = readDb();
    let dbChanged = false;

    marketData.forEach(stock => {
        const config = db.botConfigs[stock.symbol];
        if (config && config.active) {
            const rec = stock.indicators?.recommendation;
            if (rec === 'GÜÇLÜ AL') {
                const cost = stock.price * (config.amount || 1);
                if (db.balance >= cost) {
                    db.balance -= cost;
                    const existing = db.portfolio.find(p => p.symbol === stock.symbol);
                    if (existing) {
                        const totalOwned = existing.amount + (config.amount || 1);
                        existing.averageCost = (existing.averageCost * existing.amount + cost) / totalOwned;
                        existing.amount = totalOwned;
                    } else {
                        db.portfolio.push({ symbol: stock.symbol, amount: (config.amount || 1), averageCost: stock.price });
                    }
                    db.history.unshift({
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
                const stockInPortfolio = db.portfolio.find(p => p.symbol === stock.symbol);
                if (stockInPortfolio && stockInPortfolio.amount >= (config.amount || 1)) {
                    const revenue = stock.price * (config.amount || 1);
                    db.balance += revenue;
                    stockInPortfolio.amount -= (config.amount || 1);
                    if (stockInPortfolio.amount === 0) {
                        db.portfolio = db.portfolio.filter(p => p.symbol !== stock.symbol);
                    }
                    db.history.unshift({
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

    if (dbChanged) writeDb(db);

}, 3000);

// wealth history update every 10 seconds
setInterval(() => {
    const db = readDb();
    const currentPortfolioValue = db.portfolio.reduce((acc, item) => {
        const mStock = marketData.find(s => s.symbol === item.symbol);
        return acc + (mStock ? mStock.price * item.amount : 0);
    }, 0);
    const totalWealth = db.balance + currentPortfolioValue;
    db.wealthHistory = [...db.wealthHistory, { time: new Date().toLocaleTimeString(), wealth: totalWealth }].slice(-30);
    writeDb(db);
}, 10000);

// API Endpoints
app.get('/api/market', (req, res) => res.json(marketData));
app.get('/api/user/data', (req, res) => res.json(readDb()));

app.post('/api/trade/buy', (req, res) => {
    const { symbol, amount } = req.body;
    const stock = marketData.find(s => s.symbol === symbol);
    if (!stock) return res.status(404).json({ success: false, message: 'Hisse bulunamadı.' });

    const db = readDb();
    const cost = stock.price * amount;
    if (cost > db.balance) return res.status(400).json({ success: false, message: 'Yetersiz bakiye.' });

    db.balance -= cost;
    const existing = db.portfolio.find(p => p.symbol === symbol);
    if (existing) {
        const totalOwned = existing.amount + amount;
        db.portfolio = db.portfolio.map(p => p.symbol === symbol
            ? { ...p, amount: totalOwned, averageCost: (p.averageCost * p.amount + cost) / totalOwned }
            : p
        );
    } else {
        db.portfolio.push({ symbol, amount, averageCost: stock.price });
    }

    db.history.unshift({
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
    res.json({ success: true, data: db });
});

app.post('/api/trade/sell', (req, res) => {
    const { symbol, amount } = req.body;
    const db = readDb();
    const stockInPortfolio = db.portfolio.find(p => p.symbol === symbol);
    if (!stockInPortfolio || stockInPortfolio.amount < amount) {
        return res.status(400).json({ success: false, message: 'Yetersiz hisse adedi.' });
    }

    const stock = marketData.find(s => s.symbol === symbol);
    const revenue = (stock ? stock.price : 0) * amount;

    db.balance += revenue;
    db.portfolio = db.portfolio.map(p => p.symbol === symbol
        ? { ...p, amount: p.amount - amount }
        : p
    ).filter(p => p.amount > 0);

    db.history.unshift({
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
    res.json({ success: true, data: db });
});

app.post('/api/bot/config', (req, res) => {
    const { symbol, config } = req.body;
    const db = readDb();
    db.botConfigs[symbol] = { ...db.botConfigs[symbol], ...config };
    writeDb(db);
    res.json({ success: true, data: db.botConfigs });
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
