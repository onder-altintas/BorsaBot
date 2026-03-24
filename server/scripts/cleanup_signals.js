const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const SignalHistory = require('../models/SignalHistory');

const logFile = path.join(__dirname, 'cleanup.log');
const log = (msg) => {
    const time = new Date().toLocaleString('tr-TR');
    const line = `[${time}] ${msg}\n`;
    console.log(msg);
    fs.appendFileSync(logFile, line);
};

const runCleanup = async () => {
    try {
        if (!process.env.MONGODB_URI) {
            throw new Error('MONGODB_URI is not defined in .env');
        }
        log('🔄 Veritabanına bağlanılıyor...');
        await mongoose.connect(process.env.MONGODB_URI, {
            serverSelectionTimeoutMS: 10000
        });
        log('✅ Bağlantı başarılı.');

        const allRecords = await SignalHistory.find({})
            .sort({ symbol: 1, timeframe: 1, createdAt: 1 })
            .lean();

        log(`📊 Toplam ${allRecords.length} kayıt inceleniyor...`);

        const idsToDelete = [];
        let lastRecord = null;

        for (const record of allRecords) {
            if (lastRecord && 
                lastRecord.symbol === record.symbol && 
                lastRecord.timeframe === record.timeframe && 
                lastRecord.signal === record.signal) {
                
                // Mükerrer kayıt bulundu
                idsToDelete.push(record._id);
            } else {
                // Yeni bir sinyal veya farklı bir kategori
                lastRecord = record;
            }
        }

        if (idsToDelete.length > 0) {
            log(`🧹 ${idsToDelete.length} adet mükerrer kayıt siliniyor...`);
            const result = await SignalHistory.deleteMany({ _id: { $in: idsToDelete } });
            log(`✅ Temizlik tamamlandı. ${result.deletedCount} kayıt silindi.`);
        } else {
            log('✨ Mükerrer kayıt bulunamadı.');
        }

    } catch (err) {
        log(`❌ Hata: ${err.message}`);
    } finally {
        await mongoose.disconnect();
        log('🚪 Veritabanı bağlantısı kesildi.');
    }
};

runCleanup();
