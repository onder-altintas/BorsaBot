const mongoose = require('mongoose');
require('dotenv').config();
const User = require('./models/User');

const BIST_STOCK_SYMBOLS = [
    { symbol: 'THYAO.IS', name: 'Türk Hava Yolları' },
    { symbol: 'ASELS.IS', name: 'Aselsan' },
];

let marketData = BIST_STOCK_SYMBOLS.map(stock => ({
    ...stock,
    price: 100,
    dayStartPrice: 90,
    indicators: {
        recommendation: 'AL'
    }
}));

const COMMISSION_RATE = 0.0005;

async function runTest() {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("Connected DB");

    let user = await User.findOne({ username: 'testuser' });
    if (!user) {
        user = await User.create({ username: 'testuser', balance: 100000, botConfigs: {} });
    }

    user.balance = 100000;
    user.botConfigs = { 'ASELS.IS': { active: true, amount: 5 } };
    user.portfolio = [];
    user.markModified('botConfigs');
    await user.save();
    console.log("User prepared");

    // Bot evaluation loop
    let userChanged = false;
    const botConfigs = user.botConfigs;
    if (botConfigs) {
        const entries = (botConfigs instanceof Map) ? botConfigs.entries() : Object.entries(botConfigs);
        for (let [symbol, config] of entries) {
            if (config && config.active) {
                const stock = marketData.find(s => s.symbol === symbol);
                if (!stock) continue;

                const rec = stock.indicators?.recommendation;
                console.log(`[BOT EVAL] User: ${user.username} | Symbol: ${symbol} | Active: ${config.active} | Signal: ${rec} | LastSignal: ${config.lastSignal} | Balance: ${user.balance}`);

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
                            isAuto: true,
                            reason: '4\'lü İndikatör Sinyali'
                        });

                        config.lastSignal = 'AL';
                        userChanged = true;
                    }
                }
            }
        }
    }

    if (userChanged) {
        user.markModified('botConfigs');
        user.markModified('portfolio');
        user.markModified('history');
        await user.save();
        console.log("User updated successfully");
    } else {
        console.log("No changes made to user");
    }

    // Verifying it actually saved the lastSignal
    const checkUser = await User.findOne({ username: 'testuser' });
    console.log("Check Last Signal:", checkUser.botConfigs['ASELS.IS'].lastSignal);
    console.log("Check Portfolio:", checkUser.portfolio.length);

    mongoose.disconnect();
}

runTest().catch(console.error);
