require('dotenv').config({ path: require('path').join(__dirname, '.env') });

// Strateji versiyonu — Fisher-BB-EMA v2 ve RSI null-fix sonrası arttırıldı.
// Bu versiyon değiştiğinde eski SignalHistory verileri sunucu başlarken otomatik silinir.
const STRATEGY_VERSION = '2';
const express = require('express');
const cors = require('cors');
const path = require('path');
const mongoose = require('mongoose');
const YahooFinance = require('yahoo-finance2').default;
const yahooFinance = new YahooFinance();
const User = require('./models/User');
const KapNews = require('./models/KapNews');
const SignalHistory = require('./models/SignalHistory');
const { startKapPollingService } = require('./services/kapService');


const app = express();
const PORT = process.env.PORT || 5000;


let lastMarketFetchTime = 0;
const MARKETS_CACHE_TTL = 20000; // 20 saniye
let globalFetchError = null;
// Global sinyal takip haritası: { "THYAO.IS_1h": "AL", "THYAO.IS_4h": "SAT", ... }
const previousSignals = {};


// MongoDB Bağlantısı
mongoose.set('bufferCommands', false);

const connectDB = async () => {
    if (mongoose.connection.readyState >= 1) {
        return mongoose.connection;
    }

    if (!process.env.MONGODB_URI) {
        throw new Error('MONGODB_URI ortam değişkeni eksik!');
    }

    try {
        await mongoose.connect(process.env.MONGODB_URI, {
            serverSelectionTimeoutMS: 5000
        });
        console.log('✅ MongoDB Bağlantısı Başarılı');
        await migrateSymbols();
        await migrateStrategyVersion();
        return mongoose.connection;
    } catch (err) {
        console.error('❌ MongoDB Bağlantısı Başarısız:', err.message);
        throw err;
    }
};

// CORS Ayarları
const allowedOrigins = [
    'http://localhost:5173',
    'http://localhost:3000',
    'http://88.198.174.52:5000',
    'http://88.198.174.52'
];

app.use(cors({
    origin: function (origin, callback) {
        if (!origin) return callback(null, true);
        if (allowedOrigins.indexOf(origin) === -1) {
            const msg = 'Bu domain için CORS politikası erişime izin vermiyor.';
            return callback(new Error(msg), false);
        }
        return callback(null, true);
    },
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'x-user'],
    credentials: true
}));
app.use(express.json());

let activeFetchPromise = null;

// İstek Günlükçü Middleware
app.use('/api', async (req, res, next) => {
    console.log(`[${new Date().toLocaleTimeString('tr-TR', { timeZone: 'Europe/Istanbul' })}] ${req.method} ${req.url} - Kullanıcı: ${req.headers['x-user'] || 'Misafir'}`);

    try {
        await connectDB();
    } catch (err) {
        return res.status(503).json({ error: 'Veritabanına bağlanılamadı.', details: err.message });
    }

    const now = Date.now();
    if (now - lastMarketFetchTime > MARKETS_CACHE_TTL || (marketData[0] && marketData[0].price === 0)) {
        if (!activeFetchPromise) {
            console.log("FETCH REAL MARKET DATA TETIKLENDI (Fiyat 0 veya sure doldu)");
            lastMarketFetchTime = now;
            activeFetchPromise = fetchRealMarketData().catch(err => {
                console.error('Auto-trigger fetch error:', err);
            }).finally(() => {
                activeFetchPromise = null;
            });
        }

        // Bu istek beklemede olan getirme işlemini tamamlamasını beklesin
        try {
            await activeFetchPromise;
        } catch (err) { }
    }

    next();
});

const COMMISSION_RATE = 0.0005; // 5/10000 komisyon oranı

// Eski semboller için migrasyon (THYAO -> THYAO.IS)
const migrateSymbols = async () => {
    try {
        const users = await User.find({});
        for (let user of users) {
            let changed = false;
            // Portföy migrasyonu
            user.portfolio = user.portfolio.map(p => {
                if (!p.symbol.endsWith('.IS')) {
                    p.symbol = p.symbol + '.IS';
                    changed = true;
                }
                return p;
            });
            // History migration
            user.history = user.history.map(h => {
                if (h.symbol && !h.symbol.endsWith('.IS')) {
                    h.symbol = h.symbol + '.IS';
                    changed = true;
                }
                return h;
            });
            if (changed) {
                user.markModified('portfolio');
                user.markModified('history');
                await user.save();
                console.log(`Semboller güncellendi, kullanıcı: ${user.username}`);
            }
        }
    } catch (err) {
        console.error('Migrasyon Hatası:', err);
    }
};

// Strateji versiyonu değiştiğinde eski SignalHistory verilerini temizle
// Versiyon bilgisi DB'de saklanır (mongoose User dışında basit bir belge)
let _strategyVersionMigratedOnce = false;
const migrateStrategyVersion = async () => {
    if (_strategyVersionMigratedOnce) return;
    _strategyVersionMigratedOnce = true;
    try {
        // DB'de versiyon kaydı tutmak için KapNews modelini geçici olarak kullan
        // (Yeni model yerine mevcut koleksiyonu)
        // Daha sade: process.env içinde SIGNAL_HISTORY_VERSION env var ile kontrol
        const storedVersion = process.env.SIGNAL_HISTORY_VERSION || '1';
        if (storedVersion !== STRATEGY_VERSION) {
            const result = await SignalHistory.deleteMany({});
            console.log(`🔄 [MigrateStrategyVersion] Strateji v${storedVersion} → v${STRATEGY_VERSION}: ${result.deletedCount} eski kayıt silindi.`);
            console.log('🆕 SignalHistory temizlendi. Yeni veriler bir sonraki polling döngüsünde üretilecek.');
        } else {
            console.log(`[MigrateStrategyVersion] Strateji versiyonu güncel (v${STRATEGY_VERSION}), temizleme gerekmedi.`);
        }
    } catch (err) {
        console.error('[MigrateStrategyVersion] Hata:', err.message);
    }
};

// Yeni kullanıcı için başlangıç verileri
const getInitialUserData = (username) => ({
    username,
    balance: 100000.00,
    portfolio: [],
    history: [],
    wealthHistory: [{ time: new Date().toLocaleTimeString('tr-TR', { timeZone: 'Europe/Istanbul' }), wealth: 100000 }],
    wealthSnapshots: {
        dayStart: { date: new Date().toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul' }), wealth: 100000 },
        weekStart: { date: new Date().toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul' }), wealth: 100000 },
        monthStart: { date: `${new Date().getFullYear()}-${new Date().getMonth() + 1}`, wealth: 100000 },
        yearStart: { date: `${new Date().getFullYear()}`, wealth: 100000 }
    },
    botConfigs: {},
    stats: { winRate: 0, bestStock: '-', totalTrades: 0, profitableTrades: 0 }
});

// BIST 100 Başlıca Hisseler
const BIST_STOCK_SYMBOLS = [
    { symbol: 'AEFES.IS', name: 'Anadolu Efes' },
    { symbol: 'AKBNK.IS', name: 'Akbank' },
    { symbol: 'ASELS.IS', name: 'Aselsan' },
    { symbol: 'ASTOR.IS', name: 'Astor Enerji' },
    { symbol: 'BIMAS.IS', name: 'Bim Birleşik Mağazalar' },
    { symbol: 'DSTKF.IS', name: 'Destek Finans Faktoring' },
    { symbol: 'EKGYO.IS', name: 'Emlak Konut GYO' },
    { symbol: 'ENKAI.IS', name: 'Enka İnşaat' },
    { symbol: 'EREGL.IS', name: 'Erdemir' },
    { symbol: 'FROTO.IS', name: 'Ford Otosan' },
    { symbol: 'GARAN.IS', name: 'Garanti BBVA' },
    { symbol: 'GUBRF.IS', name: 'Gübre Fabrikaları' },
    { symbol: 'ISCTR.IS', name: 'İş Bankası (C)' },
    { symbol: 'KCHOL.IS', name: 'Koç Holding' },
    { symbol: 'TRALT.IS', name: 'Türk Altın İşletmeleri' },
    { symbol: 'KRDMD.IS', name: 'Kardemir (D)' },
    { symbol: 'MGROS.IS', name: 'Migros Ticaret' },
    { symbol: 'PETKM.IS', name: 'Petkim' },
    { symbol: 'PGSUS.IS', name: 'Pegasus' },
    { symbol: 'SAHOL.IS', name: 'Sabancı Holding' },
    { symbol: 'SASA.IS', name: 'Sasa Polyester' },
    { symbol: 'SISE.IS', name: 'Şişecam' },
    { symbol: 'TAVHL.IS', name: 'TAV Havalimanları' },
    { symbol: 'TCELL.IS', name: 'Turkcell' },
    { symbol: 'THYAO.IS', name: 'Türk Hava Yolları' },
    { symbol: 'TOASO.IS', name: 'Tofaş' },
    { symbol: 'TTKOM.IS', name: 'Türk Telekom' },
    { symbol: 'TUPRS.IS', name: 'Tüpraş' },
    { symbol: 'ULKER.IS', name: 'Ülker Bisküvi' },
    { symbol: 'YKBNK.IS', name: 'Yapı Kredi' },
    { symbol: 'XU030.IS', name: 'BIST 30 Endeksi' },
];

let marketData = BIST_STOCK_SYMBOLS.map(stock => ({
    ...stock,
    price: 0,
    dayStartPrice: 0,
    change: 0,
    changePercent: 0,
    priceHistory: [],
    indicators: {
        sma5: 0,
        sma10: 0,
        rsi: 50,
        recommendation: 'TUT',
        macd: { line: 0, signal: 0, hist: 0 },
        bollinger: { upper: 0, middle: 0, lower: 0 },
        fisher: { val1: 0, val2: 0 }
    }
}));

const calculateEMA = (data, period) => {
    if (data.length < period) return data[data.length - 1];
    const k = 2 / (period + 1);
    let ema = data[0];
    for (let i = 1; i < data.length; i++) {
        ema = (data[i] * k) + (ema * (1 - k));
    }
    return ema;
};

// QQE İndikatörü hesaplama fonksiyonu — Pine Script QQE ile birebir eşdeğer
// Pine: length=15, SSF=14, wwalpha=1/length, WWMA=RMA(TR,length), ATRRSI=RMA(WWMA,length)
// Sinyal: crossover(QQEF,QQES)→AL | crossunder(QQEF,QQES)→SAT | diğer→TUT
const calculateQQESignal = (history) => {
    if (history.length < 3) return 'TUT';
    const prices = history.map(h => h.price);

    // Pine Script parametreleri
    const length = 15;   // RSI Length
    const SSF    = 14;   // SF (RSI Smoothing Factor — EMA periyodu)
    const qqeFactor = 4.236;
    const wwalpha = 1 / length;  // Wilder smoothing alpha

    // RMA (Wilder's Moving Average) — Pine: wwalpha * x + (1-wwalpha) * prev
    const calcRMA = (data, alpha) => {
        const arr = [data[0] ?? 0];
        for (let i = 1; i < data.length; i++) {
            arr[i] = alpha * (data[i] ?? arr[i - 1]) + (1 - alpha) * arr[i - 1];
        }
        return arr;
    };

    // EMA — Pine: ta.ema(src, period)
    const calcEMA = (data, period) => {
        const alpha = 2 / (period + 1);
        const arr = [data[0] ?? 0];
        for (let i = 1; i < data.length; i++) {
            arr[i] = alpha * (data[i] ?? arr[i - 1]) + (1 - alpha) * arr[i - 1];
        }
        return arr;
    };

    // RSI — Pine: ta.rsi(src, length) — Wilder tabanlı
    const calcRSI = (data, period) => {
        if (data.length < 2) return data.map(() => 50);
        const gains = [0], losses = [0];
        for (let i = 1; i < data.length; i++) {
            const d = data[i] - data[i - 1];
            gains.push(d > 0 ? d : 0);
            losses.push(d < 0 ? -d : 0);
        }
        const ag = calcRMA(gains, 1 / period);
        const al = calcRMA(losses, 1 / period);
        return ag.map((g, i) => al[i] === 0 ? 100 : 100 - (100 / (1 + g / al[i])));
    };

    // QQEF = ta.ema(ta.rsi(src, length), SSF)
    const QQEF = calcEMA(calcRSI(prices, length), SSF);

    // TR = abs(QQEF - QQEF[1])
    const TR = [0];
    for (let i = 1; i < QQEF.length; i++) TR.push(Math.abs(QQEF[i] - QQEF[i - 1]));

    // WWMA  = RMA(TR,  length)   — Pine: wwalpha*TR  + (1-wwalpha)*WWMA[1]
    // ATRRSI= RMA(WWMA,length)  — Pine: wwalpha*WWMA + (1-wwalpha)*ATRRSI[1]
    const WWMA   = calcRMA(TR,    wwalpha);
    const ATRRSI = calcRMA(WWMA,  wwalpha);

    const QUP = QQEF.map((v, i) => v + ATRRSI[i] * qqeFactor);
    const QDN = QQEF.map((v, i) => v - ATRRSI[i] * qqeFactor);

    // QQES trailing stop — Pine Script mantığı ile birebir:
    // QUP < QQES[1]                                   → QUP
    // QQEF > QQES[1] and QQEF[1] < QQES[1] (crossover)→ QDN
    // QDN > QQES[1]                                   → QDN
    // QQEF < QQES[1] and QQEF[1] > QQES[1] (crossunder)→ QUP
    // else                                             → QQES[1]
    const QQES = [0];
    for (let i = 1; i < QQEF.length; i++) {
        const prev = QQES[i - 1];
        let cur;
        if      (QUP[i] < prev)                                  cur = QUP[i];
        else if (QQEF[i] > prev && QQEF[i - 1] < prev)          cur = QDN[i];
        else if (QDN[i] > prev)                                   cur = QDN[i];
        else if (QQEF[i] < prev && QQEF[i - 1] > prev)          cur = QUP[i];
        else                                                       cur = prev;
        QQES.push(cur);
    }

    // Sinyal: Sadece CROSSOVER / CROSSUNDER anında AL veya SAT
    // Pine: buySignalr = ta.crossover(QQEF, QQES)  → QQEF[i-1]<=QQES[i-1] ve QQEF[i]>QQES[i]
    //       sellSignallr= ta.crossunder(QQEF, QQES) → QQEF[i-1]>=QQES[i-1] ve QQEF[i]<QQES[i]
    const n = QQEF.length - 1;
    const crossover  = QQEF[n - 1] <= QQES[n - 1] && QQEF[n] > QQES[n];
    const crossunder = QQEF[n - 1] >= QQES[n - 1] && QQEF[n] < QQES[n];

    if (crossover)  return 'AL';
    if (crossunder) return 'SAT';
    return 'TUT';
};

// Fisher Transform Hesaplama (Ehlers)
const calculateFisherTransform = (history, period = 10) => {
    if (history.length < period) return { fisher: 0, prevFisher: 0 };
    
    // Period içindeki High ve Low değerlerini bul
    const values = [];
    const fishers = [];
    let prevValue = 0;
    let prevFisher = 0;

    for (let i = period; i <= history.length; i++) {
        const slice = history.slice(i - period, i);
        const high = Math.max(...slice.map(h => h.high || h.price));
        const low = Math.min(...slice.map(h => h.low || h.price));
        const close = slice[slice.length - 1].price;

        let num = close - low;
        let den = high - low;
        if (den === 0) den = 0.001;

        let val = 0.33 * 2 * (num / den - 0.5) + 0.67 * prevValue;
        val = Math.min(Math.max(val, -0.999), 0.999);
        
        let fish = 0.5 * Math.log((1 + val) / (1 - val)) + 0.5 * prevFisher;
        
        values.push(val);
        fishers.push(fish);
        prevValue = val;
        prevFisher = fish;
    }

    return { 
        fisher: fishers[fishers.length - 1] || 0, 
        prevFisher: fishers[fishers.length - 2] || 0 
    };
};

// Volume Momentum (Volume Oscillator) Hesaplama
const calculateVolumeMomentum = (history) => {
    if (history.length < 10) return 0;
    const volumes = history.map(h => h.volume || 0);
    
    const ema5 = calculateEMA(volumes, 5);
    const ema10 = calculateEMA(volumes, 10);
    
    if (ema10 === 0) return 0;
    return ((ema5 - ema10) / ema10) * 100;
};

// MACD Hesaplama (12, 26, 9) — Gerçek Sinyal Hattı ile
const calculateMACD = (prices) => {
    if (prices.length < 26) return { line: 0, signal: 0, hist: 0, prevLine: 0, prevSignal: 0 };

    const calcEMAArray = (data, period) => {
        const k = 2 / (period + 1);
        const emaArr = [data[0]];
        for (let i = 1; i < data.length; i++) {
            emaArr.push(data[i] * k + emaArr[i - 1] * (1 - k));
        }
        return emaArr;
    };

    const ema12Arr = calcEMAArray(prices, 12);
    const ema26Arr = calcEMAArray(prices, 26);
    
    const macdLineArr = ema12Arr.map((e12, i) => e12 - ema26Arr[i]);
    const signalLineArr = calcEMAArray(macdLineArr, 9);
    
    const n = macdLineArr.length - 1;
    const line = macdLineArr[n];
    const signal = signalLineArr[n];
    const hist = line - signal;
    
    return { 
        line, 
        signal, 
        hist, 
        prevLine: macdLineArr[n - 1] || 0, 
        prevSignal: signalLineArr[n - 1] || 0 
    };
};

// MACD Strateji Sinyal Hesaplama
const calculateMACDSignal = (history) => {
    if (history.length < 35) return 'TUT';
    const prices = history.map(h => h.price);
    
    const { line, signal, prevLine, prevSignal } = calculateMACD(prices);
    
    const crossover  = prevLine <= prevSignal && line > signal;
    const crossunder = prevLine >= prevSignal && line < signal;
    
    if (crossover)  return 'AL';
    if (crossunder) return 'SAT';
    return 'TUT';
};


// RSI Hesaplama (Seri)
const calculateRSISeries = (prices, period = 14) => {
    if (prices.length < period + 1) return Array(prices.length).fill(50);
    const deltas = [];
    for (let i = 1; i < prices.length; i++) deltas.push(prices[i] - prices[i - 1]);

    const rsiArr = Array(period).fill(null);
    let avgGain = deltas.slice(0, period).filter(d => d > 0).reduce((a, b) => a + b, 0) / period;
    let avgLoss = deltas.slice(0, period).filter(d => d < 0).reduce((a, b) => a - b, 0) / period;

    for (let i = period; i < deltas.length; i++) {
        const gain = deltas[i] > 0 ? deltas[i] : 0;
        const loss = deltas[i] < 0 ? -deltas[i] : 0;
        avgGain = (avgGain * (period - 1) + gain) / period;
        avgLoss = (avgLoss * (period - 1) + loss) / period;
        const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
        rsiArr.push(100 - (100 / (1 + rs)));
    }
    return rsiArr;
};

// RSI Strateji Sinyal Hesaplama (30/70)
// v2: null değerler filtrele, prevRSI için gerçek önceki değer kullan
const calculateRSISignal = (history) => {
    if (history.length < 20) return 'TUT';
    const prices = history.map(h => h.price);
    const rsiArr = calculateRSISeries(prices, 14).filter(v => v !== null);
    if (rsiArr.length < 2) return 'TUT';
    const n = rsiArr.length - 1;
    const currRSI = rsiArr[n];
    const prevRSI = rsiArr[n - 1];

    if (prevRSI <= 30 && currRSI > 30) return 'AL';
    if (prevRSI >= 70 && currRSI < 70) return 'SAT';
    return 'TUT';
};


// Fisher-BB-EMA Hibrit Strateji Sinyal Hesaplama
// v2: fisherCrossUp/Down doğru eşiklerle ve buyCondition/sellCondition'da kullanılır hale getirildi
const calculateFisherBBEMASignal = (history) => {
    if (history.length < 50) return 'TUT';

    const prices = history.map(h => h.price);
    const ema20 = calculateEMA(prices, 20);
    const ema50 = calculateEMA(prices, 50);
    const lastPrice = prices[prices.length - 1];

    // Bollinger Bands
    const bbSlice = prices.slice(-20);
    const bbMiddle = bbSlice.reduce((a, b) => a + b, 0) / 20;
    const stdDev = Math.sqrt(bbSlice.reduce((a, b) => a + Math.pow(b - bbMiddle, 2), 0) / 20);
    const bbUpper = bbMiddle + stdDev * 2;

    // RSI — null'lardan temizlenmiş dizi kullan
    const rsiArr = calculateRSISeries(prices, 14).filter(v => v !== null);
    const rsi = rsiArr.length > 0 ? rsiArr[rsiArr.length - 1] : 50;

    // Fisher & Volume
    const { fisher, prevFisher } = calculateFisherTransform(history, 10);
    const vmo = calculateVolumeMomentum(history);

    // Fisher yön tespiti: gerçekçi eşikler (tipik aralık -1.5 ile +1.5)
    // fisherRising: Fisher negatif bölgeden yukarı dönüyor (alım baskısı başlıyor)
    // fisherFalling: Fisher pozitif bölgeden aşağı dönüyor (satış baskısı başlıyor)
    const fisherRising = fisher > prevFisher && prevFisher < 0;
    const fisherFalling = fisher < prevFisher && prevFisher > 0;

    // AL KOŞULLARI
    // 1. Fiyat EMA20 üzerinde
    // 2. EMA20 > EMA50 (trend yukarı)
    // 3. Fisher negatif bölgeden yükseliyor (gerçek crossover benzeri tespit)
    // 4. RSI > 50
    // 5. Hacim Momentumu pozitif
    const buyCondition = lastPrice > ema20
        && ema20 > ema50
        && fisherRising
        && rsi > 50
        && vmo > 0;

    // SAT KOŞULLARI — parantezlerle operatör önceliği netleştirildi
    // 1. Fiyat BB Üst Bandına değdi/geçti
    // 2. Fisher pozitif bölgeden aşağı dönüyor
    // 3. Fiyat EMA50 altına indi (EMA20 yerine EMA50: daha az agresif)
    const sellCondition = (lastPrice >= bbUpper)
        || (fisherFalling && prevFisher > 1.5)
        || (lastPrice < ema50);

    if (buyCondition) return 'AL';
    if (sellCondition) return 'SAT';
    return 'TUT';
};


// Gösterge hesaplama fonksiyonu (geriye dönük uyumluluk için)
// NOT: Bu fonksiyon yalnızca 1h verisiyle çağrılır.
// 4h ve 1d değerleri fetchRealMarketData() içinde ayrı ayrı hesaplanarak üzerine yazılır.
// Hard-coded 'TUT' placeholder'ları kaldırıldı — fetchRealMarketData override'ı yeterli.
const calculateIndicators = (history, currentPrice, symbol) => {
    if (history.length < 2) return {
        sma5: 0, sma10: 0, ema7: 0, rsi: 50,
        macd: { line: 0, signal: 0, hist: 0 },
        bollinger: { upper: 0, middle: 0, lower: 0 },
        qqe_1h: 'TUT', qqe_4h: 'TUT', qqe_1d: 'TUT',
        fisher_1h: 'TUT', fisher_4h: 'TUT', fisher_1d: 'TUT',
        macd_1h: 'TUT', macd_4h: 'TUT', macd_1d: 'TUT',
        rsi_1h: 'TUT', rsi_4h: 'TUT', rsi_1d: 'TUT'
    };
    const prices = history.map(h => h.price);

    const ema7 = calculateEMA(prices, 7);
    const sma5 = prices.slice(-5).reduce((a, b) => a + b, 0) / Math.min(prices.length, 5);
    const sma10 = prices.slice(-10).reduce((a, b) => a + b, 0) / Math.min(prices.length, 10);

    const { line, signal, hist } = calculateMACD(prices);
    const rsiArr = calculateRSISeries(prices, 14).filter(v => v !== null);
    const rsi = rsiArr.length > 0 ? rsiArr[rsiArr.length - 1] : 50;

    const bbPeriod = Math.min(prices.length, 20);
    const bbMiddle = prices.slice(-bbPeriod).reduce((a, b) => a + b, 0) / bbPeriod;
    const variance = prices.slice(-bbPeriod).reduce((a, b) => a + Math.pow(b - bbMiddle, 2), 0) / bbPeriod;
    const stdDev = Math.sqrt(variance);

    // 1h sinyalleri bu fonksiyonda hesaplanır
    const qqe_1h    = calculateQQESignal(history);
    const fisher_1h = calculateFisherBBEMASignal(history);
    const macd_1h   = calculateMACDSignal(history);
    const rsi_1h    = calculateRSISignal(history);

    return {
        sma5: parseFloat(sma5.toFixed(2)),
        sma10: parseFloat(sma10.toFixed(2)),
        ema7: parseFloat(ema7.toFixed(2)),
        rsi: parseFloat(rsi.toFixed(2)),
        macd: {
            line: parseFloat(line.toFixed(4)),
            signal: parseFloat(signal.toFixed(4)),
            hist: parseFloat(hist.toFixed(4))
        },
        bollinger: {
            upper: parseFloat((bbMiddle + stdDev * 2).toFixed(2)),
            middle: parseFloat(bbMiddle.toFixed(2)),
            lower: parseFloat((bbMiddle - stdDev * 2).toFixed(2))
        },
        // 1h değerleri burada hesaplanır; 4h/1d fetchRealMarketData'da override edilir
        qqe_1h, qqe_4h: 'TUT', qqe_1d: 'TUT',
        fisher_1h, fisher_4h: 'TUT', fisher_1d: 'TUT',
        macd_1h, macd_4h: 'TUT', macd_1d: 'TUT',
        rsi_1h, rsi_4h: 'TUT', rsi_1d: 'TUT'
    };
};

// Gerçek piyasa verilerini Yahoo Finance üzerinden çekme fonksiyonu
const fetchRealMarketData = async () => {
    try {
        const now = new Date();
        const symbols = marketData.map(s => s.symbol);

        console.log(`FETCH_MARKET: Yahoo Finance'den ${symbols.length} sembol cekiliyor...`);
        const quotes = await yahooFinance.quote(symbols);
        console.log(`FETCH_MARKET: ${quotes.length} hisse fiyatı basariyla cekildi.`);

        const mapHistory = (quotes) => quotes
            .filter(h => h.close !== null && h.close !== undefined)
            .map(h => ({
                time: h.date.toLocaleTimeString('tr-TR', { timeZone: 'Europe/Istanbul' }),
                price: h.close,
                volume: h.volume || 0,
                high: h.high || h.close,
                low: h.low || h.close
            }));

        const fetchPromises = marketData.map(async (stock) => {
            try {
                const quote = quotes.find(q => q.symbol === stock.symbol);
                if (!quote) return stock;

                const newPrice = quote.regularMarketPrice;
                const prevClose = quote.regularMarketPreviousClose || newPrice;
                const change = newPrice - prevClose;
                const changePercent = (change / prevClose) * 100;

                // 1 Saatlik veri (son 7 gün) — temel göstergeler + qqe_1h
                const start1h = new Date();
                start1h.setDate(start1h.getDate() - 7);
                const chart1h = await yahooFinance.chart(stock.symbol, { period1: start1h, interval: '1h' });
                const history1h = mapHistory(chart1h.quotes).slice(-60);

                // 4 Saatlik veri — 1h mumları gerçek 4h bloklarına (00,04,08,12,16,20) göre grupla
                // Yahoo Finance'de native 4h aralığı olmadığından 1h verisi manuel gruplanıyor
                const start4h = new Date();
                start4h.setDate(start4h.getDate() - 90); // 90 gün → yeterli 4h mum sayısı
                const chart4h = await yahooFinance.chart(stock.symbol, { period1: start4h, interval: '1h' });
                const raw4h = mapHistory(chart4h.quotes);

                // Her 1h mumu hangi 4h bloğuna ait olduğunu hesapla (UTC saat / 4)
                const blocks4h = {};
                for (const candle of raw4h) {
                    // date bilgisi yoksa time string'den saati al (varsayım: UTC+3)
                    // chart quote'lardan orijinal tarih bilgisini kullanmak için raw quotes'u paralel tut
                    const idx = raw4h.indexOf(candle);
                    const originalQuote = chart4h.quotes[idx];
                    if (!originalQuote || !originalQuote.date) continue;
                    const d = new Date(originalQuote.date);
                    // 4h blok anahtarı: YYYY-MM-DD_HH (HH=00,04,08,12,16,20)
                    const blockHour = Math.floor(d.getUTCHours() / 4) * 4;
                    const blockKey = `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}_${blockHour}`;
                    if (!blocks4h[blockKey]) blocks4h[blockKey] = [];
                    blocks4h[blockKey].push({ ...candle, _date: d });
                }

                const history4h = Object.keys(blocks4h)
                    .sort()
                    .map(key => {
                        const group = blocks4h[key];
                        return {
                            time: group[group.length - 1].time,
                            price: group[group.length - 1].price,       // kapanış fiyatı
                            volume: group.reduce((s, x) => s + x.volume, 0),
                            high: Math.max(...group.map(x => x.high)),
                            low: Math.min(...group.map(x => x.low))
                        };
                    })
                    .slice(-150); // son 150 mum yeterli

                // Günlük veri (son 180 gün)
                const start1d = new Date();
                start1d.setDate(start1d.getDate() - 180);
                const chart1d = await yahooFinance.chart(stock.symbol, { period1: start1d, interval: '1d' });
                const history1d = mapHistory(chart1d.quotes).slice(-100);

                // Strateji Sinyalleri
                const qqe_1h = calculateQQESignal(history1h);
                const qqe_4h = calculateQQESignal(history4h);
                const qqe_1d = calculateQQESignal(history1d);

                const fisher_1h = calculateFisherBBEMASignal(history1h);
                const fisher_4h = calculateFisherBBEMASignal(history4h);
                const fisher_1d = calculateFisherBBEMASignal(history1d);

                const macd_1h = calculateMACDSignal(history1h);
                const macd_4h = calculateMACDSignal(history4h);
                const macd_1d = calculateMACDSignal(history1d);

                const rsi_1h = calculateRSISignal(history1h);
                const rsi_4h = calculateRSISignal(history4h);
                const rsi_1d = calculateRSISignal(history1d);

                const indicators = calculateIndicators(history1h, newPrice, stock.symbol);
                indicators.qqe_1h = qqe_1h;
                indicators.qqe_4h = qqe_4h;
                indicators.qqe_1d = qqe_1d;
                indicators.fisher_1h = fisher_1h;
                indicators.fisher_4h = fisher_4h;
                indicators.fisher_1d = fisher_1d;
                indicators.macd_1h = macd_1h;
                indicators.macd_4h = macd_4h;
                indicators.macd_1d = macd_1d;
                indicators.rsi_1h = rsi_1h;
                indicators.rsi_4h = rsi_4h;
                indicators.rsi_1d = rsi_1d;

                return {
                    ...stock,
                    price: newPrice,
                    dayStartPrice: prevClose,
                    change: parseFloat(change.toFixed(2)),
                    changePercent: parseFloat(changePercent.toFixed(2)),
                    priceHistory: history1h,
                    indicators
                };
            } catch (err) {
                console.error(`${stock.symbol} verisi işlenirken hata (detay):`, err.stack);
                globalFetchError = `[Hata: ${stock.symbol}] ${err.stack || err.message}`;
                return stock;
            }
        });

        const updatedData = await Promise.all(fetchPromises);

        if (updatedData && updatedData.some(d => d.price > 0)) {
            marketData = updatedData;
            globalFetchError = null;

            // === GLOBAL SİNYAL GEÇMİŞİ KAYDI ===
            // Bot aktif olsun ya da olmasın, tüm hisseler için sinyal değişimi kaydedilir
            if (mongoose.connection.readyState === 1) {
                const now = new Date();
                const nowDate = now.toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul' });
                const nowTime = now.toLocaleTimeString('tr-TR', { timeZone: 'Europe/Istanbul' });
                const TIMEFRAMES = ['1h', '4h', '1d'];

                for (const stock of marketData) {
                    if (!stock.indicators || stock.price === 0) continue;
                    const STRATEGIES = ['QQE', 'Fisher-BB-EMA', 'MACD', 'RSI'];
                    const TIMEFRAMES = ['1h', '4h', '1d'];

                    for (const strat of STRATEGIES) {
                        for (const tf of TIMEFRAMES) {
                            const sigKey = `${stock.symbol}_${strat}_${tf}`;
                            let newSig = 'TUT';
                            
                            if (strat === 'QQE') {
                                newSig = tf === '4h' ? stock.indicators.qqe_4h : tf === '1d' ? stock.indicators.qqe_1d : stock.indicators.qqe_1h;
                            } else if (strat === 'Fisher-BB-EMA') {
                                newSig = tf === '4h' ? stock.indicators.fisher_4h : tf === '1d' ? stock.indicators.fisher_1d : stock.indicators.fisher_1h;
                            } else if (strat === 'MACD') {
                                newSig = tf === '4h' ? stock.indicators.macd_4h : tf === '1d' ? stock.indicators.macd_1d : stock.indicators.macd_1h;
                            } else if (strat === 'RSI') {
                                newSig = tf === '4h' ? stock.indicators.rsi_4h : tf === '1d' ? stock.indicators.rsi_1d : stock.indicators.rsi_1h;
                            }

                            if (newSig === 'AL' || newSig === 'SAT') {
                                // Veritabanındaki en son kaydı kontrol et
                                const lastRecordInDb = await SignalHistory.findOne({ 
                                    symbol: stock.symbol, 
                                    strategy: strat,
                                    timeframe: tf 
                                }).sort({ createdAt: -1 }).lean();

                                if (!lastRecordInDb || lastRecordInDb.signal !== newSig) {
                                    previousSignals[sigKey] = newSig;
                                    try {
                                        await SignalHistory.create({
                                            symbol:    stock.symbol,
                                            strategy:  strat,
                                            timeframe: tf,
                                            signal:    newSig,
                                            price:     stock.price,
                                            date:      nowDate,
                                            time:      nowTime
                                        });
                                        console.log(`[SIGNAL HISTORY] ${stock.symbol} | ${strat} | ${tf} | ${newSig} | ${nowDate} ${nowTime} (Kaydedildi)`);
                                    } catch (shErr) {
                                        console.error('[SignalHistory] Global kayıt hatası:', shErr.message);
                                    }
                                }
                            }
                        }
                    }
                }
            }
            // === / GLOBAL SİNYAL GEÇMİŞİ KAYDI ===

        } else {
            if (!globalFetchError) globalFetchError = "FETCH_MARKET_CRASH: Bütün hisse çekimleri başarısız oldu veya dizi boş!";
            console.error(globalFetchError);
        }

        // Kullanıcı işlemleri ve botları yönet
        if (mongoose.connection.readyState === 1) {
            const usersToProcess = await User.find({});
            for (let user of usersToProcess) {
                let userChanged = false;

                const botConfigs = user.botConfigs;
                if (botConfigs) {
                    const entries = (botConfigs instanceof Map) ? botConfigs.entries() : Object.entries(botConfigs);
                    for (let [symbol, config] of entries) {
                        if (config && config.active) {
                            const stock = marketData.find(s => s.symbol === symbol);
                            if (!stock) continue;

                            // Strateji ve Zaman dilimine göre sinyal seç
                            const timeframe = config.timeframe || '1h';
                            const strategy = config.strategy || 'QQE';
                            let rec = 'TUT';

                            if (strategy === 'Fisher-BB-EMA') {
                                if (timeframe === '4h') rec = stock.indicators?.fisher_4h || 'TUT';
                                else if (timeframe === '1d') rec = stock.indicators?.fisher_1d || 'TUT';
                                else rec = stock.indicators?.fisher_1h || 'TUT';
                            } else if (strategy === 'MACD') {
                                if (timeframe === '4h') rec = stock.indicators?.macd_4h || 'TUT';
                                else if (timeframe === '1d') rec = stock.indicators?.macd_1d || 'TUT';
                                else rec = stock.indicators?.macd_1h || 'TUT';
                            } else if (strategy === 'RSI') {
                                if (timeframe === '4h') rec = stock.indicators?.rsi_4h || 'TUT';
                                else if (timeframe === '1d') rec = stock.indicators?.rsi_1d || 'TUT';
                                else rec = stock.indicators?.rsi_1h || 'TUT';
                            } else {
                                if (timeframe === '4h') rec = stock.indicators?.qqe_4h || 'TUT';
                                else if (timeframe === '1d') rec = stock.indicators?.qqe_1d || 'TUT';
                                else rec = stock.indicators?.qqe_1h || 'TUT';
                            }

                            // Sinyal değişimi algılama
                            if (rec === 'AL' || rec === 'SAT') {
                                if (config.lastSignal !== rec) {
                                    config.lastSignal = rec;
                                    config.signalStartTime = Date.now();
                                    config.lastAction = 'NONE';
                                    userChanged = true;
                                    console.log(`[BOT SIGNAL CHANGED] User: ${user.username} | Symbol: ${symbol} | TF: ${timeframe} | New Signal: ${rec} | Timer Reset`);

                                    // Sinyal geçmişine kaydet (bot aktif olan için ek kayıt — global kayıt zaten yapılıyor)
                                    // Bu blok artık sadece bot loglama için bırakıldı

                                    // Eğer sinyal SAT ise ANINDA satış yap
                                    if (rec === 'SAT') {
                                        const stockInPortfolio = user.portfolio.find(p => p.symbol === stock.symbol);
                                        if (stockInPortfolio && stockInPortfolio.amount > 0) {
                                            const sellAmount = stockInPortfolio.amount;
                                            const stockRevenue = stock.price * sellAmount;
                                            const commission = stockRevenue * COMMISSION_RATE;
                                            const netRevenue = stockRevenue - commission;

                                            user.balance += netRevenue;
                                            user.portfolio = user.portfolio.filter(p => p.symbol !== stock.symbol);
                                            user.markModified('portfolio');
                                            user.history = [{
                                                id: Date.now() + Math.random(),
                                                type: 'SATIM',
                                                symbol: stock.symbol,
                                                amount: sellAmount,
                                                price: stock.price,
                                                commission: commission,
                                                total: netRevenue,
                                                date: new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' }),
                                                isAuto: true,
                                                reason: strategy + '(' + timeframe + ') Sinyali (Anında)'
                                            }, ...user.history];

                                            config.lastAction = 'SELL';
                                            userChanged = true;
                                        }
                                    }
                                }
                            } else {
                                // TUT sinyali geldiğinde lastSignal'i sıfırla ki bir sonraki AL yeni sayaç başlatsın
                                if (config.lastSignal === 'AL' && config.lastAction === 'BUY') {
                                    config.lastSignal = 'TUT';
                                    userChanged = true;
                                } else if (config.lastSignal === 'SAT' && config.lastAction === 'SELL') {
                                    config.lastSignal = 'TUT';
                                    userChanged = true;
                                }
                            }

                            // 1 Saatlik AL Sinyali Bekleme ve İşleme
                            if (config.lastSignal === 'AL' && config.lastAction !== 'BUY') {
                                if (!config.signalStartTime) {
                                    config.signalStartTime = Date.now();
                                    userChanged = true;
                                    console.log(`[BOT] signalStartTime eksikti, şimdi başlatıldı: ${user.username} | ${symbol}`);
                                }
                                const waitTimeMs = 60 * 60 * 1000; // 1 saat
                                const elapsed = Date.now() - config.signalStartTime;
                                console.log(`[BOT TIMER] ${user.username} | ${symbol} | TF: ${timeframe} | Gecen: ${Math.round(elapsed / 60000)}dk / 60dk`);

                                if (elapsed >= waitTimeMs) {
                                    const stockCost = stock.price * (config.amount || 1);
                                    const commission = stockCost * COMMISSION_RATE;
                                    const totalCost = stockCost + commission;

                                    if (user.balance >= totalCost) {
                                        user.balance -= totalCost;
                                        const existing = user.portfolio.find(p => p.symbol === stock.symbol);
                                        if (existing) {
                                            const totalOwned = existing.amount + (config.amount || 1);
                                            existing.averageCost = (existing.averageCost * existing.amount + totalCost) / totalOwned;
                                            existing.amount = totalOwned;
                                        } else {
                                            user.portfolio = [...user.portfolio, { symbol: stock.symbol, amount: (config.amount || 1), averageCost: (totalCost / (config.amount || 1)) }];
                                        }
                                        user.history = [{
                                            id: Date.now() + Math.random(),
                                            type: 'ALIM',
                                            symbol: stock.symbol,
                                            amount: config.amount || 1,
                                            price: stock.price,
                                            commission: commission,
                                            total: totalCost,
                                            date: new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' }),
                                            isAuto: true,
                                            reason: strategy + '(' + timeframe + ') Sinyali (1 Saat Gecikmeli)'
                                        }, ...user.history];

                                        config.lastAction = 'BUY';
                                        userChanged = true;
                                    } else {
                                        user.history = [{
                                            id: Date.now() + Math.random(),
                                            type: 'SİSTEM',
                                            symbol: stock.symbol,
                                            amount: 0,
                                            price: stock.price,
                                            commission: 0,
                                            total: totalCost,
                                            date: new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' }),
                                            isAuto: true,
                                            reason: `Yetersiz Bakiye! ${config.amount || 1} adet için ${totalCost.toFixed(2)} TL gerekli.`
                                        }, ...user.history];
                                        config.lastAction = 'BUY';
                                        userChanged = true;
                                    }
                                }
                            }

                            // Stop-Loss ve Take-Profit Kontrolleri
                            const stockInPortfolioSLTP = user.portfolio.find(p => p.symbol === stock.symbol);
                            if (stockInPortfolioSLTP && config.lastAction !== 'SELL') {
                                const profitPercent = ((stock.price - stockInPortfolioSLTP.averageCost) / stockInPortfolioSLTP.averageCost) * 100;
                                const isSL = config.stopLoss && profitPercent <= -Math.abs(config.stopLoss);
                                const isTP = config.takeProfit && profitPercent >= Math.abs(config.takeProfit);

                                if (isSL || isTP) {
                                    const sellAmount = stockInPortfolioSLTP.amount;
                                    const stockRevenue = stock.price * sellAmount;
                                    const commission = stockRevenue * COMMISSION_RATE;
                                    const netRevenue = stockRevenue - commission;

                                    user.balance += netRevenue;
                                    user.portfolio = user.portfolio.filter(p => p.symbol !== stock.symbol);
                                    user.markModified('portfolio');

                                    user.history = [{
                                        id: Date.now() + Math.random(),
                                        type: 'SATIM',
                                        symbol: stock.symbol,
                                        amount: sellAmount,
                                        price: stock.price,
                                        commission: commission,
                                        total: netRevenue,
                                        date: new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' }),
                                        isAuto: true,
                                        reason: isSL ? 'Stop-Loss' : 'Take-Profit'
                                    }, ...user.history];

                                    config.lastAction = 'SELL';
                                    userChanged = true;
                                }
                            }
                        }
                    }

                    if (userChanged) {
                        user.markModified('botConfigs');
                        user.markModified('portfolio');
                        user.markModified('history');
                    }
                }

                // Varlık Geçmişini Güncelle
                const currentPortfolioValue = user.portfolio.reduce((acc, item) => {
                    const mStock = marketData.find(s => s.symbol === item.symbol);
                    return acc + (mStock ? mStock.price * item.amount : 0);
                }, 0);
                const totalWealth = user.balance + currentPortfolioValue;
                user.wealthHistory = [...(user.wealthHistory || []), { time: now.toLocaleTimeString('tr-TR', { timeZone: 'Europe/Istanbul' }), wealth: totalWealth }].slice(-50);

                // Snapshotları Güncelle
                if (!user.wealthSnapshots) user.wealthSnapshots = {};
                const currentDate = now.toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul' });
                const weekStart = new Date(now);
                weekStart.setDate(now.getDate() - ((now.getDay() + 6) % 7));
                const weekStr = weekStart.toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul' });
                const monthStr = `${now.getFullYear()}-${now.getMonth() + 1}`;

                if (!user.wealthSnapshots.dayStart || user.wealthSnapshots.dayStart.date !== currentDate) {
                    user.wealthSnapshots.dayStart = { date: currentDate, wealth: totalWealth };
                    user.markModified('wealthSnapshots');
                }
                if (!user.wealthSnapshots.weekStart || user.wealthSnapshots.weekStart.date !== weekStr) {
                    user.wealthSnapshots.weekStart = { date: weekStr, wealth: totalWealth };
                    user.markModified('wealthSnapshots');
                }
                if (!user.wealthSnapshots.monthStart || user.wealthSnapshots.monthStart.date !== monthStr) {
                    user.wealthSnapshots.monthStart = { date: monthStr, wealth: totalWealth };
                    user.markModified('wealthSnapshots');
                }
                if (!user.wealthSnapshots.yearStart || user.wealthSnapshots.yearStart.date !== `${now.getFullYear()}`) {
                    user.wealthSnapshots.yearStart = { date: `${now.getFullYear()}`, wealth: totalWealth };
                    user.markModified('wealthSnapshots');
                }

                if (userChanged) {
                    try {
                        await user.save();
                        console.log(`[BOT DB UPDATE] Kullanici ${user.username} portfoyu/tarihcesi guncellendi.`);
                    } catch (e) {
                        console.error(`[CRITICAL BOT DB ERROR] Kullanici ${user.username} portfoyu KAYDEDILEMEDI:`, e.name, e.message);
                        if (e.name === 'VersionError') {
                            console.error('[VersionError] Ayni anda hem arayuzden islem yapildi hem bot tetiklendi. Kayit çakıştı!');
                        }
                    }
                }
            } // end processes
        } // end atlas block
    } catch (error) {
        console.error('Piyasa Verisi Çekme Hatası:', error);
        globalFetchError = error.stack || error.message;
    }
};

// Piyasa verilerini 20 saniyede bir güncelle
setInterval(fetchRealMarketData, 20000);

// API Endpoints
// Sinyal geçmişini temizle (Şifreli: 6019)
app.post('/api/signals/clear', async (req, res) => {
    try {
        const { password } = req.body;
        if (password !== '6019') {
            return res.status(401).json({ success: false, error: 'Hatalı şifre!' });
        }

        const result = await SignalHistory.deleteMany({});
        console.log(`🧹 Veritabanı kullanıcı isteğiyle temizlendi: ${result.deletedCount} kayıt silindi.`);
        
        // Bellekteki sinyal takibini de sıfırla
        for (const key in previousSignals) delete previousSignals[key];

        res.json({ success: true, deletedCount: result.deletedCount });
    } catch (err) {
        console.error('[API] /api/signals/clear hatası:', err.message);
        res.status(500).json({ success: false, error: 'Temizleme işlemi başarısız.' });
    }
});

app.get('/api/market', (req, res) => res.json({
    version: '5.7',
    timestamp: Date.now(),
    data: marketData,
    error: globalFetchError
}));

// Sinyal Geçmişi API - Sayfalama ve Filtreleme
app.get('/api/signals/history', async (req, res) => {
    try {
        const { symbol, timeframe, strategy, page = 1, limit = 50 } = req.query;
        const query = {};
        if (symbol) {
            query.symbol = { $regex: symbol, $options: 'i' };
        }
        if (timeframe) query.timeframe = timeframe;
        if (strategy) query.strategy = strategy;

        const p = parseInt(page);
        const l = parseInt(limit);
        const skip = (p - 1) * l;

        const total = await SignalHistory.countDocuments(query);
        const records = await SignalHistory.find(query)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(l)
            .lean();

        res.json({ 
            success: true, 
            data: records, 
            total, 
            page: p, 
            limit: l,
            totalPages: Math.ceil(total / l)
        });
    } catch (err) {
        console.error('[API] /api/signals/history hatası:', err.message);
        res.status(500).json({ success: false, error: 'Sinyal geçmişi alınamadı.' });
    }
});
// Sinyal Performans API — AL→SAT çiftleri analizi
app.get('/api/signals/performance', async (req, res) => {
    try {
        const COMMISSION_RATE = 0.0005; // %0.05 alım + %0.05 satım
        const TIMEFRAMES = ['1h', '4h', '1d'];
        const STRATEGIES = ['QQE', 'Fisher-BB-EMA', 'MACD', 'RSI'];
        const symbols = marketData.map(s => s.symbol);

        const allRecords = await SignalHistory.find({ symbol: { $in: symbols } })
            .sort({ createdAt: 1 })
            .lean();

        const result = {};

        for (const symbol of symbols) {
            result[symbol] = { QQE: {}, 'Fisher-BB-EMA': {}, MACD: {}, RSI: {}, best: null };
            let maxRate = -1;

            for (const strat of STRATEGIES) {
                for (const tf of TIMEFRAMES) {
                    const records = allRecords.filter(r => r.symbol === symbol && r.timeframe === tf && r.strategy === strat);
                    let success = 0, fail = 0, open = 0;
                    let i = 0;
                    while (i < records.length) {
                        if (records[i].signal === 'AL') {
                            const buyPrice = records[i].price;
                            let j = i + 1;
                            while (j < records.length && records[j].signal !== 'SAT') j++;
                            
                            if (j < records.length && records[j].signal === 'SAT') {
                                const sellPrice = records[j].price;
                                const totalCommission = buyPrice * COMMISSION_RATE + sellPrice * COMMISSION_RATE;
                                if (sellPrice - buyPrice > totalCommission) success++; else fail++;
                                i = j + 1;
                            } else {
                                open++; i++;
                            }
                        } else {
                            i++;
                        }
                    }
                    const total = success + fail;
                    const rate = total > 0 ? Math.round((success / total) * 100) : null;
                    
                    result[symbol][strat][tf] = { success, fail, open, total, rate };

                    if (rate !== null && rate > maxRate) {
                        maxRate = rate;
                        result[symbol].best = { strategy: strat, timeframe: tf, rate };
                    }
                }
            }
        }

        res.json({ success: true, data: result });
    } catch (err) {
        console.error('[API] /api/signals/performance hatası:', err.message);
        res.status(500).json({ success: false, error: 'Performans verisi alınamadı.' });
    }
});




app.get('/api/user/data', async (req, res) => {
    const username = req.headers['x-user']?.toLowerCase();
    if (!username) return res.status(401).json({ error: 'Yetkilendirme gerekli' });

    try {


        let user = await User.findOne({ username });
        if (!user) {
            user = await User.create(getInitialUserData(username));
        }

        // --- Snapshot İyileştirmesi: Veri istendiğinde snapshot yoksa hemen oluştur ---
        const now = new Date();
        const todayStr = now.toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul' });
        const monthStr = `${now.getFullYear()}-${now.getMonth() + 1}`;
        const yearStr = `${now.getFullYear()}`;
        const weekStart = new Date(now);
        weekStart.setDate(now.getDate() - ((now.getDay() + 6) % 7));
        const weekStr = weekStart.toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul' });

        if (!user.wealthSnapshots) user.wealthSnapshots = {};

        const currentPortfolioValue = user.portfolio.reduce((acc, item) => {
            const mStock = marketData.find(s => s.symbol === item.symbol);
            return acc + (mStock ? mStock.price * item.amount : 0);
        }, 0);
        const totalWealth = user.balance + currentPortfolioValue;

        let userUpdated = false;

        // Snapshot Kontrolleri
        if (!user.wealthSnapshots.dayStart || user.wealthSnapshots.dayStart.date !== todayStr) {
            user.wealthSnapshots.dayStart = { date: todayStr, wealth: totalWealth };
            userUpdated = true;
        }
        if (!user.wealthSnapshots.weekStart || user.wealthSnapshots.weekStart.date !== weekStr) {
            user.wealthSnapshots.weekStart = { date: weekStr, wealth: totalWealth };
            userUpdated = true;
        }
        if (!user.wealthSnapshots.monthStart || user.wealthSnapshots.monthStart.date !== monthStr) {
            user.wealthSnapshots.monthStart = { date: monthStr, wealth: totalWealth };
            userUpdated = true;
        }
        if (!user.wealthSnapshots.yearStart || user.wealthSnapshots.yearStart.date !== yearStr) {
            user.wealthSnapshots.yearStart = { date: yearStr, wealth: totalWealth };
            userUpdated = true;
        }

        // Genişletilmiş İstatistikleri Hesapla
        const history = user.history || [];
        const sellTrades = history.filter(t => t.type === 'SATIM');

        let totalWin = 0;
        const stockStats = {};

        sellTrades.forEach(trade => {
            // Kar hesabı: Satış tutarı - Maliyet
            if (trade.total > (trade.amount * trade.price * (1 - COMMISSION_RATE * 2))) {
                totalWin++;
            }
            if (!stockStats[trade.symbol]) stockStats[trade.symbol] = 0;
            stockStats[trade.symbol] += trade.total;
        });

        const winRate = sellTrades.length > 0 ? ((totalWin / sellTrades.length) * 100).toFixed(1) : 0;
        const bestStock = Object.keys(stockStats).sort((a, b) => stockStats[b] - stockStats[a])[0] || '-';

        const newStats = {
            winRate,
            bestStock,
            totalTrades: history.length,
            profitableTrades: totalWin,
            // Merkezi Hesaplamalar
            totalWealth: totalWealth,
            overallProfit: totalWealth - 100000,
            overallProfitPercent: (((totalWealth - 100000) / 100000) * 100).toFixed(2)
        };

        // Sadece değişiklik varsa kaydet
        if (userUpdated || JSON.stringify(user.stats) !== JSON.stringify(newStats)) {
            user.stats = newStats;
            if (userUpdated) user.markModified('wealthSnapshots');
            await user.save();
        }

        return res.json(user);
    } catch (err) {
        console.error('Kullanıcı Verisi API Hatası:', err);
        res.status(500).json({ error: 'Sunucu hatası', details: err.message, stack: err.stack });
    }
});

app.post('/api/trade/buy', async (req, res) => {
    const username = req.headers['x-user']?.toLowerCase();
    if (!username) return res.status(401).json({ error: 'Yetkilendirme gerekli' });

    const { symbol, amount } = req.body;
    const stock = marketData.find(s => s.symbol === symbol);
    if (!stock) return res.status(404).json({ success: false, message: 'Hisse bulunamadı.' });

    try {

        const user = await User.findOne({ username });
        if (!user) return res.status(404).json({ success: false, message: 'Kullanıcı bulunamadı.' });

        const stockCost = stock.price * amount;
        const commission = stockCost * COMMISSION_RATE;
        const totalCost = stockCost + commission;

        if (totalCost > user.balance) return res.status(400).json({ success: false, message: 'Yetersiz bakiye.' });

        user.balance -= totalCost;
        const existing = user.portfolio.find(p => p.symbol === symbol);
        if (existing) {
            const totalOwned = existing.amount + amount;
            existing.averageCost = (existing.averageCost * existing.amount + totalCost) / totalOwned;
            existing.amount = totalOwned;
        } else {
            user.portfolio = [...user.portfolio, { symbol, amount, averageCost: (totalCost / amount) }];
        }

        user.history = [{
            id: Date.now(),
            type: 'ALIM',
            symbol,
            amount,
            price: stock.price,
            commission: commission,
            total: totalCost,
            date: new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' }),
            isAuto: false,
            reason: 'Manuel İşlem'
        }, ...user.history];

        await user.save();
        res.json({ success: true, data: user });
    } catch (err) {
        console.error('Alım İşlemi Hatası:', err);
        res.status(500).json({ success: false, message: 'Sunucu hatası' });
    }
});

app.post('/api/trade/sell', async (req, res) => {
    const username = req.headers['x-user']?.toLowerCase();
    if (!username) return res.status(401).json({ error: 'Yetkilendirme gerekli' });

    const { symbol, amount } = req.body;
    try {

        const user = await User.findOne({ username });
        if (!user) return res.status(404).json({ success: false, message: 'Kullanıcı bulunamadı.' });

        const stockInPortfolio = user.portfolio.find(p => p.symbol === symbol);
        if (!stockInPortfolio || stockInPortfolio.amount < amount) {
            return res.status(400).json({ success: false, message: 'Yetersiz hisse adedi.' });
        }

        const stock = marketData.find(s => s.symbol === symbol);
        const stockRevenue = (stock ? stock.price : 0) * amount;
        const commission = stockRevenue * COMMISSION_RATE;
        const netRevenue = stockRevenue - commission;

        user.balance += netRevenue;
        stockInPortfolio.amount -= amount;
        if (stockInPortfolio.amount === 0) {
            user.portfolio = user.portfolio.filter(p => p.symbol !== symbol);
        }

        user.history = [{
            id: Date.now(),
            type: 'SATIM',
            symbol,
            amount,
            price: stock ? stock.price : 0,
            commission: commission,
            total: netRevenue,
            date: new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' }),
            isAuto: false,
            reason: 'Manuel İşlem'
        }, ...user.history];

        await user.save();
        res.json({ success: true, data: user });
    } catch (err) {
        console.error('Satım İşlemi Hatası:', err);
        res.status(500).json({ success: false, message: 'Sunucu hatası' });
    }
});

app.post('/api/user/reset', async (req, res) => {
    const username = req.headers['x-user']?.toLowerCase();
    if (!username) return res.status(401).json({ error: 'Yetkilendirme gerekli' });

    try {

        const initialData = getInitialUserData(username);
        let user = await User.findOne({ username });
        if (user) {
            user.balance = initialData.balance;
            user.portfolio = initialData.portfolio;
            user.history = initialData.history;
            user.wealthHistory = initialData.wealthHistory;
            user.stats = initialData.stats;
            user.botConfigs = initialData.botConfigs;
            // Snapshot'ları standart başlangıç değerlerine (100.000 TL) geri döndür
            user.wealthSnapshots = initialData.wealthSnapshots;
            user.markModified('wealthSnapshots');
            await user.save();
        }
        res.json({ success: true, data: user });
    } catch (err) {
        console.error('Sıfırlama Hatası:', err);
        res.status(500).json({ success: false, message: 'Sunucu hatası' });
    }
});


app.post('/api/bot/config', async (req, res) => {
    const username = req.headers['x-user']?.toLowerCase();
    if (!username) return res.status(401).json({ error: 'Yetkilendirme gerekli' });

    const { symbol, config } = req.body;
    try {
        await connectDB();
        let user = await User.findOne({ username });
        if (!user) {
            user = await User.create(getInitialUserData(username));
        }

        if (!user.botConfigs || user.botConfigs instanceof Map) {
            // Backward compatibility
            user.botConfigs = {};
        }

        const existing = user.botConfigs[symbol] || {};

        // Bot kapalıyken açıldıysa, eski sinyali unut ki sıradaki ilk AL/SAT sinyalini yakalayabilsin
        if (config.active === true && existing.active !== true) {
            existing.lastSignal = null;
            config.lastSignal = null; // config spread edildiğinde eski değeri ezmesini engelle
        }

        user.botConfigs[symbol] = { ...existing, ...config };

        user.markModified('botConfigs');
        await user.save();

        res.json({ success: true, data: user.botConfigs });
    } catch (err) {
        console.error('Bot Ayar Hatası:', err);
        res.status(500).json({ success: false, message: 'Sunucu hatası' });
    }
});

// ==================== KAP HABER API'LERİ ====================

/**
 * GET /api/kap-news
 * Tüm izlenen hisseler için son haberleri döner.
 * Query params: ?symbol=THYAO&limit=20
 */
app.get('/api/kap-news', async (req, res) => {
    try {
        const { symbol, limit = 30 } = req.query;
        const query = {};

        if (symbol) {
            // Birden fazla sembol virgülle gelebilir: ?symbol=THYAO,GARAN
            const symbols = symbol.split(',').map(s => s.trim().replace('.IS', '').toUpperCase());
            query.symbol = { $in: symbols };
        }

        const news = await KapNews.find(query)
            .sort({ publishedAt: -1 })
            .limit(parseInt(limit))
            .lean();

        res.json({ success: true, data: news, total: news.length });
    } catch (err) {
        console.error('[API] /api/kap-news hatası:', err.message);
        res.status(500).json({ success: false, error: 'Haberler alınamadı.' });
    }
});

/**
 * GET /api/kap-news/:symbol
 * Belirli bir hisse için son haberleri döner.
 */
app.get('/api/kap-news/:symbol', async (req, res) => {
    try {
        const symbol = req.params.symbol.replace('.IS', '').toUpperCase();
        const limit = parseInt(req.query.limit) || 20;

        const news = await KapNews.find({ symbol })
            .sort({ publishedAt: -1 })
            .limit(limit)
            .lean();

        res.json({ success: true, data: news, symbol });
    } catch (err) {
        console.error(`[API] /api/kap-news/${req.params.symbol} hatası:`, err.message);
        res.status(500).json({ success: false, error: 'Haberler alınamadı.' });
    }
});
/**
 * POST /api/kap-news/:id/analyze
 * Belirli bir haber için anında AI yorumu üretir.
 */
app.post('/api/kap-news/:id/analyze', async (req, res) => {
    try {
        const { id } = req.params;
        const newsItem = await KapNews.findById(id);
        
        if (!newsItem) {
            return res.status(404).json({ success: false, error: 'Haber bulunamadı.' });
        }

        if (newsItem.aiComment) {
            return res.json({ success: true, aiComment: newsItem.aiComment });
        }

        const { generateCommentForNews } = require('./services/geminiService');
        const comment = await generateCommentForNews(newsItem);
        
        if (comment) {
            newsItem.aiComment = comment;
            newsItem.aiCommentAt = new Date();
            await newsItem.save();
            res.json({ success: true, aiComment: comment });
        } else {
            res.status(500).json({ success: false, error: 'Yorum üretilemedi (API hatası veya kota sorunu).' });
        }
    } catch (err) {
        console.error(`[API] /api/kap-news/analyze hatası:`, err.message);
        res.status(500).json({ success: false, error: 'Yorum üretirken bir hata oluştu.' });
    }
});

// ==================== FRONTEND STATIC ====================

// Serve frontend static files
app.use(express.static(path.join(__dirname, '../dist')));

// Catch-all route to serve the frontend's index.html for unknown paths (SPA routing)
app.use((req, res, next) => {
    // Exclude /api routes from this catch-all just in case
    if (req.path.startsWith('/api/')) {
        return res.status(404).json({ error: 'API endpoint not found' });
    }
    res.sendFile(path.join(__dirname, '../dist', 'index.html'));
});

/**
 * Veritabanındaki en son sinyalleri yükleyerek previousSignals nesnesini ilkleştirir.
 * Bu sayede sunucu yeniden başladığında mükerrer kayıt oluşması önlenir.
 */
const initializePreviousSignals = async () => {
    try {
        console.log('🔄 Sinyal geçmişi veritabanından yükleniyor ve temizleniyor...');
        const STRATEGIES = ['QQE', 'Fisher-BB-EMA', 'MACD', 'RSI'];
        const TIMEFRAMES = ['1h', '4h', '1d'];
        const symbols = BIST_STOCK_SYMBOLS.map(s => s.symbol);

        // 1. Mükerrer kayıtları temizle (Strateji bazlı)
        const allRecords = await SignalHistory.find({})
            .sort({ symbol: 1, strategy: 1, timeframe: 1, createdAt: 1 })
            .lean();

        const idsToDelete = [];
        let lastRecord = null;
        for (const record of allRecords) {
            if (lastRecord && 
                lastRecord.symbol === record.symbol && 
                lastRecord.strategy === record.strategy && 
                lastRecord.timeframe === record.timeframe && 
                lastRecord.signal === record.signal) {
                idsToDelete.push(record._id);
            } else {
                lastRecord = record;
            }
        }

        if (idsToDelete.length > 0) {
            const delResult = await SignalHistory.deleteMany({ _id: { $in: idsToDelete } });
            console.log(`🧹 ${delResult.deletedCount} adet mükerrer kayıt temizlendi.`);
        }

        // 2. Son sinyalleri belleğe yükle
        for (const symbol of symbols) {
            for (const strat of STRATEGIES) {
                for (const tf of TIMEFRAMES) {
                    const lastSignal = await SignalHistory.findOne({ symbol, strategy: strat, timeframe: tf })
                        .sort({ createdAt: -1 })
                        .lean();

                    if (lastSignal) {
                        const sigKey = `${symbol}_${strat}_${tf}`;
                        previousSignals[sigKey] = lastSignal.signal;
                        
                        // Geriye dönük uyumluluk: Eğer QQE ise eski anahtar formatını da doldur
                        if (strat === 'QQE') {
                            previousSignals[`${symbol}_${tf}`] = lastSignal.signal;
                        }
                    }
                }
            }
        }
        console.log(`✅ ${Object.keys(previousSignals).length} adet son sinyal durumu başarıyla yüklendi.`);
    } catch (err) {
        console.error('❌ Sinyal geçmişi yüklenirken/temizlenirken hata:', err.message);
    }
};

app.listen(PORT, '0.0.0.0', async () => {
    console.log(`Sunucu ${PORT} portunda çalışıyor`);
    try {
        await connectDB();
        // Sinyal durumlarını yükle
        await initializePreviousSignals();
        // KAP bildirim takip servisini başlat
        startKapPollingService();
    } catch (e) {
        console.error('Veritabanı başlatma hatası:', e.message);
    }
});
