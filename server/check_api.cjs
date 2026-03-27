const axios = require('axios');

async function checkApi() {
    try {
        const res = await axios.get('http://localhost:5000/api/market');
        const bist30 = res.data.data.find(s => s.symbol === 'XU030.IS');
        if (bist30) {
            console.log('✅ BIST 30 bulundu:', bist30.price, bist30.changePercent);
        } else {
            console.log('❌ BIST 30 API yanıtında bulunamadı!');
            console.log('Mevcut semboller:', res.data.data.map(s => s.symbol));
        }
    } catch (err) {
        console.error('API Hatası:', err.message);
    }
}

checkApi();
