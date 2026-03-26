const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const clearSignals = async () => {
    try {
        if (!process.env.MONGODB_URI) {
            throw new Error('MONGODB_URI tanımlı değil! (.env dosyasını kontrol edin)');
        }

        console.log('🔄 MongoDB\'ye bağlanılıyor...');
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ MongoDB bağlantısı başarılı.');
        
        const SignalHistory = require('../models/SignalHistory');
        const count = await SignalHistory.countDocuments();
        
        if (count === 0) {
            console.log('ℹ️ Temizlenecek veri bulunamadı.');
        } else {
            const result = await SignalHistory.deleteMany({});
            console.log(`🚀 ${result.deletedCount} adet sinyal geçmişi başarıyla silindi.`);
        }
        
        await mongoose.disconnect();
        process.exit(0);
    } catch (err) {
        console.error('❌ Hata:', err.message);
        process.exit(1);
    }
};

clearSignals();
