const mongoose = require('mongoose');
const UserSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    balance: { type: Number, default: 100000 },
    portfolio: [{
        symbol: String,
        amount: Number,
        averageCost: Number
    }],
    botConfigs: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    }
});

const User = mongoose.model('User', UserSchema);

const user = new User({
    username: 'testuser',
    portfolio: []
});

user.portfolio.push({
    symbol: 'ASELS.IS',
    amount: 2,
    averageCost: 44.47
});

const err = user.validateSync();
if (err) {
    console.error("VALIDATION ERROR:", err);
} else {
    console.log("VALIDATION OK!");
}
