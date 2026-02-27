const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const User = require('./models/User');

const marketData = [{
    symbol: 'THYAO.IS',
    price: 300,
    change: 1,
    changePercent: 0.3,
    indicators: {
        recommendationQQE: 'AL', // Artificial AL Signal
        recommendation: 'TUT'
    }
}];

async function runTest() {
    const mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();

    await mongoose.connect(uri);
    console.log("Connected to in-memory DB.");

    const username = 'cem';

    // Seed new user and bot config
    let user = new User({
        username,
        balance: 100000,
        portfolio: [],
        history: [],
        botConfigs: new Map()
    });

    user.botConfigs.set('THYAO.IS', { active: true, amount: 5, strategy: 'QQE', lastSignal: 'TUT', stopLoss: 5, takeProfit: 10 });
    await user.save();

    console.log(`User '${username}' seeded. Starting balance: ${user.balance}`);
    console.log("Bot configured for THYAO.IS (Strategy: QQE, Amount: 5).");

    const COMMISSION_RATE = 0.002;

    // Simulate the bot eval loop from index.js
    let userChanged = false;
    const botConfigs = user.botConfigs;

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

            console.log(`\n[BOT EVAL] User: ${user.username} | Symbol: ${symbol} | Active: ${config.active} | Strat: ${strategyType} | Signal: ${rec} | LastSignal: ${config.lastSignal} | Balance: ${user.balance}`);

            if (rec === 'AL' && config.lastSignal !== 'AL') {
                const stockCost = stock.price * (config.amount || 1);
                const commission = stockCost * COMMISSION_RATE;
                const totalCost = stockCost + commission;

                console.log(`[BOT ATTEMPT BUY] Try buy ${symbol} for total cost ${totalCost}. Has balance: ${user.balance >= totalCost}`);

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
                        amount: (config.amount || 1),
                        price: stock.price,
                        commission: commission,
                        total: totalCost,
                        date: new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' }),
                        isAuto: true,
                        reason: `${strategyType} İndikatör Sinyali`
                    }, ...user.history];

                    config.lastSignal = 'AL';
                    userChanged = true;
                    console.log(`[SUCCESS] Bought ${config.amount} ${symbol}. New Balance: ${user.balance}`);
                }
            }
        }
    }

    if (userChanged) {
        user.markModified('botConfigs');
        user.markModified('portfolio');
        user.markModified('history');
        await user.save();
        console.log("\nDB changes saved successfully.");
    }

    // Refetch the user to confirm save
    const updatedUser = await User.findOne({ username });
    console.log("\nCurrent Portfolio:", updatedUser.portfolio);
    console.log("Current History Length:", updatedUser.history.length);
    console.log("BotConfig LastSignal:", updatedUser.botConfigs.get('THYAO.IS').lastSignal);

    await mongoose.disconnect();
    await mongoServer.stop();
}

runTest();
