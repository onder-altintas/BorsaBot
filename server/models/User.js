const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    balance: { type: Number, default: 100000 },
    portfolio: [{
        symbol: String,
        amount: Number,
        averageCost: Number
    }],
    history: [{
        id: Number,
        type: String,
        symbol: String,
        amount: Number,
        price: Number,
        commission: Number,
        total: Number,
        date: String,
        isAuto: Boolean,
        reason: String
    }],
    wealthHistory: [{
        time: String,
        wealth: Number
    }],
    // Dönem başı varlık snapshot'ları
    wealthSnapshots: {
        dayStart: { date: String, wealth: Number },
        weekStart: { date: String, wealth: Number },
        monthStart: { date: String, wealth: Number }
    },
    botConfigs: {
        type: Map,
        of: {
            active: Boolean,
            amount: Number,
            stopLoss: Number,
            takeProfit: Number
        },
        default: {}
    },
    stats: {
        winRate: Number,
        bestStock: String,
        totalTrades: Number,
        profitableTrades: Number
    }
}, {
    timestamps: true,
    toJSON: { flattenMaps: true },
    toObject: { flattenMaps: true }
});

module.exports = mongoose.model('User', UserSchema);
