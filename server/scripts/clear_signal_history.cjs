/**
 * clear_signal_history.cjs
 * 
 * Strateji sinyal mantığı güncellendikten sonra (Fisher-BB-EMA v2, RSI null fix)
 * eski ve tutarsız SignalHistory kayıtlarını MongoDB'den temizler.
 * 
 * Kullanım:
 *   cd server && node scripts/clear_signal_history.cjs
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const SignalHistory = require('../models/SignalHistory');

const main = async () => {
    if (!process.env.MONGODB_URI) {
        console.error('MONGODB_URI eksik!');
        process.exit(1);
    }

    console.log('MongoDB bağlanıyor...');
    await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 8000 });
    console.log('Bağlantı başarılı.');

    const count = await SignalHistory.countDocuments({});
    console.log(`Mevcut kayıt sayısı: ${count}`);

    if (count === 0) {
        console.log('Zaten boş, temizlenecek şey yok.');
        await mongoose.disconnect();
        return;
    }

    const result = await SignalHistory.deleteMany({});
    console.log(`✅ ${result.deletedCount} kayıt silindi.`);
    console.log('Sinyal geçmişi temizlendi. Yeni veriler bir sonraki polling döngüsünde üretilecek.');

    await mongoose.disconnect();
    console.log('Bağlantı kapatıldı.');
};

main().catch(err => {
    console.error('Hata:', err.message);
    process.exit(1);
});
