require('dotenv').config({ path: './server/.env' });
const mongoose = require('mongoose');
const User = require('./server/models/User');

const testBotSave = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        let user = await User.findOne({ username: 'testuser' });
        if (!user) {
            console.log("No testuser! Run web app first to create docs");
            process.exit(0);
        }

        if (!user.botConfigs || user.botConfigs instanceof Map) {
            user.botConfigs = {};
        }

        const existing = user.botConfigs['BIMAS.IS'] || {};
        user.botConfigs['BIMAS.IS'] = { ...existing, active: true };

        user.markModified('botConfigs');
        await user.save();
        console.log("SUCCESSFULLY SAVED BOT CONFIG");

    } catch (e) {
        console.error("FAILED TO SAVE BOT CONFIG:", e.message, "\n", e.stack);
    } finally {
        process.exit(0);
    }
};

testBotSave();
