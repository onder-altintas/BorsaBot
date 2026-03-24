const mongoose = require('mongoose');

const SignalHistorySchema = new mongoose.Schema({
    symbol:    { type: String, required: true, index: true },               // Hisse kodu (ör: THYAO.IS)
    strategy:  { type: String, required: true, default: 'QQE' },           // Strateji adı
    timeframe: { type: String, required: true, enum: ['1h', '4h', '1d'] }, // Strateji saati
    signal:    { type: String, required: true, enum: ['AL', 'SAT'] },      // Sinyal türü
    price:     { type: Number, required: true },                            // Hisse değeri
    date:      { type: String, required: true },                            // Tarih (ör: 24.03.2026)
    time:      { type: String, required: true },                            // Saat (ör: 09:45:00)
    createdAt: { type: Date, default: Date.now, index: true }
});

// En yeni önce sırala
SignalHistorySchema.index({ createdAt: -1 });

module.exports = mongoose.model('SignalHistory', SignalHistorySchema);
