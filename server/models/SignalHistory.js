const mongoose = require('mongoose');

const SignalHistorySchema = new mongoose.Schema({
    symbol:    { type: String, required: true, index: true },   // Hisse kodu (ör: THYAO.IS)
    signal:    { type: String, required: true, enum: ['AL', 'SAT'] }, // Sinyal türü
    timeframe: { type: String, required: true, enum: ['1h', '4h', '1d'] }, // Zaman dilimi
    price:     { type: Number, required: true },                // Sinyal anındaki fiyat
    date:      { type: Date, default: Date.now, index: true }   // Sinyal tarihi
});

// En fazla son 5000 kayıt tutulsun (TTL veya manuel temizlik için index)
SignalHistorySchema.index({ date: -1 });

module.exports = mongoose.model('SignalHistory', SignalHistorySchema);
