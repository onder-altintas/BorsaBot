// test_macd_logic.cjs
const calcEMAArray = (data, period) => {
    const k = 2 / (period + 1);
    const emaArr = [data[0]];
    for (let i = 1; i < data.length; i++) {
        emaArr.push(data[i] * k + emaArr[i - 1] * (1 - k));
    }
    return emaArr;
};

const calculateMACD = (prices) => {
    if (prices.length < 26) return { line: 0, signal: 0, hist: 0, prevLine: 0, prevSignal: 0 };
    const ema12Arr = calcEMAArray(prices, 12);
    const ema26Arr = calcEMAArray(prices, 26);
    const macdLineArr = ema12Arr.map((e12, i) => e12 - ema26Arr[i]);
    const signalLineArr = calcEMAArray(macdLineArr, 9);
    const n = macdLineArr.length - 1;
    return { 
        line: macdLineArr[n], 
        signal: signalLineArr[n], 
        prevLine: macdLineArr[n - 1] || 0, 
        prevSignal: signalLineArr[n - 1] || 0 
    };
};

const calculateMACDSignal = (history) => {
    if (history.length < 35) return 'TUT';
    const prices = history.map(h => h.price);
    const { line, signal, prevLine, prevSignal } = calculateMACD(prices);
    
    const crossover  = prevLine <= prevSignal && line > signal;
    const crossunder = prevLine >= prevSignal && line < signal;
    
    console.log(`Debug Check -> Crossover: ${crossover}, Crossunder: ${crossunder}`);
    
    if (crossover)  return 'AL';
    if (crossunder) return 'SAT';
    return 'TUT';
};

console.log("--- MACD STRATEJİ DOĞRULAMA TESTİ ---");

const goldenHistory = [];
for(let i=0; i<30; i++) goldenHistory.push({ price: 100 - i });
for(let i=0; i<10; i++) goldenHistory.push({ price: 70 + (i * 10) });

const gSig = calculateMACDSignal(goldenHistory);
const g = calculateMACD(goldenHistory.map(h => h.price));
console.log(`[Golden Cross Test] -> Sonuç: ${gSig}, PrevLine: ${g.prevLine.toFixed(4)}, PrevSig: ${g.prevSignal.toFixed(4)}, CurrLine: ${g.line.toFixed(4)}, CurrSig: ${g.signal.toFixed(4)}`);

const deathHistory = [];
for(let i=0; i<30; i++) deathHistory.push({ price: 100 + i });
for(let i=0; i<10; i++) deathHistory.push({ price: 130 - (i * 10) });

const dSig = calculateMACDSignal(deathHistory);
const d = calculateMACD(deathHistory.map(h => h.price));
console.log(`[Death Cross Test] -> Sonuç: ${dSig}, PrevLine: ${d.prevLine.toFixed(4)}, PrevSig: ${d.prevSignal.toFixed(4)}, CurrLine: ${d.line.toFixed(4)}, CurrSig: ${d.signal.toFixed(4)}`);
