// Volume Momentum Script (TradingView Implementation in JS)
const mockHistory = [
    { price: 100, volume: 1000 },
    { price: 102, volume: 1200 },
    { price: 101, volume: 800 },
    { price: 105, volume: 1500 },
    { price: 104, volume: 900 },
    { price: 107, volume: 1800 },
    { price: 106, volume: 1100 },
    { price: 110, volume: 2000 }
];

const prices = mockHistory.map(h => h.price);
const volumes = mockHistory.map(h => h.volume);

const vEmaLen = 25; // TV is 25 but let's test with small array
// TV ta.roc(close, 1) = (close - close[1]) / close[1] * 100
// Note: Some sources say roc is 100*(current-prev)/prev, others just (current-prev)/prev. We will use 100*(cur-prev)/prev

let nRes1_array = [0];
let nRes2_array = [0];

for (let i = 1; i < mockHistory.length; i++) {
    let xROC = ((prices[i] - prices[i - 1]) / prices[i - 1]) * 100;

    let prevRes1 = nRes1_array[i - 1];
    let prevRes2 = nRes2_array[i - 1];

    let curRes1 = (volumes[i] < volumes[i - 1]) ? (prevRes1 + xROC) : prevRes1;
    let curRes2 = (volumes[i] > volumes[i - 1]) ? (prevRes2 + xROC) : prevRes2;

    nRes1_array.push(curRes1);
    nRes2_array.push(curRes2);
}

const sma = (arr, len) => {
    if (arr.length === 0) return 0;
    const period = Math.min(arr.length, len);
    const slice = arr.slice(-period);
    return slice.reduce((a, b) => a + b, 0) / period;
};

let nRes3 = nRes1_array[nRes1_array.length - 1] + nRes2_array[nRes2_array.length - 1];
let nResEMA3 = sma(nRes1_array, vEmaLen) + sma(nRes2_array, vEmaLen);

let isVolBullish = nRes3 > nResEMA3;

console.log("nRes1_array:", nRes1_array);
console.log("nRes2_array:", nRes2_array);
console.log("nRes3:", nRes3, "nResEMA3:", nResEMA3, "isVolBullish:", isVolBullish);
