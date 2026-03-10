const mongoose = require('mongoose');

const KapNewsSchema = new mongoose.Schema({
    symbol: { type: String, required: true, index: true },      // "THYAO"
    kapId: { type: String, unique: true, sparse: true },        // KAP unique bildirim numarası
    title: { type: String, required: true },                    // Başlık
    url: { type: String },                                      // KAP linki
    publishedAt: { type: Date, required: true, index: true },   // Yayın tarihi
    summary: { type: String },                                  // Haber özeti / içerik
    companyName: { type: String },                              // Şirket adı
    disclosureType: { type: String },                           // Bildirim tipi
    aiComment: { type: String, default: null },                 // Gemini yorumu (null = henüz üretilmemiş)
    aiCommentAt: { type: Date, default: null },                 // Yorum üretilme zamanı
    createdAt: { type: Date, default: Date.now }
});

// Aynı haber tekrar kaydedilmesin
KapNewsSchema.index({ symbol: 1, publishedAt: 1, title: 1 }, { unique: true });

module.exports = mongoose.model('KapNews', KapNewsSchema);
