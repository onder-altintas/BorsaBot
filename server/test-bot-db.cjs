require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');

const check = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        const users = await User.find({});
        for (let user of users) {
            console.log(`User: ${user.username}`);
            console.log(`BotConfigs (raw):`, user.get('botConfigs'));
        }
    } catch (e) {
        console.error(e);
    } finally {
        process.exit(0);
    }
};

check();
