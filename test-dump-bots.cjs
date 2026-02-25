require('dotenv').config({ path: './server/.env' });
const mongoose = require('mongoose');
const User = require('./server/models/User');

const test = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        const users = await User.find({});
        for (let user of users) {
            console.log("User:", user.username);
            console.log("Bot Configs:", user.botConfigs);
        }
    } catch (e) {
        console.error(e);
    } finally {
        process.exit(0);
    }
};

test();
