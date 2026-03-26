// test_rsi_logic.cjs
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

const calculateRSISignal = (history) => {
    if (history.length < 20) return 'TUT';
    const prices = history.map(h => h.price);
    const rsiArr = calculateRSISeries(prices, 14);
    const n = rsiArr.length - 1;
    const currRSI = rsiArr[n];
    const prevRSI = rsiArr[n - 1] || 50;
    
    const crossover30 = prevRSI <= 30 && currRSI > 30;
    const crossdown70 = prevRSI >= 70 && currRSI < 70;
    
    if (crossover30) return 'AL';
    if (crossdown70) return 'SAT';
    return 'TUT';
};

console.log("--- RSI STRATEJİ DOĞRULAMA TESTİ ---");

// Senaryo 1: Aşırı Satımdan Çıkış (AL)
const buyHistory = [];
for(let i=0; i<20; i++) buyHistory.push({ price: 100 - i * 5 }); // RSI'ı iyice düşür (örn: 10-20 arası)
for(let i=0; i<3; i++) buyHistory.push({ price: 20 + i * 20 }); // RSI'ı hızla yükselt (30'u yukarı kes)
const buySig = calculateRSISignal(buyHistory);
const buyRSI = calculateRSISeries(buyHistory.map(h => h.price), 14).slice(-1)[0];
const buyPrevRSI = calculateRSISeries(buyHistory.map(h => h.price), 14).slice(-2)[0];
console.log(`[Senaryo 1: AL] Prev RSI: ${buyPrevRSI.toFixed(2)}, Curr RSI: ${buyRSI.toFixed(2)}, Sonuç: ${buySig}`);

// Senaryo 2: Aşırı Alımdan Çıkış (SAT)
const sellHistory = [];
for(let i=0; i<20; i++) sellHistory.push({ price: 100 + i * 5 }); // RSI'ı iyice yükselt (örn: 80-90 arası)
for(let i=0; i<3; i++) sellHistory.push({ price: 200 - i * 30 }); // RSI'ı hızla düşür (70'i aşağı kes)
const sellSig = calculateRSISignal(sellHistory);
const sellRSI = calculateRSISeries(sellHistory.map(h => h.price), 14).slice(-1)[0];
const sellPrevRSI = calculateRSISeries(sellHistory.map(h => h.price), 14).slice(-2)[0];
console.log(`[Senaryo 2: SAT] Prev RSI: ${sellPrevRSI.toFixed(2)}, Curr RSI: ${sellRSI.toFixed(2)}, Sonuç: ${sellSig}`);
