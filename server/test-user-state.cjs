require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');
const fs = require('fs');

const test = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        const users = await User.find({});
        let out = [];
        for (let user of users) {
            let u = { username: user.username, balance: user.balance, bots: [] };
            if (user.botConfigs) {
                const entries = (user.botConfigs instanceof Map) ? user.botConfigs.entries() : Object.entries(user.botConfigs);
                for (let [symbol, config] of entries) {
                    u.bots.push({ symbol, active: config.active, lastSignal: config.lastSignal, amount: config.amount });
                }
            }
            out.push(u);
        }
        fs.writeFileSync('bots-out.json', JSON.stringify(out, null, 2));
    } catch (e) {
        console.error(e);
    } finally {
        process.exit(0);
    }
};

test();
