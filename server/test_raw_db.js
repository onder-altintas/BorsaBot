const mongoose = require('mongoose');
require('dotenv').config();

async function getRawUser() {
    await mongoose.connect(process.env.MONGODB_URI);
    try {
        const rawUser = await mongoose.connection.db.collection('users').findOne({ username: 'testuser' });
        console.log("RAW USER PORTFOLIO TYPE:", typeof rawUser.portfolio, Array.isArray(rawUser.portfolio));
        console.log("RAW USER PORTFOLIO DATA:", JSON.stringify(rawUser.portfolio, null, 2));

        const rawUser2 = await mongoose.connection.db.collection('users').findOne({ username: 'yakupsrn' }); // or any other user
        if (rawUser2) console.log("RAW USER2 PORTFOLIO DATA:", JSON.stringify(rawUser2.portfolio, null, 2));
    } catch (e) {
        console.error(e);
    } finally {
        mongoose.disconnect();
    }
}
getRawUser();
