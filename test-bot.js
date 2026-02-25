require('dotenv').config({ path: './server/.env' });
const mongoose = require('mongoose');
const User = require('./server/models/User');

const run = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        let user = await User.findOne({ username: 'testuser' });

        if (!user) {
            console.log('User not found!');
            return process.exit(1);
        }

        if (!user.botConfigs) {
            user.botConfigs = new Map();
        }

        const existing = user.botConfigs.get('BIMAS.IS') || {};
        user.botConfigs.set('BIMAS.IS', { ...existing, active: true });

        user.markModified('botConfigs');
        await user.save();

        console.log('SAVE OK!');
    } catch (err) {
        console.error('SAVE ERROR:', err);
    } finally {
        process.exit(0);
    }
};

run();
