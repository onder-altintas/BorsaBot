require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');

async function testSave() {
    await mongoose.connect(process.env.MONGODB_URI);

    try {
        const user = await User.findOne({ username: 'testuser' });
        if (!user) return console.log('no user');

        // Simüle edilmiş bir purchase
        user.portfolio.push({
            symbol: 'ASELS.IS',
            amount: 2,
            averageCost: 44.50
        });

        await user.save();
        console.log("Save OK!");
    } catch (err) {
        console.error("SAVE FAILED:", err);
    } finally {
        mongoose.disconnect();
    }
}
testSave();
